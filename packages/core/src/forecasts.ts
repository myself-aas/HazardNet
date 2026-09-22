/**
 * Forecast API client library — platform agnostic core module
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
  temperature_mean?: number;
  temperature_max?: number;
  temperature_min?: number;
  precipitation_mm?: number;
  wind_max_kmh?: number;
  dewpoint_mean?: number;
  solar_radiation_mj_m2?: number;
  evapotranspiration_mm?: number;
  created_at?: string;
  model_severity?: number;
  physics_severity?: number;
  division?: string;
  pcode?: string;
  dataset_version?: string;
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

export const FORECAST_HORIZONS = ['7_days', '15_days'] as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];

export const isForecastHorizon = (v: unknown): v is ForecastHorizon =>
  typeof v === 'string' && (FORECAST_HORIZONS as readonly string[]).includes(v);

export type SeverityBin = 'Low' | 'Moderate' | 'High';

export const severityBin = (score: number): SeverityBin =>
  score >= 0.67 ? 'High' : score >= 0.34 ? 'Moderate' : 'Low';

export type ConfidenceBin = 'Certain' | 'Probable' | 'Uncertain';

export const confidenceBin = (confidence: number): ConfidenceBin =>
  confidence >= 0.85 ? 'Certain' : confidence >= 0.7 ? 'Probable' : 'Uncertain';

export const normalizeDistrictKey = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]/g, '');

const DISTRICT_NAME_ALIASES: Record<string, string> = {
  jessore: 'jashore',
  chittagong: 'chattogram',
  comilla: 'cumilla',
  barishal: 'barisal',
  khagrachari: 'khagrachhari',
  bogura: 'bogra',
  jaipurhat: 'joypurhat',
  netrakona: 'netrokona',
  maulvibazar: 'moulvibazar',
  brahamanbaria: 'brahmanbaria',
  jhalakathi: 'jhalokati',
  nawabganj: 'chapainawabganj',
};

export const canonicalKey = (name: string): string => {
  const key = normalizeDistrictKey(name);
  return DISTRICT_NAME_ALIASES[key] ?? key;
};

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
    const dominant = group.reduce((a, b) =>
      b.severity_score > a.severity_score ||
      (b.severity_score === a.severity_score && new Date(b.prediction_date) > new Date(a.prediction_date))
        ? b
        : a
    );
    const meanConfidence = group.reduce((sum, r) => sum + r.confidence, 0) / group.length;
    rolled.push({
      ...dominant,
      district_name: dominant.adm2_name ?? dominant.district_name,
      district_id: dominant.adm2_pcode ?? dominant.district_id,
      pcode: dominant.adm2_pcode ?? dominant.pcode,
      confidence: meanConfidence,
    });
  }
  return [...direct, ...rolled];
}

export function effectiveDistrictRows(rows: ForecastRow[]): ForecastRow[] {
  return rows.some((r) => r.adm2_name) ? rollupAdm3ToDistricts(rows) : rows;
}

export const forecastAgeHours = (predictionDate: string, now: Date = new Date()): number =>
  Math.max(0, (now.getTime() - new Date(predictionDate).getTime()) / 3_600_000);

export const formatHorizonLabel = (horizon: ForecastHorizon): string => {
  const days = Number(horizon.replace('_days', ''));
  return `Next ${days} Days`;
};
