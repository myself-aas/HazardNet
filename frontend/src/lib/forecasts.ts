/**
 * Forecast API client library — wires the frontend to the weekly pipeline's
 * pre-computed forecasts served by `GET /api/v1/forecasts/bulk` (backend/
 * routes/forecasts.js).
 *
 * Design notes (see docs/audits/2026-09-12-deployment-verification.md §6.3):
 *  - The API is the live source; the static `ALL_64_DISTRICTS` baseline is
 *    the offline fallback. Merging is additive — districts without a live
 *    forecast keep their static severity/hazard so the map never blanks out.
 *  - The API keys rows by numeric GAUL district_id; the static data keys by
 *    slug. Matching therefore runs on normalized district *names*, with an
 *    alias table covering post-2015 district renames and GAUL spellings.
 */

import type { DistrictData } from '../data/bangladeshDistricts';

// ─────────────────────────────────────────────────────────────────────────
// Types (mirror backend/routes/forecasts.js GET /bulk response + the stored
// Firestore doc shape written by POST /update / api/ingest.js)
// ─────────────────────────────────────────────────────────────────────────

export interface ForecastRow {
  district_id: number | string;
  district_name: string;
  horizon: string;
  hazard_type: string;
  severity_score: number;
  confidence: number;
  target_date: string;
  prediction_date: string;
  created_at?: string;
  /** Dual-track severity (present when the weekly CSV carried both columns). */
  model_severity?: number;
  physics_severity?: number;
  division?: string;
  pcode?: string;
  /** ADM3 identity (ADR 0005/0006): admin level + parent ADM2 district. */
  admin_level?: number;
  adm2_name?: string;
  adm2_pcode?: string;
}

export interface BulkForecastsResponse {
  horizon: string;
  count: number;
  generated_at: string;
  forecasts: ForecastRow[];
}

// 10/20/30-day horizons (2026-09-12, ADR 0005) — matches the refactored
// Kaggle notebook + backend VALID_HORIZONS.
export const FORECAST_HORIZONS = ['10_days', '20_days', '30_days'] as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];

export const isForecastHorizon = (v: unknown): v is ForecastHorizon =>
  typeof v === 'string' && (FORECAST_HORIZONS as readonly string[]).includes(v);

// ─────────────────────────────────────────────────────────────────────────
// Parsing / validation (defensive: the API is a JSON boundary)
// ─────────────────────────────────────────────────────────────────────────

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Parse one raw API row into a ForecastRow, or null when malformed. */
export function parseForecastRow(raw: unknown): ForecastRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (!isFiniteNumber(r.severity_score) || r.severity_score < 0 || r.severity_score > 1) return null;
  if (!isFiniteNumber(r.confidence) || r.confidence < 0 || r.confidence > 1) return null;
  if (typeof r.district_name !== 'string' || !r.district_name.trim()) return null;
  if (typeof r.hazard_type !== 'string' || !r.hazard_type.trim()) return null;
  if (typeof r.target_date !== 'string' || typeof r.prediction_date !== 'string') return null;

  const row: ForecastRow = {
    district_id: (isFiniteNumber(r.district_id) ? r.district_id : String(r.district_id ?? '')) as number | string,
    district_name: r.district_name,
    horizon: typeof r.horizon === 'string' ? r.horizon : '',
    hazard_type: r.hazard_type,
    severity_score: r.severity_score,
    confidence: r.confidence,
    target_date: r.target_date,
    prediction_date: r.prediction_date,
  };

  if (isFiniteNumber(r.model_severity)) row.model_severity = r.model_severity;
  if (isFiniteNumber(r.physics_severity)) row.physics_severity = r.physics_severity;
  if (typeof r.division === 'string' && r.division) row.division = r.division;
  if (typeof r.pcode === 'string' && r.pcode) row.pcode = r.pcode;
  if (isFiniteNumber(r.admin_level)) row.admin_level = r.admin_level;
  if (typeof r.adm2_name === 'string' && r.adm2_name) row.adm2_name = r.adm2_name;
  if (typeof r.adm2_pcode === 'string' && r.adm2_pcode) row.adm2_pcode = r.adm2_pcode;

  return row;
}

/** Parse the /bulk response payload into validated rows (malformed rows dropped). */
export function parseBulkResponse(payload: unknown): ForecastRow[] {
  if (!payload || typeof payload !== 'object') return [];
  const forecasts = (payload as { forecasts?: unknown }).forecasts;
  if (!Array.isArray(forecasts)) return [];
  return forecasts.map(parseForecastRow).filter((r): r is ForecastRow => r !== null);
}

// ─────────────────────────────────────────────────────────────────────────
// Binning — parity with backend/routes/forecasts.js GET /
// ─────────────────────────────────────────────────────────────────────────

export type SeverityBin = 'Low' | 'Moderate' | 'High';

export const severityBin = (score: number): SeverityBin =>
  score >= 0.67 ? 'High' : score >= 0.34 ? 'Moderate' : 'Low';

export type ConfidenceBin = 'Certain' | 'Probable' | 'Uncertain';

export const confidenceBin = (confidence: number): ConfidenceBin =>
  confidence >= 0.85 ? 'Certain' : confidence >= 0.7 ? 'Probable' : 'Uncertain';

// ─────────────────────────────────────────────────────────────────────────
// District matching — normalized names + official-rename aliases
// ─────────────────────────────────────────────────────────────────────────

/** Lowercase, strip everything that isn't a letter or digit. */
export const normalizeDistrictKey = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Post-2015 renames and FAO GAUL 2015 spellings → current local spellings
 * used by the static district table. Left side = alias (API/GAUL), right side
 * = canonical static-table key.
 */
const DISTRICT_NAME_ALIASES: Record<string, string> = {
  chittagong: 'chattogram',
  jessore: 'jashore',
  comilla: 'cumilla',
  barishal: 'barisal',
  bogura: 'bogra',
  jaipurhat: 'joypurhat',
  netrakona: 'netrokona',
  maulvibazar: 'moulvibazar',
  brahamanbaria: 'brahmanbaria',
  jhalakathi: 'jhalokati',
  'chapainawabganj ': 'chapainawabganj', // defensive: trailing-space variants
  khagrachari: 'khagrachhari',
};

const canonicalKey = (name: string): string => {
  const key = normalizeDistrictKey(name);
  return DISTRICT_NAME_ALIASES[key] ?? key;
};

/** Index API rows by canonical district key for O(1) lookups. */
export function buildForecastIndex(rows: ForecastRow[]): Map<string, ForecastRow> {
  const index = new Map<string, ForecastRow>();
  for (const row of rows) {
    const key = canonicalKey(row.district_name);
    const existing = index.get(key);
    if (!existing || new Date(row.prediction_date) > new Date(existing.prediction_date)) {
      index.set(key, row);
    }
  }
  return index;
}

// ─────────────────────────────────────────────────────────────────────────
// ADM3 → ADM2 rollup (ADR 0006 phase 8d)
// /bulk returns one row per ADM3 unit (507 Upazilas/City Corporations) since
// ADR 0005; the static map baseline is the 64 districts. Roll the units up to
// their parent district so the live overlay keeps covering all 64 districts:
// district severity/hazard = the max-severity (dominant) unit; confidence =
// the unit mean. Rows WITHOUT adm2 fields (legacy ADM2-shaped data) pass
// through untouched and keep matching districts by name directly.
// ─────────────────────────────────────────────────────────────────────────

/** Roll ADM3 rows up to one row per parent ADM2 district (+ direct passthrough). */
export function rollupAdm3ToDistricts(rows: ForecastRow[]): ForecastRow[] {
  const direct: ForecastRow[] = [];
  const groups = new Map<string, ForecastRow[]>();
  for (const row of rows) {
    if (!row.adm2_name) {
      direct.push(row);
      continue;
    }
    const key = canonicalKey(row.adm2_name);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const rolled: ForecastRow[] = [];
  for (const group of groups.values()) {
    // Dominant unit: the highest severity (ties → latest prediction_date).
    const dominant = group.reduce((a, b) =>
      b.severity_score > a.severity_score ||
      (b.severity_score === a.severity_score && new Date(b.prediction_date) > new Date(a.prediction_date))
        ? b
        : a
    );
    const meanConfidence = group.reduce((sum, r) => sum + r.confidence, 0) / group.length;
    rolled.push({
      ...dominant,
      // dominant always carries adm2_name here (rows were grouped by it).
      district_name: dominant.adm2_name ?? dominant.district_name,
      district_id: dominant.adm2_pcode ?? dominant.district_id,
      pcode: dominant.adm2_pcode ?? dominant.pcode,
      confidence: meanConfidence,
    });
  }
  return [...direct, ...rolled];
}

/** Rows to match against the 64-district baseline: rolled up when ADM3-shaped. */
export function effectiveDistrictRows(rows: ForecastRow[]): ForecastRow[] {
  return rows.some((r) => r.adm2_name) ? rollupAdm3ToDistricts(rows) : rows;
}

// ─────────────────────────────────────────────────────────────────────────
// Merge — live forecasts over the static district baseline
// ─────────────────────────────────────────────────────────────────────────

export interface MergedDistricts {
  /** New array; districts without a live forecast keep static values. */
  districts: DistrictData[];
  /** How many districts received a live override. */
  matched: number;
  /** Latest prediction_date across matched rows (undefined when none). */
  predictionDate?: string;
}

/**
 * Overlay live forecast severity / hazard onto the static district table.
 * Returns a new array — the input and module-level statics are never mutated.
 */
export function applyForecastsToDistricts(
  districts: DistrictData[],
  rows: ForecastRow[]
): MergedDistricts {
  const index = buildForecastIndex(effectiveDistrictRows(rows));
  let matched = 0;
  let predictionDate: string | undefined;

  const merged = districts.map((district) => {
    const row = index.get(canonicalKey(district.name));
    if (!row) return district;

    matched += 1;
    const rowDate = new Date(row.prediction_date);
    if (!predictionDate || rowDate > new Date(predictionDate)) {
      predictionDate = row.prediction_date;
    }

    return {
      ...district,
      severity: row.severity_score,
      risk: severityBin(row.severity_score),
      hazardType: row.hazard_type as DistrictData['hazardType'],
    };
  });

  return { districts: merged, matched, predictionDate };
}

// ─────────────────────────────────────────────────────────────────────────
// Display helpers
// ─────────────────────────────────────────────────────────────────────────

/** Age of a prediction in whole hours (clamped at 0 for future dates). */
export const forecastAgeHours = (predictionDate: string, now: Date = new Date()): number =>
  Math.max(0, (now.getTime() - new Date(predictionDate).getTime()) / 3_600_000);

/** `'10_days'` → `'Next 10 Days'` (used by the map's horizon toggle). */
export const formatHorizonLabel = (horizon: ForecastHorizon): string => {
  const days = Number(horizon.replace('_days', ''));
  return `Next ${days} Days`;
};
