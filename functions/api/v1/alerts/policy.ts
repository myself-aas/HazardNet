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
import { CACHE, respond, respondError } from '../../../../backend/edge/response';
import { pathOf } from '../../../../packages/api/src/endpoints';

/** The Node handler's window: thresholds change only when a deployment changes. */
const POLICY_CACHE = CACHE.publicFor(300);

/** The subset of the Pages `EventContext` this route uses (see `backend/edge/response.js`). */
interface PagesContext {
  request: Request;
  env: { ASSETS?: { fetch: (input: Request) => Promise<Response> } };
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  const loaded = await loadAlertSnapshot(env, request);
  if ('error' in loaded) {
    return respondError(new Error(loaded.error), {
      scope: 'api/v1/alerts/policy',
      status: 503,
      fallback: 'alerts snapshot is unavailable',
    });
  }

  const body = policyEnvelopeFromSnapshot(loaded.snapshot, {
    levels: ALERT_LEVELS,
    states: ALERT_STATES,
  });
  if (!body) {
    // The remedy is an operator instruction, so it is logged rather than served: a 503 body
    // that names a build script is a hint about the deployment's internals.
    return respondError(new Error('the alerts snapshot carries no policy block'), {
      scope: 'api/v1/alerts/policy',
      status: 503,
      fallback: 'the alerts snapshot carries no policy block',
    });
  }

  // Same cache window as the Node handler: five minutes of staleness on thresholds nobody
  // edits by hand is cheaper than a Function invocation per reader.
  return respond(body, { cache: POLICY_CACHE });
}

/** The path this file answers. The table is `packages/api/src/endpoints.ts`. */
export const ROUTE_PATH = pathOf('alertsPolicy');
