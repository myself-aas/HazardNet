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
 * fails closed on the first request.
 *
 * One data point per event, not per batch: Analytics Engine counts writes per data point, and
 * the batch cap (50) is what keeps a single invocation inside the 250-writes-per-invocation
 * limit with a factor of five to spare.
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
  env: { ANALYTICS?: AnalyticsEngineDataset };
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
function record(
  analytics: AnalyticsEngineDataset | undefined,
  event: { event: string; at: number; properties: Record<string, unknown> },
  sessionId: string
): void {
  if (analytics && typeof analytics.writeDataPoint === 'function') {
    analytics.writeDataPoint({
      blobs: [event.event, sessionId, JSON.stringify(event.properties)],
      doubles: [event.at],
      indexes: [sessionId],
    });
    return;
  }
  // The documented fallback: one bounded line per event, the same shape the Node handler
  // emits, so a log-based reader keeps working before the binding is added.
  // eslint-disable-next-line no-console -- stdout IS the fallback sink, as in the Node handler.
  console.log(JSON.stringify({
    tag: 'analytics',
    sessionId,
    event: event.event,
    properties: event.properties,
    at: event.at,
  }));
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env } = context;

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

  for (const event of result.batch.events) {
    record(env.ANALYTICS, event, result.batch.sessionId);
  }

  // 204 with no body, matching the Node runtime and the beacon's expectations. The middleware
  // in `functions/_middleware.ts` drops the body for this status deliberately — constructing
  // a `Response` with one throws.
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
