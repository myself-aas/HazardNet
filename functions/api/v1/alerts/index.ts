/**
 * `GET /api/v1/alerts` — the deployed alert list, on the edge.
 *
 * Route shape note: this is `alerts/index.ts`, not `alerts/[action].ts`. In the Node
 * surface the list is served by `api/v1/[resource].js` and only the *actions*
 * (`evidence-card`, `policy`, `review`, `run`) go through `api/v1/alerts/[action].js`, so
 * Pages' file routing has to reproduce that split: `functions/api/v1/alerts/index.ts`
 * answers `/api/v1/alerts` and `functions/api/v1/alerts/policy.ts` answers
 * `/api/v1/alerts/policy`.
 *
 * What this route is: the list the site's own client calls first (`ALERTS_API_URL` in
 * `frontend/src/lib/alerts.ts`), anonymous, public state only, served from the deployed
 * artifact. What it is not: the review surface. `evidence-card`, `review` and `run` stay
 * unhosted — the first is store-backed and the other two are authenticated writes that
 * must not live on a metered edge runtime.
 *
 * The two behaviours worth knowing, both inherited deliberately from
 * `serverless/v1/alerts/index.js`:
 *
 *   1. **An unknown state is a 400; a known-but-unprivileged state is silently narrowed.**
 *      `?state=DRAFT` (a real state name) coerces to `PUBLISHED` for an anonymous caller
 *      rather than erroring, because a caller asking for more than it may see gets the
 *      public list, not a hint about what else exists. Only a *malformed* value is rejected.
 *   2. **Rows are filtered on `state === 'PUBLISHED'` even though the artifact is already
 *      filtered.** A snapshot built by an older or buggy builder must degrade to "fewer
 *      alerts", never to "unreviewed alerts on the public map" — the same belt-and-braces
 *      rule the client applies in `parseAlertsPayload`.
 */

import { ALERT_LEVELS } from '../../../../backend/alerts/policy.js';
import { ALERT_STATES } from '../../../../backend/alerts/lifecycle.js';
import { publicAlertView } from '../../../../backend/alerts/publicView.js';
import {
  DEFAULT_MAX_ALERTS,
  PUBLIC_ALERT_STATE,
  filterAlerts,
  listEnvelopeFromSnapshot,
  loadAlertSnapshot,
} from '../../../../backend/utils/alertSnapshotServe.js';
import { CACHE, respond, respondError } from '../../../../backend/edge/response';
import { pathOf } from '../../../../packages/api/src/endpoints';

/** The Node handler's anonymous branch window, kept as a named constant. */
const LIST_CACHE = CACHE.publicFor(60);

/** The subset of the Pages `EventContext` this route uses (see `backend/edge/response.js`). */
interface PagesContext {
  request: Request;
  env: { ASSETS?: { fetch: (input: Request) => Promise<Response> } };
}

interface AlertRow {
  state?: string;
  level?: string;
  horizon?: string;
  district_id?: number;
  published_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  const params = new URL(request.url).searchParams;
  const requestedState = params.get('state') ? String(params.get('state')).toUpperCase() : null;
  if (requestedState && !ALERT_STATES.includes(requestedState)) {
    return respond({ error: `unknown state ${requestedState}` }, { status: 400 });
  }
  const level = params.get('level') ? String(params.get('level')).toUpperCase() : null;
  if (level && !ALERT_LEVELS.includes(level)) {
    return respond({ error: `unknown level ${level}` }, { status: 400 });
  }

  const horizon = params.get('horizon') || null;
  const districtId = params.get('district_id') || params.get('districtId') || null;
  const requestedLimit = Number(params.get('limit'));
  const max = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : DEFAULT_MAX_ALERTS;

  const loaded = await loadAlertSnapshot(env, request);
  if ('error' in loaded) {
    return respondError(new Error(loaded.error), {
      scope: 'api/v1/alerts',
      status: 503,
      fallback: 'alerts snapshot is unavailable',
    });
  }

  const rows = (loaded.snapshot.alerts as AlertRow[]).filter(
    (alert) => alert && alert.state === PUBLIC_ALERT_STATE
  );

  const alerts = filterAlerts(rows, {
    // Anonymous callers see PUBLISHED and nothing else: a requested state is echoed in
    // `filters` but never used to widen the query, exactly as the Node handler does.
    state: PUBLIC_ALERT_STATE,
    level,
    horizon,
    districtId,
    max,
  });

  const view = alerts.map((alert) => publicAlertView(alert));

  // `public, max-age=60` matches the Node handler's anonymous branch: the payload carries a
  // per-response `generated_at`, and a minute of staleness on a list that only changes when
  // a human reviews an alert is the deliberate trade for not invoking a Function per view.
  return respond(
    listEnvelopeFromSnapshot(loaded.snapshot, {
      alerts: view,
      // The Node handler echoes the *effective* state, not the requested one: an anonymous
      // caller asking for DRAFT gets `filters.state: "PUBLISHED"`, which is the honest
      // answer (that is what it was served). Caught by `pagesAlerts` parity, not by review.
      filters: { state: PUBLIC_ALERT_STATE, level, horizon, district_id: params.get('district_id') },
    }),
    { cache: LIST_CACHE }
  );
}

/** The path this file answers. The table is `packages/api/src/endpoints.ts`. */
export const ROUTE_PATH = pathOf('alerts');
