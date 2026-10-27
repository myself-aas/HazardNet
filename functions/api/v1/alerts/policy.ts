/**
 * `GET /api/v1/alerts/policy` — the thresholds and caveats in force, on the edge.
 *
 * This is the alert family's dependency-free entry and the one an uptime probe hits. It is
 * also the endpoint whose *meaning* changes on the edge, so the change is stated here
 * rather than left to be discovered:
 *
 *   - In Node it is computed per request from the process environment via `getPolicy()`.
 *   - A Worker has no `process.env`, and the Cloudflare project's environment is not the
 *     pipeline's — recomputing here could describe a policy the engine never used. That is
 *     worse than an error: it would tell a reader that a WARNING needs X when the run that
 *     produced the alerts used Y.
 *   - So the builder stamps the effective policy into the artifact
 *     (`stampPolicy` in `scripts/build_alert_snapshot.mjs`, run in the same job and the same
 *     environment as the engine) and this route serves that record. `policy_source` says
 *     who wrote it: `engine` when the run report carried its own policy, `builder` when the
 *     snapshot job stamped it. That key is the one field this route adds to the Node
 *     envelope, and `__tests__/pagesAlerts.test.js` pins the delta to exactly that.
 *
 * If the deployed artifact has no policy block, this answers 503 rather than a default: an
 * endpoint whose whole purpose is "the policy in force" must not invent one.
 */

import { ALERT_LEVELS } from '../../../../backend/alerts/policy.js';
import { ALERT_STATES } from '../../../../backend/alerts/lifecycle.js';
import { loadAlertSnapshot, policyEnvelopeFromSnapshot } from '../../../../backend/utils/alertSnapshotServe.js';

interface PagesContext {
  request: Request;
  env: { ASSETS?: { fetch: (input: Request) => Promise<Response> } };
}

function json(body: unknown, status: number, cacheControl: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
    },
  });
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  const loaded = await loadAlertSnapshot(env, request);
  if ('error' in loaded) {
    console.error('[alerts/policy] snapshot unavailable:', loaded.error);
    return json({ error: 'alerts snapshot is unavailable', detail: loaded.error }, 503, 'no-store');
  }

  const body = policyEnvelopeFromSnapshot(loaded.snapshot, {
    levels: ALERT_LEVELS,
    states: ALERT_STATES,
  });
  if (!body) {
    console.error('[alerts/policy] the snapshot carries no policy block');
    return json(
      {
        error: 'the alerts snapshot carries no policy block',
        detail: 're-run scripts/build_alert_snapshot.mjs (it stamps the effective policy) and redeploy',
      },
      503,
      'no-store'
    );
  }

  // Same cache window as the Node handler: the policy changes only when a deployment changes
  // its environment, and five minutes of staleness on thresholds nobody edits by hand is
  // cheaper than a Function invocation per reader.
  return json(body, 200, 'public, max-age=300');
}
