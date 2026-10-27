/**
 * The alerts API's snapshot-backed read path — envelopes built from the deployed artifact
 * `frontend/public/data/alerts-latest.json`.
 *
 * Same reasoning as `./forecastSnapshotServe.js`, and the same three constraints: a Worker
 * cannot load `firebase-admin`, per-request store reads would spend Spark's 50k/day bucket
 * on bytes already on the CDN, and serving the API from the artifact the client falls back
 * to means the two can never disagree about which alerts are live.
 *
 * What is *not* the same as forecasts: filtering and ordering. In the Node runtimes those
 * happen in the store (`listDocuments` applies `where` clauses and a `limit`, then
 * `listAlerts` sorts by `published_at || created_at` descending). The edge has no store, so
 * this module reimplements them — and reimplementation is exactly the drift this repository
 * keeps getting bitten by, so `__tests__/pagesAlerts.test.js` runs the Node handler and the
 * edge handler over the same rows and compares ids, order, counts and envelopes.
 *
 * KEEP THIS MODULE PLATFORM-NEUTRAL. No node built-ins; the only host object it touches is
 * the `ASSETS` binding passed in by the caller.
 */

/** The committed snapshot, served as a static asset from the deployment root. */
export const ALERTS_SNAPSHOT_PATH = '/data/alerts-latest.json';

/**
 * @typedef {object} AlertRow
 * @property {string} [state]
 * @property {string} [level]
 * @property {string} [horizon]
 * @property {number} [district_id]
 * @property {string} [published_at]
 * @property {string} [created_at]
 *
 * @typedef {object} AlertSnapshot
 * @property {AlertRow[]} alerts
 * @property {string} [policy_version]
 * @property {object|null} [policy]
 * @property {object|null} [transports]
 * @property {'engine'|'builder'} [policy_source]
 * @property {string} [disclaimer]
 * @property {string} [generated_at]
 *
 * @typedef {object} AlertFilters
 * @property {string|null} [state]
 * @property {string|null} [level]
 * @property {string|null} [horizon]
 * @property {string|number|null} [districtId]
 * @property {number} [max]
 */

/** Anonymous readers see only this state, always. §1.3/§1.6. */
export const PUBLIC_ALERT_STATE = 'PUBLISHED';

/** The Node runtimes' page size and ceiling, restated here so the edge cannot answer more. */
export const DEFAULT_MAX_ALERTS = 200;
export const MAX_ALERTS_CEILING = 500;

/**
 * Read the snapshot through the Pages `ASSETS` binding. Same contract as the forecast
 * loader: `{snapshot}` or `{error}`, so every caller can turn a failure into a named status.
 */
/**
 * @param {{ ASSETS?: { fetch: (input: Request) => Promise<Response> } }} env
 * @param {Request} request
 * @returns {Promise<{ snapshot: AlertSnapshot } | { error: string }>}
 */
export async function loadAlertSnapshot(env, request) {
  const assets = env && env.ASSETS;
  if (!assets || typeof assets.fetch !== 'function') {
    return { error: 'the ASSETS binding is not available to this Function' };
  }

  let response;
  try {
    response = await assets.fetch(
      new Request(new URL(ALERTS_SNAPSHOT_PATH, request.url), {
        headers: { accept: 'application/json' },
      })
    );
  } catch (error) {
    return { error: `the alerts snapshot could not be read (${error && error.message ? error.message : 'unknown error'})` };
  }

  if (!response || !response.ok) {
    return { error: `the alerts snapshot answered ${response ? response.status : 'no response'}` };
  }

  let snapshot;
  try {
    snapshot = await response.json();
  } catch {
    return { error: 'the alerts snapshot is not JSON' };
  }

  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.alerts)) {
    return { error: 'the alerts snapshot carries no `alerts` array' };
  }

  return { snapshot };
}

/**
 * Apply the query to the artifact's rows, the way the store would.
 *
 * Order matters and is deliberate: filter → sort → slice. The Node store filters and
 * limits in the query and sorts afterwards, which means its `limit` picks an arbitrary
 * subset before ordering. Sorting first is stricter (the caller gets the newest N matching
 * rows rather than N arbitrary ones) and cannot return rows that fail a filter.
 */
/**
 * @param {AlertRow[]} rows
 * @param {AlertFilters} [options]
 * @returns {AlertRow[]}
 */
export function filterAlerts(rows, { state, level, horizon, districtId, max = DEFAULT_MAX_ALERTS } = {}) {
  const filtered = rows.filter((alert) => {
    if (!alert || typeof alert !== 'object') return false;
    if (state && alert.state !== state) return false;
    if (level && alert.level !== level) return false;
    if (horizon && alert.horizon !== horizon) return false;
    // The store compares numerically (`Number(d.district_id) === Number(districtId)`), and a
    // query string is always a string, so a string compare here would silently match nothing.
    if (districtId !== undefined && districtId !== null && districtId !== ''
      && Number(alert.district_id) !== Number(districtId)) return false;
    return true;
  });

  filtered.sort((left, right) => String(right.published_at || right.created_at || '')
    .localeCompare(String(left.published_at || left.created_at || '')));

  const limit = Number.isFinite(max) && max > 0 ? Math.min(max, MAX_ALERTS_CEILING) : DEFAULT_MAX_ALERTS;
  return filtered.slice(0, limit);
}

/** `{state: n}` over a list — the store's `stateCounts`, restated. */
/** @param {AlertRow[]} [alerts] @returns {Record<string, number>} */
export function stateCounts(alerts = []) {
  const counts = {};
  for (const alert of alerts) counts[alert.state] = (counts[alert.state] || 0) + 1;
  return counts;
}

/** `{level: n}` over the *projected* rows — what the Node handler calls `counts`. */
/** @param {AlertRow[]} [view] @returns {Record<string, number>} */
export function levelCounts(view = []) {
  return view.reduce((acc, alert) => {
    const level = String(alert.level || '');
    if (level) acc[level] = (acc[level] || 0) + 1;
    return acc;
  }, {});
}

/**
 * `GET /api/v1/alerts` — the Node envelope, built from filtered artifact rows.
 *
 * `filters` echoes the request the way the Node handler echoes it (raw strings, `null`
 * when absent), and `states_visible` is the literal `['PUBLISHED']` because an
 * unauthenticated caller can never see more — the edge routes do not authenticate at all.
 */
/**
 * @param {AlertSnapshot} snapshot
 * @param {{ alerts?: AlertRow[], filters?: Record<string, string|null>, generatedAt?: string }} [options]
 * @returns {object}
 */
export function listEnvelopeFromSnapshot(snapshot, { alerts, filters = {}, generatedAt } = {}) {
  const rows = Array.isArray(alerts) ? alerts : [];
  const policy = snapshot && snapshot.policy ? snapshot.policy : null;
  const maxAutoPublish = policy && policy.human_in_the_loop
    ? policy.human_in_the_loop.max_auto_publish_level
    : null;

  return {
    generated_at: generatedAt || new Date().toISOString(),
    policy_version: (snapshot && snapshot.policy_version) || null,
    count: rows.length,
    counts: levelCounts(rows),
    state_counts: stateCounts(rows),
    states_visible: [PUBLIC_ALERT_STATE],
    filters: {
      state: filters.state || null,
      level: filters.level || null,
      horizon: filters.horizon || null,
      district_id: filters.district_id || null,
    },
    max_auto_publish_level: maxAutoPublish,
    // The artifact always carries a disclaimer (the builder stamps it); the policy block's
    // copy wins when present because the policy is what the engine ran under.
    disclaimer: (policy && policy.disclaimer) || (snapshot && snapshot.disclaimer) || null,
    alerts: rows,
  };
}

/**
 * `GET /api/v1/alerts/policy` — the policy the engine ran under, plus the delivery
 * transports this deployment has configured.
 *
 * The Node handler computes all of this from its own `process.env` at request time. A
 * Worker has no `process.env`, and the Pages project's environment is *not* the pipeline's:
 * recomputing there would describe a policy the engine may never have used. So the builder
 * stamps both into the artifact (`stampPolicy` in `scripts/build_alert_snapshot.mjs`) and
 * this function serves that record. `policy_source` says who wrote it.
 *
 * `levels`/`states` are passed in by the route from the shared modules rather than stamped,
 * because they are code constants, not deployment configuration.
 */
/**
 * @param {AlertSnapshot} snapshot
 * @param {{ levels?: readonly string[], states?: readonly string[] }} [options]
 * @returns {object|null}
 */
export function policyEnvelopeFromSnapshot(snapshot, { levels = [], states = [] } = {}) {
  const policy = snapshot && snapshot.policy ? snapshot.policy : null;
  if (!policy) return null;

  return {
    ...policy,
    levels,
    states,
    transports: (snapshot && snapshot.transports) || null,
    policy_source: (snapshot && snapshot.policy_source) || 'unknown',
  };
}
