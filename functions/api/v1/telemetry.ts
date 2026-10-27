/**
 * `POST /api/v1/telemetry` — the analytics beacon's sink, on the edge (Action 12).
 *
 * The only unauthenticated write surface in the deployment, so the same rules apply as on
 * the Node runtime and they are *imported*, not re-typed: `backend/utils/telemetryBatch.js`
 * bounds the body (64 KiB, checked before parsing), the batch (50 events), the vocabulary
 * (lowercase snake_case) and the property values. Both runtimes therefore accept and refuse
 * exactly the same payloads.
 *
 * WHERE THE EVENTS GO. Two sinks, in this order:
 *
 *   1. **Workers Analytics Engine** when the `ANALYTICS` binding exists — one data point per
 *      event, queryable with SQL, 100k points/day and three months of retention on the free
 *      plan. This is Action 12's chosen sink: no drain, no warehouse, no second account.
 *   2. **One bounded JSON log line per event** when it does not. That is the Node runtime's
 *      transport, kept as the fallback on purpose: a deployment that has not added the
 *      binding yet still accepts the beacon and still leaves a readable trail in
 *      `wrangler pages deployment tail`, and it does so without silently pretending to have
 *      stored anything.
 *
 * The binding is **dashboard-side** for a Git-integrated Pages project — there is no
 * `wrangler.toml` in this repository and adding one would not affect the deployment. That is
 * why the fallback is code and the binding is an owner action
 * (`docs/ops/owner-actions.md` Action 12), rather than an "assumed present" dependency that
 * fails closed on the first request. Cloudflare's own docs add two constraints the owner has
 * to honour: a binding only takes effect after a **redeploy**, and an Analytics Engine
 * binding **cannot be used locally** — so the bound path is pin-able only by tests with a
 * stub, and by a SQL query against the live dataset.
 *
 * One data point per event, not per batch: Analytics Engine counts writes per data point, and
 * the batch cap (50) is what keeps a single invocation inside the 250-writes-per-invocation
 * limit with a factor of five to spare.
 *
 * Phase 6 — **Production-only, fail-open.** Bindings can be scoped to Production or Preview
 * in the Pages dashboard. If someone binds `ANALYTICS` to a Preview deployment by mistake,
 * unreleased builds would write into the production dataset. The request hostname is the one
 * fact the Function has without a new binding, so a request that is not on the two production
 * hosts never touches `writeDataPoint` — it takes the log sink instead and emits one warning.
 * A `writeDataPoint` that throws (quota, bad dataset, transient edge error) is caught and
 * falls back to the same log line: a telemetry sink must never turn a valid beacon into a
 * 500. `env` itself is optional for the same reason.
 */

import {
  BODY_MAX_BYTES,
  validateTelemetryBatch,
} from '../../../backend/utils/telemetryBatch.js';

/** The `writeDataPoint` shape this route uses; kept local so it can be stubbed in tests. */
interface AnalyticsEngineDataset {
  writeDataPoint: (point: {
    blobs?: string[];
    doubles?: number[];
    indexes?: string[];
  }) => void;
}

interface PagesContext {
  request: Request;
  // Optional: a Page Function can be invoked in a context without bindings (unit tests,
  // local dev, a Preview deployment with no Production bindings). Never dereference blindly.
  env?: { ANALYTICS?: AnalyticsEngineDataset };
}

/** The only hosts whose telemetry belongs in the production Analytics Engine dataset. */
const PRODUCTION_HOSTS = new Set(['www.hazardnet.live', 'hazardnet.live']);

/**
 * `*.pages.dev` previews and `localhost` are never production, even if a Production-scoped
 * binding is accidentally visible there. No new env var is needed — a Vite build flag is
 * baked into frontend code and cannot be trusted by a server-side write decision.
 */
function requestHostname(request: Request): string {
  try {
    return new URL(request.url).hostname.toLowerCase();
  } catch {
    return '(unparseable url)';
  }
}

function isProductionRequest(request: Request): boolean {
  return PRODUCTION_HOSTS.has(requestHostname(request));
}

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

/**
 * Write one event to Analytics Engine, or to the log when there is no binding.
 *
 * `indexes` carries the session id so a `WHERE index1 = …` query can pull one session's
 * events; Analytics Engine allows a single 96-byte index and the validator caps the session
 * at 64 characters. Properties are serialised into a blob rather than flattened into
 * `double1..double20`: they are heterogeneous (string, number, boolean, null), and JSON keeps
 * them queryable with `JSONExtractString` without inventing one column per key.
 */
/** The documented fallback: one bounded line per event, the Node handler's exact shape. */
function logEvent(
  event: { event: string; at: number; properties: Record<string, unknown> },
  sessionId: string
): void {
  // eslint-disable-next-line no-console -- stdout IS the fallback sink, as in the Node handler.
  console.log(JSON.stringify({
    tag: 'analytics',
    sessionId,
    event: event.event,
    properties: event.properties,
    at: event.at,
  }));
}

function record(
  analytics: AnalyticsEngineDataset | undefined,
  event: { event: string; at: number; properties: Record<string, unknown> },
  sessionId: string
): void {
  if (analytics && typeof analytics.writeDataPoint === 'function') {
    try {
      analytics.writeDataPoint({
        blobs: [event.event, sessionId, JSON.stringify(event.properties)],
        doubles: [event.at],
        indexes: [sessionId],
      });
      return;
    } catch (error) {
      // A broken binding is a monitoring problem, not a visitor-facing error. Name it once
      // per event so `wrangler pages deployment tail` shows the reason, then keep the event.
      console.warn('[telemetry] ANALYTICS.writeDataPoint failed; using the log sink:',
        error instanceof Error ? error.message : String(error));
    }
  }
  logEvent(event, sessionId);
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request } = context;
  const env = context.env ?? {};

  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405, { allow: 'POST' });
  }

  // Read as text and bound *before* parsing: `await request.json()` would buffer a body of
  // any size, and this is the one endpoint a stranger can post to without credentials.
  const raw = await request.text();
  if (raw.length > BODY_MAX_BYTES) {
    return json({ error: 'payload too large' }, 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'body must be valid JSON' }, 400);
  }

  const result = validateTelemetryBatch(payload);
  if (!result.ok) {
    return json({ error: result.error }, 400);
  }

  // Production-only guard: a Preview deployment with an accidentally shared binding must
  // not write unreleased-build traffic into the production dataset.
  const production = isProductionRequest(request);
  if (!production && env.ANALYTICS) {
    console.warn('[telemetry] ANALYTICS is bound on a non-production host; using the log sink:',
      requestHostname(request));
  }
  const analytics = production ? env.ANALYTICS : undefined;
  for (const event of result.batch.events) {
    record(analytics, event, result.batch.sessionId);
  }

  // 204 with no body, matching the Node runtime and the beacon's expectations. The middleware
  // in `functions/_middleware.ts` drops the body for this status deliberately — constructing
  // a `Response` with one throws.
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
