/**
 * Forecast-row identity: which row *is* a district's forecast.
 *
 * These live in a `.js` module, not `.ts`, for the same reason `districtRegistry.js` does: the
 * Node runtimes (the Express routes, the `serverless/` handlers, the pipeline scripts) import
 * `packages/core` **as source with plain Node**, and Node cannot resolve a `.ts` specifier
 * without a bundler. The browser and the edge bundle TypeScript happily; the Durable/Node side
 * does not. A rule that both sides must apply has to live in a file both can load.
 *
 * **One rule, four callers.** Before 2026-11-09 the question "which row represents this
 * district?" had four answers:
 *
 *   · `GET /bulk` on the edge passed the raw horizon array through — so a daily (15-step)
 *     payload answered 960 rows under an endpoint whose ratio is "one row per district", while
 *     the Node handler read a store that had already collapsed it;
 *   · `POST /api/predict` on the edge sorted every row and took the first name match;
 *   · `storedPrediction` (both runtimes) did the same, by a different comparison;
 *   · `rollupAdm3ToDistricts` kept the max-severity *upazila* as the district's row.
 *
 * Same district, up to four different rows, decided by which endpoint you asked. The functions
 * below are that decision, and nothing else in the repository re-implements it.
 *
 * The composition, in order:
 *
 *   `rollupAdm3ToDistricts`  507 ADM3 units → one row per ADM2 parent (ADR 0005/0006)
 *   `effectiveDistrictRows`  apply the rollup only when the rows are ADM3-shaped
 *   `buildForecastIndex`     newest `prediction_date` wins per district
 *   `latestRowsByDistrict`   index → array, the shape an envelope serves
 *
 * Plain JavaScript with JSDoc so `tsc --allowJs` infers the same types for the TS callers
 * (`packages/core/src/forecasts.ts` re-exports them). No dependencies, no I/O.
 */

import { districtKey } from './districtRegistry.js';

/**
 * @typedef {object} ForecastRowLike
 * @property {number|string} district_id
 * @property {string} district_name
 * @property {number} severity_score
 * @property {number} [confidence]
 * @property {string} prediction_date
 * @property {string} [adm2_name]
 * @property {string} [adm2_pcode]
 * @property {string} [pcode]
 */

/**
 * Roll ADM3 (upazila) rows up to one row per parent ADM2 district.
 *
 * `/bulk` returns one row per ADM3 unit (507 Upazilas/City Corporations) since ADR 0005; the
 * static map baseline is the 64 districts. District severity/hazard is the max-severity
 * (dominant) unit; confidence is the unit mean. Rows WITHOUT `adm2_name` (legacy ADM2-shaped
 * data) pass through untouched, and so does a row whose parent name normalizes to nothing —
 * dropping it would silently reduce a district's coverage.
 *
 * @template {ForecastRowLike} T
 * @param {T[]} rows
 * @returns {T[]}
 */
export function rollupAdm3ToDistricts(rows) {
  /** @type {T[]} */
  const direct = [];
  /** @type {Map<string, T[]>} */
  const groups = new Map();

  for (const row of rows) {
    if (!row || typeof row !== 'object' || !row.adm2_name) {
      direct.push(row);
      continue;
    }
    const key = districtKey(row.adm2_name);
    if (!key) {
      direct.push(row);
      continue;
    }
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  /** @type {ForecastRowLike[]} */
  const rolled = [];
  for (const group of groups.values()) {
    const dominant = group.reduce((a, b) =>
      b.severity_score > a.severity_score ||
      (b.severity_score === a.severity_score &&
        Date.parse(b.prediction_date) > Date.parse(a.prediction_date))
        ? b
        : a
    );
    const confidence = group.reduce((sum, row) => sum + (Number(row.confidence) || 0), 0) / group.length;
    rolled.push(/** @type {ForecastRowLike} */ ({
      ...dominant,
      district_name: dominant.adm2_name ?? dominant.district_name,
      district_id: dominant.adm2_pcode ?? dominant.district_id,
      pcode: dominant.adm2_pcode ?? dominant.pcode,
      confidence,
    }));
  }
  return /** @type {T[]} */ ([...direct, ...rolled]);
}

/**
 * The rows the district-level views should read: rolled up only when they are ADM3-shaped.
 *
 * @template {ForecastRowLike} T
 * @param {T[]} rows
 * @returns {T[]}
 */
export function effectiveDistrictRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.some((row) => row && row.adm2_name) ? rollupAdm3ToDistricts(list) : list;
}

/**
 * Index rows by canonical district key, keeping the newest `prediction_date` per district.
 *
 * A row with no recognisable district name is skipped rather than filed under `''`, which is
 * the key every other nameless row would then collide on.
 *
 * @template {ForecastRowLike} T
 * @param {T[]} rows
 * @returns {Map<string, T>}
 */
export function buildForecastIndex(rows) {
  /** @type {Map<string, T>} */
  const index = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    const key = districtKey(row.district_name);
    if (!key) continue;
    const existing = index.get(key);
    if (!existing || Date.parse(row.prediction_date) > Date.parse(existing.prediction_date)) {
      index.set(key, row);
    }
  }
  return index;
}

/**
 * The served shape: one row per district, newest first-wins.
 *
 * @template {ForecastRowLike} T
 * @param {T[]} rows
 * @returns {T[]}
 */
export function latestRowsByDistrict(rows) {
  return [...buildForecastIndex(effectiveDistrictRows(rows)).values()];
}
