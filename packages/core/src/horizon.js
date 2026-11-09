/**
 * The forecast horizons, and how long each one is.
 *
 * Two horizons exist — `7_days` (tactical) and `15_days` (strategic) — and every layer of the
 * repository knows both names. What they did not share is the arithmetic that follows from the
 * name. "How many days is this horizon?" was answered four ways:
 *
 *   `backend/utils/forecastRow.js`   parseInt(String(horizon).split('_')[0])   — derived
 *   `backend/mcp/tools.js`           horizon === '7_days' ? 7 : 15             — ternary
 *   `backend/utils/dailyAdvisoryPublic.js`  an inline `[['7_days', 7], ['15_days', 15]]` table
 *   `frontend/src/lib/dailyAdvisories.ts`   horizon === '7_days' ? 7 : 15     — twice
 *
 * The ternaries have a defect the derived form does not: an unrecognised horizon answers **15**.
 * `rollupDailyAdvisoriesToForecastRows(advisories, run, '7day')` silently returns the fifteen-day
 * window, and nothing logs it — the same class of failure as the alias tables the district
 * registry closed, on a value with only two legal spellings.
 *
 * `.js` for the usual reason: the Node runtimes and the pipeline load `packages/core` as source
 * with plain Node, which cannot resolve a `.ts` specifier. `forecasts.ts` re-exports these with
 * types for the browser, the edge and mobile.
 */

/** The horizon keys, in the order they are presented. */
export const FORECAST_HORIZONS = Object.freeze(['7_days', '15_days']);

/**
 * How many forecast days a horizon covers, or `null` for anything else.
 *
 * `null` rather than a default: an unknown horizon is a caller bug, and answering 15 makes it
 * a silent one.
 *
 * @param {unknown} horizon
 * @returns {7|15|null}
 */
export function horizonDays(horizon) {
  if (horizon === '7_days') return 7;
  if (horizon === '15_days') return 15;
  return null;
}

/**
 * Whether a value is one of the two horizon keys.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isForecastHorizon(value) {
  return value === '7_days' || value === '15_days';
}
