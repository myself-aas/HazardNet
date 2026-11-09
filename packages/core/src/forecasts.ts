/**
 * The forecast row vocabulary — platform agnostic core module.
 *
 * Everything here is *derivation from a row*: which horizons exist, how a severity
 * maps onto a tier, how an ADM3 upazila row rolls up to its ADM2 district, which
 * district two spellings refer to. Web, mobile, the Node runtimes and the edge
 * Functions all read the same commits, so they must all answer those questions
 * identically — which is why the answers live here and not in a copy per platform.
 *
 * **This file used to be a copy.** `frontend/src/lib/forecasts.ts` carried its own
 * `ForecastRow`, `ADVISORY_TIERS`, `severityBin`, `canonicalKey`, district alias
 * table, `buildForecastIndex`, `rollupAdm3ToDistricts` and `formatHorizonLabel` —
 * 21 exported names duplicated verbatim from here — and drifted in exactly the
 * ways duplicated derivations do:
 *
 *   · `formatHorizonLabel('7_days')` returned `Next 7 Days` here and
 *     `Days 1–7 Subset` in the web copy, so the same horizon had two names;
 *   · the web copy added `'chapainawabganj '` (trailing space) to the alias table,
 *     a key no normalized lookup can produce;
 *   · the web copy's `ForecastRow` grew `forecast_day` and `is_peak_day`, which the
 *     shared contract did not have — so a shared Zod parse would have stripped the
 *     fields the daily trajectory charts read.
 *
 * The web module is now a re-export plus the parts that really are browser-only
 * (payload parsing, the committed-snapshot fetch, the static-baseline merge). Keep
 * the split that way: a new derivation belongs here, and only I/O belongs there.
 */

import { SEVERITY_THRESHOLDS } from './alertPolicy';
import { confidenceBin as coreConfidenceBin } from './advisoryTier.js';
import { districtKey } from './districtRegistry.js';

export const ADVISORY_TIERS = ['EXTREME', 'SEVERE', 'WARNING', 'WATCH', 'NORMAL'] as const;
export type AdvisoryTier = (typeof ADVISORY_TIERS)[number];

export const HAZARD_CLASSES = [
  'Cold Wave',
  'Drought',
  'Fire',
  'Flash Flood',
  'Flood',
  'Heat Wave',
  'Severe Local Storm',
  'Tropical Cyclone',
] as const;
export type HazardClass = (typeof HAZARD_CLASSES)[number];

/**
 * The zones a `Prediction Level` is safer to bet on per hazard class. Every
 * consumer (map, dashboard, advisory card) reads the same shape, so the extra
 * fields below exist to carry one advisory's *provenance* without a second type.
 */
export interface ForecastRow {
  district_id: number | string;
  district_name: string;
  horizon: string;
  hazard_type: string;
  severity_score: number;
  confidence: number;
  target_date: string;
  prediction_date: string;
  /** Forecasted weather values in human-readable units. */
  temperature_mean?: number;
  temperature_max?: number;
  temperature_min?: number;
  precipitation_mm?: number;
  wind_max_kmh?: number;
  dewpoint_mean?: number;
  solar_radiation_mj_m2?: number;
  evapotranspiration_mm?: number;
  created_at?: string;
  /** Dual-track severity (present when the weekly CSV carried both columns). */
  model_severity?: number;
  physics_severity?: number;
  division?: string;
  pcode?: string;
  /**
   * `dataset_version` — the content hash over the inputs behind this prediction
   * unit (the scene manifest, PRODUCT_SPEC §5.8). Same inputs, same version.
   */
  dataset_version?: string;
  /** ADM3 identity (ADR 0005/0006): admin level + parent ADM2 district. */
  admin_level?: number;
  adm2_name?: string;
  adm2_pcode?: string;
  advisory_tier?: AdvisoryTier | string;
  /**
   * Where the tier came from: `published` when the upstream advisory CSV carried it,
   * `derived_final_severity` / `derived_severity_score` when the snapshot builder cut
   * it from a score. Stamped by `scripts/lib/advisory-tier.mjs`.
   */
  advisory_tier_source?: string;
  /**
   * True when the tier is above the auto-publish ceiling: this is a severity
   * statement, NOT a published alert. WARNING and SEVERE require a named duty
   * officer's sign-off (`alertPolicy.ts`). The card says so.
   */
  requires_review?: boolean;
  physics_override?: boolean;
  latitude?: number;
  longitude?: number;
  model_severity_raw?: number;
  final_severity?: number;
  prob_top1?: number;
  prob_top2?: number;
  prob_top3?: number;
  /** Advisory provenance and calibration (the daily advisory CSV's own columns). */
  data_source?: string;
  model_version?: string;
  confidence_raw?: number;
  confidence_calibrated?: number;
  confidence_kind?: string;
  /** 1..15 continuous day index and peak severe date marker from the 960-row daily run. */
  forecast_day?: number;
  is_peak_day?: boolean;
}

export interface BulkForecastsResponse {
  horizon: string;
  count: number;
  generated_at: string;
  forecasts: ForecastRow[];
}

export interface ForecastMetadata {
  predictionDate: string | null;
  ingestionTimestamp: string | null;
  source: string | null;
}

/**
 * The horizon keys and their day counts live in `./horizon.js` — one owner, so a new horizon is
 * added in one place. `isForecastHorizon` is re-exported below rather than re-declared.
 */
import { FORECAST_HORIZONS as HORIZONS } from './horizon.js';
export { horizonDays, isForecastHorizon } from './horizon.js';
export const FORECAST_HORIZONS = HORIZONS;
export type ForecastHorizon = '7_days' | '15_days';

export type SeverityBin = 'Low' | 'Moderate' | 'High';

/**
 * Coarse three-way severity bucket for list/dashboard colouring.
 *
 * Deliberately *not* the advisory tier bands (0.40 / 0.70 / 0.85 in
 * `alertPolicy.ts`): this is a reading aid, not a publication claim, and the two
 * have different jobs. What it must not do is drift a third time — the tier
 * function below is the one that answers "what would the pipeline call this".
 */
export const severityBin = (score: number): SeverityBin =>
  score >= 0.67 ? 'High' : score >= 0.34 ? 'Moderate' : 'Low';

export type ConfidenceBin = 'Certain' | 'Probable' | 'Uncertain';

/** The confidence bins, from `advisoryTier.js` — the same two cut points everything else reads. */
export const confidenceBin = (confidence: number): ConfidenceBin =>
  coreConfidenceBin(confidence) as ConfidenceBin;

// The tier's severity bands live in alertPolicy.ts (`SEVERITY_THRESHOLDS`) and the
// pipeline cuts them in `scripts/lib/advisory-tier.mjs`; `__tests__/advisoryTierBands.test.js`
// pins the three producers together. Nothing below restates a band.

/**
 * The tier the advisory published, when it published one.
 *
 * Falls back to a client-side bin only when the field is absent — never when it is
 * present but unrecognised, because silently re-labelling a published tier is worse
 * than showing none.
 *
 * The full published vocabulary (EXTREME / SEVERE / WARNING / WATCH / NORMAL) round-
 * trips: a row that publishes WARNING renders WARNING. Only *derivation* stops at the
 * ceiling.
 *
 * **Capped at WATCH, on purpose.** WARNING and SEVERE require a named duty officer,
 * and the reviewer's identity is stored on the published alert. A UI that derives
 * SEVERE from `severity_score` shows a tier no human approved, which is a safety
 * claim the product may not make on its own.
 */
export function tierFromSeverity(score: number | null | undefined): AdvisoryTier | null {
  if (!Number.isFinite(score)) return null;
  return (score as number) >= SEVERITY_THRESHOLDS.WATCH ? 'WATCH' : 'NORMAL';
}

/**
 * The advisory tier for a row, preferring what the pipeline published.
 *
 * `null` means "this row carries no tier and none can be derived" — the caller
 * renders nothing rather than inventing NORMAL, which reads as "we looked and it
 * is fine". `tierForSeverity` in `alertPolicy.ts` remains the full three-band
 * derivation for rows that legitimately may carry WARNING or SEVERE (the pipeline
 * and the engine); this wrapper exists because clients may not.
 */
export function advisoryTierOf(
  row: Pick<ForecastRow, 'advisory_tier' | 'severity_score'> | null | undefined
): AdvisoryTier | null {
  // Only these two columns are read, so the interface asks for only these two:
  // a caller holding a partial row should not have to fabricate a district name.
  const published = typeof row?.advisory_tier === 'string'
    ? row.advisory_tier.trim().toUpperCase()
    : '';
  if (published) {
    if ((ADVISORY_TIERS as readonly string[]).includes(published)) return published as AdvisoryTier;
    return null;
  }
  return tierFromSeverity(row?.severity_score);
}

export {
  districtKey,
  districtSlug,
  sameDistrict,
  normalizeDistrictKey,
  lookupDistrict,
  districtById,
} from './districtRegistry.js';

import {
  buildForecastIndex as buildIndex,
  effectiveDistrictRows as effectiveRows,
  latestRowsByDistrict as latestRows,
  rollupAdm3ToDistricts as rollupAdm3,
} from './forecastIndex.js';

export type { ForecastRowLike } from './forecastIndex.js';

/**
 * Kept as the name the forecast layer has always used.
 *
 * `canonicalKey` is `districtKey`: one function, two names, because 30 call sites across the
 * web app, the content engine and the API already say `canonicalKey` and the *behaviour* was
 * never the problem — the seven tables behind it were.
 */
export const canonicalKey = districtKey;

/**
 * The row-identity rule, re-exported from `./forecastIndex.js`.
 *
 * The implementation is JavaScript so plain Node can load it: the Express routes, the
 * `serverless/` handlers and the pipeline scripts import `packages/core` as source, and Node
 * cannot resolve a `.ts` specifier without a bundler. Types are inferred here for the browser,
 * the edge and the mobile app, so all four callers see one signature and one behaviour.
 */
export const buildForecastIndex = buildIndex;
export const effectiveDistrictRows = effectiveRows;
export const latestRowsByDistrict = latestRows;

/**
 * Roll ADM3 upazila rows up to one row per parent ADM2 district.
 *
 * See `forecastIndex.js` for the full statement of the rule and the four readers that used to
 * disagree about it. District severity/hazard is the max-severity (dominant) unit; confidence
 * is the unit mean; legacy ADM2-shaped rows pass through untouched.
 */
export const rollupAdm3ToDistricts = rollupAdm3;

export const forecastAgeHours = (predictionDate: string, now: Date = new Date()): number =>
  Math.max(0, (now.getTime() - new Date(predictionDate).getTime()) / 3_600_000);

/**
 * The one name for a horizon, in both places it is said.
 *
 * `Continuous 15 Days` / `Days 1–7 Subset` is the editorial wording the map toolbar
 * and the district cards use; it is *this* string, not a second one built per page.
 */
export const formatHorizonLabel = (horizon: ForecastHorizon): string => {
  if (horizon === '15_days') return 'Continuous 15 Days';
  if (horizon === '7_days') return 'Days 1–7 Subset';
  const days = Number(String(horizon).replace('_days', ''));
  return Number.isFinite(days) ? `Next ${days} Days` : String(horizon);
};
