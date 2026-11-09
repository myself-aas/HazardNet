/**
 * Forecast access for the browser — the *browser* half of the forecast module.
 *
 * The vocabulary is not here any more. `ForecastRow`, `ADVISORY_TIERS`,
 * `FORECAST_HORIZONS`, `severityBin`, `confidenceBin`, `canonicalKey`,
 * `buildForecastIndex`, `rollupAdm3ToDistricts`, `effectiveDistrictRows`,
 * `formatHorizonLabel`, `forecastAgeHours`, `tierFromSeverity` and `advisoryTierOf`
 * all live in `packages/core/src/forecasts.ts`, which is what mobile, the Node
 * runtimes and the edge Functions read too. This file re-exports them (so no call
 * site had to move) and owns only what needs a browser or a URL:
 *
 *   · parsing a JSON boundary defensively (`parseForecastRow`, `parseBulkResponse`,
 *     `parseSnapshotResponse`) — the API and the committed snapshot are both "some
 *     other process's output" and both can be wrong;
 *   · fetching the committed snapshot (`fetchStaticForecastSnapshot`);
 *   · the three-stage metadata fallback (`fetchForecastMetadata`);
 *   · the merge of live rows onto the static 64-district baseline
 *     (`applyForecastsToDistricts`) — the only function here that knows
 *     `DistrictData` exists.
 *
 * **Why the split matters.** Until 2026-11-09 this file duplicated 21 exports from
 * core, and they had drifted: `formatHorizonLabel('7_days')` said `Days 1–7 Subset`
 * here and `Next 7 Days` in core; the alias table here carried a dead
 * `'chapainawabganj '` key (trailing space) that no normalized lookup can produce,
 * and did not know `Cox's Bazar`; and `ForecastRow` here had two fields the shared
 * contract lacked (`forecast_day`, `is_peak_day`), so anything validated through the
 * shared Zod schema silently stripped the daily-trajectory columns. One owner, one
 * answer.
 */

import type { DistrictData } from '../data/bangladeshDistricts';
import { API_PATHS } from '@hazardnet/api';
import {
  ADVISORY_TIERS,
  buildForecastIndex,
  canonicalKey,
  effectiveDistrictRows,
  severityBin,
  type AdvisoryTier,
  type ForecastHorizon,
  type ForecastRow,
} from '@hazardnet/core';

// ─────────────────────────────────────────────────────────────────────────
// Re-exports — the vocabulary callers already import from this path
// ─────────────────────────────────────────────────────────────────────────

export {
  ADVISORY_TIERS,
  HAZARD_CLASSES,
  FORECAST_HORIZONS,
  advisoryTierOf,
  buildForecastIndex,
  canonicalKey,
  confidenceBin,
  districtKey,
  districtSlug,
  effectiveDistrictRows,
  forecastAgeHours,
  formatHorizonLabel,
  horizonDays,
  isForecastHorizon,
  latestRowsByDistrict,
  normalizeDistrictKey,
  rollupAdm3ToDistricts,
  sameDistrict,
  severityBin,
  tierFromSeverity,
  type AdvisoryTier,
  type BulkForecastsResponse,
  type ConfidenceBin,
  type ForecastHorizon,
  type ForecastRow,
  type HazardClass,
  type SeverityBin,
} from '@hazardnet/core';

// ─────────────────────────────────────────────────────────────────────────
// Advisory derivation that is presentation-shaped, not row-shaped
// ─────────────────────────────────────────────────────────────────────────

export interface AdvisorySignal {
  raw: number | null;
  calibrated: number | null;
  physics: number | null;
  final: number | null;
  override: boolean;
  probabilities: Array<{ label: string; value: number }>;
}

export function advisorySignalOf(row: ForecastRow): AdvisorySignal {
  const unit = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
  const probabilities = [row.prob_top1, row.prob_top2, row.prob_top3]
    .map(unit)
    .filter((value): value is number => value !== null)
    .map((value, index) => ({
      label: `Top-${index + 1}`,
      value,
    }));
  return {
    raw: unit(row.model_severity_raw),
    calibrated: unit(row.model_severity),
    physics: unit(row.physics_severity),
    final: unit(row.final_severity) ?? unit(row.severity_score),
    override: row.physics_override === true,
    probabilities,
  };
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
 * the committed snapshot. The Peak Hazard Window / Incident Ingestion
 * cards therefore keep showing the latest production_date even when
 * the API/store is unreachable, as long as the deployment bundle carries a
 * snapshot. Throws only when all three sources fail.
 */
export async function fetchForecastMetadata(): Promise<ForecastMetadata> {
  // 1. Live metadata endpoint (Node function / Express backend).
  try {
    const metadataResponse = await fetch(`${API_PATHS.forecastsMetadata}?fresh=${Date.now()}`, {
      cache: 'no-store',
    });
    if (metadataResponse.ok) {
      const payload = (await metadataResponse.json()) as {
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
    const bulkResponse = await fetch(`${API_PATHS.forecastsBulk}?horizon=7_days&fresh=${Date.now()}`, {
      cache: 'no-store',
    });
    if (bulkResponse.ok) {
      const payload = (await bulkResponse.json()) as {
        generated_at?: unknown;
        data_source?: unknown;
        forecasts?: unknown;
      };
      const rows = parseBulkResponse(payload);
      const latestPrediction =
        rows
          .map((row) => row.prediction_date)
          .sort()
          .at(-1) ?? null;
      if (latestPrediction) {
        const latestIngestion =
          rows
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

  // 3. Committed snapshot (bundled with the deployment).
  const snapshotMetadata = await fetchSnapshotMetadata();
  if (snapshotMetadata.predictionDate) return snapshotMetadata;

  throw new Error('Forecast metadata unavailable (API and snapshot both unreachable)');
}
// ─────────────────────────────────────────────────────────────────────────
// Parsing / validation (defensive: the API is a JSON boundary)
// ─────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Bounding box for the 64 districts the registry covers, plus margin. Row coordinates are
 * checked against it because a transposed lat/lon pair is itself a valid coordinate — it
 * would land a marker in Somalia while looking like data.
 */
const BANGLADESH_BBOX = { minLat: 20.0, maxLat: 27.0, minLon: 87.5, maxLon: 93.0 } as const;

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

  // ── Advisory fields published by the daily CSV ────────────────────────────────────
  // These are the columns the pipeline emits (ADVISORY_CSV_COLUMNS) that used to be
  // dropped here: rows carried them from the API and the snapshot, and the UI re-derived
  // a tier from `severity_score` instead of showing the published one. All are optional —
  // a row that predates them keeps parsing exactly as it did.
  //
  // Out-of-range values are dropped rather than clamped, so "absent" and "nonsense" look
  // the same to the UI: every one of these is a float in [0,1] in the CSV, and a 1.7
  // severity or a 12.0 probability means the payload is wrong, not that it is extreme.
  const unitFloat = (value: unknown): number | undefined =>
    isFiniteNumber(value) && value >= 0 && value <= 1 ? value : undefined;

  const finalSeverity = unitFloat(r.final_severity);
  if (finalSeverity !== undefined) row.final_severity = finalSeverity;
  const modelRaw = unitFloat(r.model_severity_raw);
  if (modelRaw !== undefined) row.model_severity_raw = modelRaw;
  const probTop1 = unitFloat(r.prob_top1);
  if (probTop1 !== undefined) row.prob_top1 = probTop1;
  const probTop2 = unitFloat(r.prob_top2);
  if (probTop2 !== undefined) row.prob_top2 = probTop2;
  const probTop3 = unitFloat(r.prob_top3);
  if (probTop3 !== undefined) row.prob_top3 = probTop3;
  const confidenceRaw = unitFloat(r.confidence_raw);
  if (confidenceRaw !== undefined) row.confidence_raw = confidenceRaw;
  const confidenceCalibrated = unitFloat(r.confidence_calibrated);
  if (confidenceCalibrated !== undefined) row.confidence_calibrated = confidenceCalibrated;

  // The advisory tier is a closed vocabulary in the CSV; an unrecognised word is dropped
  // rather than rendered, because a tier badge that says "severe " or "CAT-1" reads as a
  // published decision when it is really a payload we do not understand.
  if (
    typeof r.advisory_tier === 'string' &&
    (ADVISORY_TIERS as readonly string[]).includes(r.advisory_tier.trim().toUpperCase())
  ) {
    row.advisory_tier = r.advisory_tier.trim().toUpperCase() as AdvisoryTier;
    // Provenance and the review flag travel with the tier, and only with it: a source or a
    // "needs review" mark on a row whose tier was dropped would describe a decision the UI is
    // not showing. `published` is the upstream CSV's own word; anything else is a derivation
    // and is kept verbatim so a reader can see which score it was cut from.
    const source = typeof r.advisory_tier_source === 'string' ? r.advisory_tier_source.trim() : '';
    if (source) row.advisory_tier_source = source.slice(0, 40);
    if (typeof r.requires_review === 'boolean') row.requires_review = r.requires_review;
  }
  if (typeof r.physics_override === 'boolean') row.physics_override = r.physics_override;

  // Coordinates come from the district registry, so they are validated against the
  // country's bounding box: a swapped or unset pair would otherwise move a marker to the
  // wrong place with no visible error. Rows outside the box keep their other fields.
  const latitude = isFiniteNumber(r.latitude) ? r.latitude : Number.NaN;
  const longitude = isFiniteNumber(r.longitude) ? r.longitude : Number.NaN;
  if (latitude >= BANGLADESH_BBOX.minLat && latitude <= BANGLADESH_BBOX.maxLat) row.latitude = latitude;
  if (longitude >= BANGLADESH_BBOX.minLon && longitude <= BANGLADESH_BBOX.maxLon) row.longitude = longitude;

  const provenance = (value: unknown, max: number): string | undefined =>
    typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : undefined;
  const dataSource = provenance(r.data_source, 120);
  if (dataSource) row.data_source = dataSource;
  const modelVersion = provenance(r.model_version, 80);
  if (modelVersion) row.model_version = modelVersion;
  const confidenceKind = provenance(r.confidence_kind, 40);
  if (confidenceKind) row.confidence_kind = confidenceKind;

  if (typeof r.division === 'string' && r.division) row.division = r.division;
  if (typeof r.pcode === 'string' && r.pcode) row.pcode = r.pcode;
  if (isFiniteNumber(r.admin_level)) row.admin_level = r.admin_level;
  if (typeof r.adm2_name === 'string' && r.adm2_name) row.adm2_name = r.adm2_name;
  if (typeof r.adm2_pcode === 'string' && r.adm2_pcode) row.adm2_pcode = r.adm2_pcode;
  // Lineage passes through only when it is shaped like a version. A malformed
  // value must not reach the UI as if it identified the inputs.
  if (typeof r.dataset_version === 'string' && /^ds1\.[0-9a-f]{16}$/.test(r.dataset_version)) {
    row.dataset_version = r.dataset_version;
  }
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
// Static snapshot — the website's committed fallback data
// ─────────────────────────────────────────────────────────────────────────
//
// `build_forecast_snapshot.mjs` (run by the daily advisory workflow) regenerates
// `frontend/public/data/forecasts-latest.json` inside the website bundle, so every
// deployment ships with forecasts at most one day behind the latest run — even when
// the API and the store are both unreachable.
// The daily GitHub workflow (daily_forecast.yml) downloads the production
// notebook's CSV output and regenerates this file inside the website bundle
// (scripts/build_forecast_snapshot.mjs), so every deployment of the codebase
// ships with forecasts at most one day behind the latest notebook run —
// even when the forecast API/store is unreachable.

/** Public path of the committed snapshot (frontend/public/data/...). */
export const FORECAST_SNAPSHOT_URL = '/data/forecasts-latest.json';

/**
 * Shape of `frontend/public/data/forecasts-latest.json`.
 *
 * schema v2 (2026-09-17) added `provenance` (which model and pipeline produced
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
  /** Run-level `dataset_version` (content hash over every unit's inputs). */
  dataset_version?: string | null;
  /**
   * How many rows carry a version. `status: 'partial'` means some rows cannot
   * name the inputs behind them — a legacy snapshot, or a run whose lineage
   * failed — and the UI should say so rather than implying full lineage.
   */
  lineage?: {
    dataset_version?: string | null;
    scene_manifest_path?: string | null;
    units_in_manifest?: number | null;
    rows_with_version?: number | null;
    rows_total?: number | null;
    scenes_enumerated?: boolean | null;
    status?: string | null;
  } | null;
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
 * Fetch the committed snapshot for one horizon. Used as the fallback
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
 * Freshness metadata from the committed snapshot — the offline-capable
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
    const payload = (await res.json()) as ForecastSnapshot;
    if (!payload || typeof payload !== 'object') return empty;

    let predictionDate = typeof payload.prediction_date === 'string' ? payload.prediction_date.slice(0, 10) : null;
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
export function applyForecastsToDistricts(districts: DistrictData[], rows: ForecastRow[]): MergedDistricts {
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
      advisoryTier: row.advisory_tier,
      physicsOverride: row.physics_override,
      modelSeverityRaw: row.model_severity_raw,
      finalSeverity: row.final_severity,
      probTop1: row.prob_top1,
      probTop2: row.prob_top2,
      probTop3: row.prob_top3,
      lat: typeof row.latitude === 'number' && !isNaN(row.latitude) ? row.latitude : district.lat,
      lng: typeof row.longitude === 'number' && !isNaN(row.longitude) ? row.longitude : district.lng,
    };
  });

  return { districts: merged, matched, predictionDate };
}
