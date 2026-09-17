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

export interface ForecastMetadata {
  predictionDate: string | null;
  ingestionTimestamp: string | null;
  source: string | null;
}

/**
 * Load freshness metadata without ever substituting a client/request timestamp.
 *
 * Three-stage fallback (mirrors loadForecasts): live /metadata → live /bulk →
 * the committed hourly snapshot. The Peak Hazard Window / Incident Ingestion
 * cards therefore keep showing the latest Kaggle prediction_date even when
 * the API/store is unreachable, as long as the deployment bundle carries a
 * snapshot. Throws only when all three sources fail.
 */
export async function fetchForecastMetadata(): Promise<ForecastMetadata> {
  // 1. Live metadata endpoint (Vercel serverless / Express backend).
  try {
    const metadataResponse = await fetch(`/api/v1/forecasts/metadata?fresh=${Date.now()}`, {
      cache: 'no-store',
    });
    if (metadataResponse.ok) {
      const payload = await metadataResponse.json() as {
        prediction_date?: unknown;
        ingestion_timestamp?: unknown;
        data_source?: unknown;
      };
      const predictionDate = typeof payload.prediction_date === 'string' ? payload.prediction_date.slice(0, 10) : null;
      if (predictionDate) {
        return {
          predictionDate,
          ingestionTimestamp: typeof payload.ingestion_timestamp === 'string' ? payload.ingestion_timestamp : null,
          source: typeof payload.data_source === 'string' ? payload.data_source : null,
        };
      }
    }
  } catch {
    // fall through to /bulk, then the snapshot
  }

  // 2. Bulk is the authoritative live row endpoint. It also lets the card work
  // against older deployments that do not expose /metadata yet.
  try {
    const bulkResponse = await fetch(`/api/v1/forecasts/bulk?horizon=7_days&fresh=${Date.now()}`, {
      cache: 'no-store',
    });
    if (bulkResponse.ok) {
      const payload = await bulkResponse.json() as { generated_at?: unknown; data_source?: unknown; forecasts?: unknown };
      const rows = parseBulkResponse(payload);
      const latestPrediction = rows
        .map((row) => row.prediction_date)
        .sort()
        .at(-1) ?? null;
      if (latestPrediction) {
        const latestIngestion = rows
          .map((row) => row.created_at)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;
        return {
          predictionDate: latestPrediction,
          ingestionTimestamp: latestIngestion,
          source: typeof payload.data_source === 'string' ? payload.data_source : null,
        };
      }
    }
  } catch {
    // fall through to the snapshot
  }

  // 3. Committed hourly snapshot (bundled with the deployment).
  const snapshotMetadata = await fetchSnapshotMetadata();
  if (snapshotMetadata.predictionDate) return snapshotMetadata;

  throw new Error('Forecast metadata unavailable (API and snapshot both unreachable)');
}

export const FORECAST_HORIZONS = ['7_days', '15_days'] as const;
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

  const meteorologicalFields = [
    'temperature_mean',
    'temperature_max',
    'temperature_min',
    'precipitation_mm',
    'wind_max_kmh',
    'dewpoint_mean',
    'solar_radiation_mj_m2',
    'evapotranspiration_mm',
  ] as const;
  for (const field of meteorologicalFields) {
    if (isFiniteNumber(r[field])) row[field] = r[field];
  }

  if (isFiniteNumber(r.model_severity)) row.model_severity = r.model_severity;
  if (isFiniteNumber(r.physics_severity)) row.physics_severity = r.physics_severity;
  if (typeof r.division === 'string' && r.division) row.division = r.division;
  if (typeof r.pcode === 'string' && r.pcode) row.pcode = r.pcode;
  if (isFiniteNumber(r.admin_level)) row.admin_level = r.admin_level;
  if (typeof r.adm2_name === 'string' && r.adm2_name) row.adm2_name = r.adm2_name;
  if (typeof r.adm2_pcode === 'string' && r.adm2_pcode) row.adm2_pcode = r.adm2_pcode;
  // created_at powers the /bulk fallback's ingestionTimestamp in
  // fetchForecastMetadata — dropping it blanks the Incident Ingestion card
  // whenever /metadata is down.
  if (typeof r.created_at === 'string' && r.created_at) row.created_at = r.created_at;

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
// Static hourly snapshot — the website's committed fallback data
// ─────────────────────────────────────────────────────────────────────────
// The hourly GitHub workflow (hourly_forecast.yml) downloads the Kaggle
// notebook's CSV output and regenerates this file inside the website bundle
// (scripts/build_forecast_snapshot.mjs), so every deployment of the codebase
// ships with forecasts at most one hour behind the latest notebook run —
// even when the forecast API/store is unreachable.

/** Public path of the committed hourly snapshot (frontend/public/data/...). */
export const FORECAST_SNAPSHOT_URL = '/data/forecasts-latest.json';

/**
 * Shape of `frontend/public/data/forecasts-latest.json`.
 *
 * schema v2 (2026-09-17) added `provenance` (which model/tensor/pipeline produced
 * these rows) and `coverage` (how many of the requested district x horizon units
 * were actually produced, and which districts are missing). Both are optional so
 * a deployment still serving a v1 snapshot keeps working — but a UI that ignores
 * `coverage` will render static baseline numbers for missing districts as if they
 * were today's forecast, which is the defect Phase 0 recorded (PRODUCT_SPEC §5.1).
 */
export interface ForecastSnapshot {
  schema?: string;
  generated_at?: string;
  source?: string;
  prediction_date?: string | null;
  provenance?: {
    model_version?: string | null;
    tensor_build_id?: string | null;
    pipeline_version?: string | null;
    run_id?: string | null;
  } | null;
  coverage?: {
    requested_units?: number | null;
    produced_units?: number | null;
    per_horizon?: Record<string, number> | null;
    districts_covered?: number | null;
    missing_district_ids?: number[];
    status?: string | null;
  } | null;
  soil_channels_fabricated?: boolean | null;
  horizons?: Partial<Record<string, unknown[]>>;
}

/** Parse one horizon's rows out of the static snapshot payload. */
export function parseSnapshotResponse(payload: unknown, horizon: ForecastHorizon): ForecastRow[] {
  if (!payload || typeof payload !== 'object') return [];
  const horizons = (payload as ForecastSnapshot).horizons;
  if (!horizons || typeof horizons !== 'object') return [];
  const rows = horizons[horizon];
  if (!Array.isArray(rows)) return [];
  return rows.map(parseForecastRow).filter((r): r is ForecastRow => r !== null);
}

/**
 * Fetch the committed hourly snapshot for one horizon. Used as the fallback
 * when the live API is unreachable — resolves to [] (not throw) when the
 * snapshot itself is missing, so callers degrade to the static baseline.
 */
export async function fetchStaticForecastSnapshot(horizon: ForecastHorizon): Promise<ForecastRow[]> {
  try {
    const res = await fetch(`${FORECAST_SNAPSHOT_URL}?fresh=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return [];
    return parseSnapshotResponse(await res.json(), horizon);
  } catch {
    return [];
  }
}

/**
 * Freshness metadata from the committed hourly snapshot — the offline-capable
 * equivalent of /metadata for the Peak Hazard Window / Incident Ingestion
 * cards. Never throws: resolves to all-null when the snapshot is missing or
 * malformed. The snapshot's prediction_date wins; when absent, the newest row
 * date across horizons is derived (same rule as the /bulk fallback above).
 */
export async function fetchSnapshotMetadata(): Promise<ForecastMetadata> {
  const empty: ForecastMetadata = { predictionDate: null, ingestionTimestamp: null, source: null };
  try {
    const res = await fetch(`${FORECAST_SNAPSHOT_URL}?fresh=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return empty;
    const payload = await res.json() as ForecastSnapshot;
    if (!payload || typeof payload !== 'object') return empty;

    let predictionDate = typeof payload.prediction_date === 'string'
      ? payload.prediction_date.slice(0, 10)
      : null;
    if (!predictionDate && payload.horizons && typeof payload.horizons === 'object') {
      const rowDates: string[] = [];
      for (const rows of Object.values(payload.horizons)) {
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          const parsed = parseForecastRow(row);
          if (parsed) rowDates.push(parsed.prediction_date);
        }
      }
      rowDates.sort();
      predictionDate = rowDates.at(-1) ?? null;
    }
    if (!predictionDate) return empty;
    return {
      predictionDate,
      ingestionTimestamp: typeof payload.generated_at === 'string' ? payload.generated_at : null,
      source: typeof payload.source === 'string' ? payload.source : null,
    };
  } catch {
    return empty;
  }
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
  jessore: 'jashore',
  chittagong: 'chattogram',
  comilla: 'cumilla',
  barishal: 'barisal',
  bogura: 'bogra',
  jaipurhat: 'joypurhat',
  netrakona: 'netrokona',
  maulvibazar: 'moulvibazar',
  brahamanbaria: 'brahmanbaria',
  jhalakathi: 'jhalokati',
  'chapainawabganj ': 'chapainawabganj', // defensive: trailing-space variants
  // FAO GAUL 2015 (and so the forecast pipeline) calls Chapainawabganj simply
  // "Nawabganj". Without this alias that district's forecast row never matched
  // its card, so the site showed the static baseline despite having a forecast
  // (found 2026-09-17 while wiring coverage accounting).
  nawabganj: 'chapainawabganj',
  khagrachari: 'khagrachhari',
};

export const canonicalKey = (name: string): string => {
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

/** Format a horizon for the map and individual forecast views. */
export const formatHorizonLabel = (horizon: ForecastHorizon): string => {
  const days = Number(horizon.replace('_days', ''));
  return `Next ${days} Days`;
};
