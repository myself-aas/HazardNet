/**
 * One freshness vocabulary for the whole repository.
 *
 * "Is this data too old to trust?" was answered in eleven places, and the eleven answers
 * disagreed in three ways that matter on a hazard site:
 *
 *   · **The SLOs.** The pipeline cut 192/48/2 h, the browser cut 36/48/2 h, and mobile cut
 *     48 h for alerts. A deployment could pass its own monitor and fail its own status page,
 *     with neither wrong.
 *   · **The age convention.** A `YYYY-MM-DD` `prediction_date` had to be measured from that
 *     day's UTC midnight in some places (`backend/metrics.js`) and from `Date.parse` — which
 *     reads a bare date as UTC midnight for dates and *local* midnight for some inputs — in
 *     others. Off by up to 14 h, which is more than the 2 h probe SLO.
 *   · **The state name.** The pipeline shaped strings, the browser re-mapped them to four
 *     states, mobile expanded to twelve. A `stale` in one was not a `stale` in another.
 *
 * This module is that vocabulary, as data plus five pure functions. No I/O, no clock of its
 * own: every function that needs "now" takes it, so a test is deterministic and an artifact
 * build and a browser render can be compared instant-by-instant.
 *
 * **Why `.js`.** The same reason as `districtRegistry.js` and `forecastIndex.js`: the pipeline
 * scripts, the Express routes and the `serverless/` handlers load `packages/core` as source
 * with plain Node, which cannot resolve a `.ts` specifier. Types are JSDoc, so the browser,
 * the edge and mobile infer the same signatures from this file.
 */

/** The SLOs, in hours. Every producer and reader in the repository reads this object. */
export const SLO_HOURS = Object.freeze({
  /** Forecast age: one missed daily run plus grace (`monitoring/alerts.yml`). */
  FORECAST: 192,
  /** Public daily district advisories (`DAILY_ADVISORY_MAX_AGE_HOURS`). */
  DAILY_ADVISORIES: 36,
  /** Alert snapshot: the cut the status page and the alerts panel state. */
  ALERTS: 48,
  /** Site-health probe: it runs every 30 min, so 2 h is four missed runs. */
  HEALTH_PROBE: 2,
  /**
   * The alert-snapshot SLO under the name `alertPolicy.ts` declared before this module existed.
   * One property, two names, on one object: `SLO_HOURS.ALERT_SNAPSHOT === SLO_HOURS.ALERTS`.
   */
  ALERT_SNAPSHOT: 48,
  /** Wind overlay: refreshed with the freshness artifact, independently of forecasts. */
  WIND: 9,
});

/** The five states a freshness artifact may report, worst-last. */
export const ARTIFACT_STATES = Object.freeze(['fresh', 'unknown', 'stale', 'failing', 'missing']);

/** Severity ranking: an artifact's overall state is the worst state any source reports. */
export const STATE_SEVERITY = Object.freeze({
  fresh: 0,
  unknown: 1,
  stale: 2,
  failing: 3,
  missing: 4,
});

/**
 * Age in hours of an ISO-8601 instant, or `null` when the value is missing or unparseable.
 *
 * Never returns a number for an invalid input: a wrong age on the status page is worse than
 * "unknown", because a number invites trust.
 *
 * @param {unknown} iso
 * @param {Date|number} [now]
 * @returns {number|null}
 */
export function ageHours(iso, now = new Date()) {
  if (typeof iso !== 'string' || iso.trim() === '') return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return (toMs(now) - parsed) / 3_600_000;
}

/**
 * Age in hours of a day-granular `YYYY-MM-DD` field, measured from that day's UTC midnight.
 *
 * The convention is stated once here because it is not the obvious one: a forecast published
 * *for* 2026-11-09 is aged from 00:00Z that day, not from the moment the file was written.
 *
 * @param {unknown} predictionDate
 * @param {Date|number} [now]
 * @returns {number|null}
 */
export function ageHoursFromDate(iso, now = new Date()) {
  if (typeof iso !== 'string' || iso.length < 10) return null;
  const parsed = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  return (toMs(now) - parsed) / 3_600_000;
}

/**
 * `fresh` inside the SLO, `stale` outside it, `unknown` when the age itself is unknown.
 *
 * @param {number|null} hours
 * @param {number} sloHours
 * @returns {'fresh'|'stale'|'unknown'}
 */
export function classifyAge(hours, sloHours) {
  if (!Number.isFinite(hours)) return 'unknown';
  if (!Number.isFinite(sloHours) || sloHours <= 0) return 'unknown';
  return hours <= sloHours ? 'fresh' : 'stale';
}

/**
 * The worst state among several, so a caller with four sources reports one word.
 *
 * A source that is absent is not `fresh`: `null`/`undefined` entries are ignored, and an
 * empty list is `unknown` rather than the best case.
 *
 * @param {Array<keyof typeof STATE_SEVERITY|null|undefined>} states
 * @returns {keyof typeof STATE_SEVERITY}
 */
export function worstState(states) {
  let worst = null;
  for (const state of states) {
    if (state && state in STATE_SEVERITY) {
      if (worst === null || STATE_SEVERITY[state] > STATE_SEVERITY[worst]) worst = state;
    }
  }
  return worst ?? 'unknown';
}

/**
 * Whether an artifact is inside its SLO, for the `within_slo` booleans the API and the hooks
 * report. `null` when the age is unknown — the caller renders a dash, not a false.
 *
 * @param {number|null} hours
 * @param {number} sloHours
 * @returns {boolean|null}
 */
export function withinSlo(hours, sloHours) {
  if (!Number.isFinite(hours) || !Number.isFinite(sloHours) || sloHours <= 0) return null;
  return hours <= sloHours;
}

/**
 * @param {Date|number} now
 * @returns {number}
 */
function toMs(now) {
  return typeof now === 'number' ? now : now.getTime();
}
