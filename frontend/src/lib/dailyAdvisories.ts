/**
 * Typed, fail-closed public district/day client for the 960-row Kaggle daily dataset.
 * Validates all 5 advisory tiers (NORMAL, WATCH, WARNING, SEVERE, EXTREME),
 * severityScore, weather values, and forecast metrics while rejecting unknown or
 * private columns. Also provides horizon rollup helpers so `/live`, `/advisories`,
 * and district panels stay unified with the daily Kaggle run.
 */
import { canonicalKey, type ForecastHorizon, type ForecastRow } from './forecasts';
import { ACTION_HAZARD_CLASSES } from './advisoryActions';
import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';

export const DAILY_API_URL = '/api/v1/advisories';
export const DAILY_SNAPSHOT_URL = '/data/daily-advisories-v1.json';
export const DAILY_SCHEMA = 'hazardnet-daily-advisories/v1';

export const DAILY_TIERS = ['NORMAL', 'WATCH', 'WARNING', 'SEVERE', 'EXTREME'] as const;
export type DailyTier = typeof DAILY_TIERS[number];
export type DailyPeak = 'unique' | 'tied' | 'unknown' | 'none';
export type DailyQualityNote = 'official_update_unverified' | 'limited_forecast_detail';
export type DailyActionId = typeof ACTION_IDS[number];
export type DailyStatus = 'fresh' | 'stale' | 'offline' | 'unavailable';

const REVIEW_TIERS: readonly DailyTier[] = ['WARNING', 'SEVERE', 'EXTREME'];
const TIER_RANK: Record<DailyTier, number> = {
  NORMAL: 0,
  WATCH: 1,
  WARNING: 2,
  SEVERE: 3,
  EXTREME: 4,
};

const ACTION_IDS = [
  'cover_seedlings', 'shelter_animals', 'save_irrigation', 'mulch_soil',
  'avoid_burning', 'clear_dry_debris', 'check_drains', 'keep_feed_dry',
  'work_cool_hours', 'shade_animals', 'avoid_open_fields', 'secure_loose_items',
  'store_drinking_water', 'check_official_updates', 'continue_safely',
] as const;
const ACTIONS_BY_HAZARD: Record<typeof ACTION_HAZARD_CLASSES[number], DailyActionId[]> = {
  'Cold Wave': ['cover_seedlings', 'shelter_animals'],
  Drought: ['save_irrigation', 'mulch_soil'],
  Fire: ['avoid_burning', 'clear_dry_debris'],
  'Flash Flood': ['check_drains', 'keep_feed_dry'],
  Flood: ['check_drains', 'keep_feed_dry'],
  'Heat Wave': ['work_cool_hours', 'shade_animals'],
  'Severe Local Storm': ['secure_loose_items', 'avoid_open_fields'],
  'Tropical Cyclone': ['secure_loose_items', 'store_drinking_water'],
};
const PEAKS: readonly string[] = ['unique', 'tied', 'unknown', 'none'];
const NOTES: readonly string[] = ['official_update_unverified', 'limited_forecast_detail'];
const ROW_KEYS = [
  'advisoryId', 'districtId', 'district', 'division', 'forecastDay', 'targetDate',
  'hazard', 'tier', 'severityScore', 'requiresReview', 'reasonCode', 'actionIds',
  'peak', 'qualityNotes', 'weather', 'metrics',
];
const WEATHER_BOUNDS: Record<string, [number, number]> = {
  precipitationMm: [0, 1000],
  temperatureMaxC: [-30, 65],
  temperatureMinC: [-40, 55],
  temperatureMeanC: [-35, 60],
  windKmh: [0, 450],
  humidityPct: [0, 100],
  dewpointC: [-45, 50],
  solarRadiationMjM2: [0, 60],
  evapotranspirationMm: [0, 50],
};
const METRIC_NUM_KEYS = [
  'confidence', 'confidenceRaw', 'modelSeverity', 'modelSeverityRaw',
  'physicsSeverity', 'finalSeverity', 'physicsTopSeverity', 'trackDivergence',
  'probTop1', 'probTop2', 'probTop3',
] as const;
const METRIC_HAZARD_KEYS = ['physicsTopHazard', 'top2Hazard', 'top3Hazard'] as const;
const METRIC_KEYS: readonly string[] = [...METRIC_NUM_KEYS, ...METRIC_HAZARD_KEYS, 'physicsOverride'];
const PAYLOAD_KEYS = [
  'schema', 'run', 'coverage', 'advisories', 'scope', 'status', 'asOf', 'selectedDate', 'count',
];
const RUN_KEYS = ['id', 'generatedAt', 'dataCutoff', 'expiresAt', 'modelVersion', 'inputSha256', 'sourceDatasetVersion'];
const COVERAGE_KEYS = ['districts', 'forecastDays', 'publishedRows'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const HOUR = 3_600_000;

export interface DailyWeather {
  precipitationMm?: number;
  temperatureMaxC?: number;
  temperatureMinC?: number;
  temperatureMeanC?: number;
  windKmh?: number;
  humidityPct?: number;
  dewpointC?: number;
  solarRadiationMjM2?: number;
  evapotranspirationMm?: number;
}

export interface DailyMetrics {
  confidence?: number;
  confidenceRaw?: number;
  modelSeverity?: number;
  modelSeverityRaw?: number;
  physicsSeverity?: number;
  finalSeverity?: number;
  physicsOverride?: boolean;
  physicsTopHazard?: typeof ACTION_HAZARD_CLASSES[number];
  physicsTopSeverity?: number;
  trackDivergence?: number;
  probTop1?: number;
  probTop2?: number;
  probTop3?: number;
  top2Hazard?: typeof ACTION_HAZARD_CLASSES[number];
  top3Hazard?: typeof ACTION_HAZARD_CLASSES[number];
}

export interface DailyAdvisory {
  advisoryId: string;
  districtId: number;
  district: string;
  division: string;
  forecastDay: number;
  targetDate: string;
  hazard: typeof ACTION_HAZARD_CLASSES[number];
  tier: DailyTier;
  severityScore: number;
  requiresReview: boolean;
  reasonCode: 'no_major_risk' | 'district_outlook';
  actionIds: DailyActionId[];
  peak: DailyPeak;
  qualityNotes: DailyQualityNote[];
  weather: DailyWeather;
  metrics?: DailyMetrics;
}

export interface DailyRun {
  id: string;
  generatedAt: string;
  dataCutoff: string;
  expiresAt: string;
  modelVersion: string;
  sourceDatasetVersion?: number;
}

export interface DistrictDailyResult {
  status: DailyStatus;
  source: 'api' | 'snapshot' | 'offline' | 'none';
  run: DailyRun | null;
  advisories: DailyAdvisory[];
  fetchedAt: string | null;
}

export interface NationalDailyResult {
  status: DailyStatus;
  source: 'api' | 'snapshot' | 'none';
  run: DailyRun | null;
  advisories: DailyAdvisory[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const oneOf = <T extends string>(value: unknown, list: readonly T[]): value is T =>
  typeof value === 'string' && list.includes(value as T);
const dateValue = (value: unknown): number | null => {
  if (typeof value !== 'string' || !DATE.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
};
const utcTime = (value: unknown): number | null => {
  if (typeof value !== 'string' || !UTC.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

export function dhakaCalendarDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const read = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${read('year')}-${read('month')}-${read('day')}`;
}

function parseRow(value: unknown): DailyAdvisory | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !ROW_KEYS.includes(key))
    || typeof value.advisoryId !== 'string' || !Number.isInteger(value.districtId)
    || (value.districtId as number) < 1 || (value.districtId as number) > 64
    || typeof value.district !== 'string' || !value.district || typeof value.division !== 'string'
    || !Number.isInteger(value.forecastDay) || (value.forecastDay as number) < 1
    || (value.forecastDay as number) > 15 || dateValue(value.targetDate) === null
    || !oneOf(value.hazard, ACTION_HAZARD_CLASSES) || !oneOf(value.tier, DAILY_TIERS)
    || typeof value.severityScore !== 'number' || !Number.isFinite(value.severityScore)
    || value.severityScore < 0 || value.severityScore > 1
    || typeof value.requiresReview !== 'boolean'
    || value.requiresReview !== REVIEW_TIERS.includes(value.tier)
    || !oneOf(value.reasonCode, ['no_major_risk', 'district_outlook'])
    || value.reasonCode !== (value.tier === 'NORMAL' ? 'no_major_risk' : 'district_outlook')
    || !oneOf(value.peak, PEAKS)
    || !Array.isArray(value.qualityNotes) || value.qualityNotes.some((note) => !oneOf(note, NOTES))
    || !Array.isArray(value.actionIds) || value.actionIds.length < 2 || value.actionIds.length > 4
    || value.actionIds.some((id) => !oneOf(id, ACTION_IDS))
    || !isRecord(value.weather) || Object.keys(value.weather).some((key) => !(key in WEATHER_BOUNDS))) return null;

  for (const [key, raw] of Object.entries(value.weather)) {
    const [min, max] = WEATHER_BOUNDS[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < min || raw > max) return null;
  }

  if (value.metrics !== undefined) {
    if (!isRecord(value.metrics) || Object.keys(value.metrics).some((key) => !METRIC_KEYS.includes(key))) {
      return null;
    }
    for (const [key, raw] of Object.entries(value.metrics)) {
      if (key === 'physicsOverride') {
        if (typeof raw !== 'boolean') return null;
      } else if ((METRIC_HAZARD_KEYS as readonly string[]).includes(key)) {
        if (!oneOf(raw, ACTION_HAZARD_CLASSES)) return null;
      } else if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > 1) {
        return null;
      }
    }
  }

  const row = value as unknown as DailyAdvisory;
  const district = ALL_64_DISTRICTS[row.districtId - 1];
  if (!district || canonicalKey(district.name) !== canonicalKey(row.district)
    || canonicalKey(district.division) !== canonicalKey(row.division)) return null;
  const expectedActions: DailyActionId[] = row.tier === 'NORMAL'
    ? ['check_official_updates', 'continue_safely']
    : [...ACTIONS_BY_HAZARD[row.hazard], 'check_official_updates'];
  if (row.advisoryId !== `${row.districtId}-${row.targetDate}-${row.hazard.toLowerCase().replace(/\s+/g, '-')}`
    || JSON.stringify(row.actionIds) !== JSON.stringify(expectedActions)) return null;
  return row;
}

function parseEnvelope(payload: unknown): { run: DailyRun; advisories: DailyAdvisory[]; remoteStale: boolean } | null {
  if (!isRecord(payload) || payload.schema !== DAILY_SCHEMA || !isRecord(payload.run)
    || !isRecord(payload.coverage) || !Array.isArray(payload.advisories)
    || Object.keys(payload).some((key) => !PAYLOAD_KEYS.includes(key))
    || Object.keys(payload.run).some((key) => !RUN_KEYS.includes(key))
    || Object.keys(payload.coverage).some((key) => !COVERAGE_KEYS.includes(key))
    || payload.coverage.forecastDays !== 15
    || !Number.isInteger(payload.coverage.districts)
    || (payload.coverage.districts as number) < 1 || (payload.coverage.districts as number) > 64
    || !Number.isInteger(payload.coverage.publishedRows)
    || (payload.coverage.publishedRows as number) < 0 || (payload.coverage.publishedRows as number) > 960
    || payload.advisories.length > 960) return null;

  if (payload.scope === undefined) {
    if (['scope', 'status', 'asOf', 'selectedDate', 'count'].some((key) => key in payload)
      || payload.advisories.length !== payload.coverage.publishedRows) return null;
  } else if (payload.scope !== 'timeline'
    || !oneOf(payload.status, ['fresh', 'stale'])
    || utcTime(payload.asOf) === null || payload.selectedDate !== null
    || !Number.isInteger(payload.count)
    || (payload.count as number) < 0 || (payload.count as number) > 960
    || payload.advisories.length !== payload.count) return null;

  const run = payload.run;
  const cutoff = utcTime(run.dataCutoff);
  const generated = utcTime(run.generatedAt);
  const expires = utcTime(run.expiresAt);
  if (typeof run.id !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(run.id)
    || typeof run.modelVersion !== 'string' || !run.modelVersion || run.modelVersion.length > 100
    || typeof run.inputSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(run.inputSha256)
    || (run.sourceDatasetVersion !== undefined && (!Number.isSafeInteger(run.sourceDatasetVersion)
      || (run.sourceDatasetVersion as number) < 1 || (run.sourceDatasetVersion as number) > 1_000_000_000))
    || generated === null || cutoff === null || expires === null
    || generated < cutoff || expires !== cutoff + 36 * HOUR) return null;

  const allRows: DailyAdvisory[] = [];
  const seen = new Set<string>();
  let firstDay: number | null = null;
  for (const entry of payload.advisories) {
    const row = parseRow(entry);
    if (!row || seen.has(`${row.districtId}-${row.targetDate}`)) return null;
    seen.add(`${row.districtId}-${row.targetDate}`);
    const start = dateValue(row.targetDate)! - (row.forecastDay - 1) * 24 * HOUR;
    if (firstDay !== null && firstDay !== start) return null;
    firstDay = start;
    allRows.push(row);
  }
  return {
    run: {
      id: run.id,
      generatedAt: run.generatedAt as string,
      dataCutoff: run.dataCutoff as string,
      expiresAt: run.expiresAt as string,
      modelVersion: run.modelVersion,
      ...(run.sourceDatasetVersion === undefined ? {} : { sourceDatasetVersion: run.sourceDatasetVersion as number }),
    },
    advisories: allRows,
    remoteStale: payload.status === 'stale',
  };
}

/** Reject the entire payload if any row leaks an unapproved field or invalid value. */
export function parsePublicDailyPayload(
  payload: unknown,
  district: string,
): { run: DailyRun; advisories: DailyAdvisory[]; remoteStale: boolean } | null {
  const parsed = parseEnvelope(payload);
  if (!parsed) return null;
  return {
    run: parsed.run,
    advisories: parsed.advisories
      .filter((row) => canonicalKey(row.district) === canonicalKey(district))
      .sort((a, b) => a.targetDate.localeCompare(b.targetDate)),
    remoteStale: parsed.remoteStale,
  };
}

export interface LoadDailyOptions { fetcher?: typeof fetch; now?: Date; signal?: AbortSignal }

/** Try a small district API answer, then the separately validated public static asset. */
export async function loadDistrictDaily(
  district: string,
  { fetcher = fetch, now = new Date(), signal }: LoadDailyOptions = {},
): Promise<DistrictDailyResult> {
  const empty: DistrictDailyResult = { status: 'unavailable', source: 'none', run: null, advisories: [], fetchedAt: null };
  for (const [url, source] of [
    [`${DAILY_API_URL}?scope=timeline&district=${encodeURIComponent(district)}&days=15`, 'api'],
    [DAILY_SNAPSHOT_URL, 'snapshot'],
  ] as const) {
    try {
      const response = await fetcher(url, { signal, cache: 'no-store', headers: { accept: 'application/json' } });
      if (!response.ok) continue;
      const parsed = parsePublicDailyPayload(await response.json(), district);
      if (!parsed) continue;
      const offline = response.headers.get('X-HazardNet-Stale') === '1';
      const status: DailyStatus = offline ? 'offline'
        : parsed.remoteStale || now.getTime() > Date.parse(parsed.run.expiresAt)
          || now.getTime() < Date.parse(parsed.run.dataCutoff) - 5 * 60_000 ? 'stale' : 'fresh';
      const today = dhakaCalendarDate(now);
      return {
        source: offline ? 'offline' : source,
        status,
        run: parsed.run,
        advisories: parsed.advisories.filter((row) => row.targetDate >= today),
        fetchedAt: offline ? null : now.toISOString(),
      };
    } catch {
      if (signal?.aborted) return empty;
    }
  }
  return empty;
}

/** Load the full 960-row national daily snapshot for cross-district summaries or horizon rollups. */
export async function loadNationalDailySnapshot(
  { fetcher = fetch, now = new Date(), signal }: LoadDailyOptions = {},
): Promise<NationalDailyResult> {
  const empty: NationalDailyResult = { status: 'unavailable', source: 'none', run: null, advisories: [] };
  for (const [url, source] of [
    [`${DAILY_API_URL}?scope=timeline&days=15`, 'api'],
    [DAILY_SNAPSHOT_URL, 'snapshot'],
  ] as const) {
    try {
      const response = await fetcher(url, { signal, cache: 'no-store', headers: { accept: 'application/json' } });
      if (!response.ok) continue;
      const ct = response.headers.get('content-type') || '';
      if (ct.includes('text/html')) continue;
      const parsed = parseEnvelope(await response.json());
      if (!parsed) continue;
      const status: DailyStatus = parsed.remoteStale
        || now.getTime() > Date.parse(parsed.run.expiresAt)
        || now.getTime() < Date.parse(parsed.run.dataCutoff) - 5 * 60_000 ? 'stale' : 'fresh';
      return {
        status,
        source,
        run: parsed.run,
        advisories: parsed.advisories,
      };
    } catch {
      if (signal?.aborted) return empty;
    }
  }
  return empty;
}

/** Roll up 960 daily advisory rows into canonical `7_days` or `15_days` ForecastRow records. */
export function rollupDailyAdvisoriesToForecastRows(
  advisories: DailyAdvisory[],
  run: DailyRun,
  horizon: ForecastHorizon,
): ForecastRow[] {
  const maxDay = horizon === '7_days' ? 7 : 15;
  const byDistrict = new Map<number, DailyAdvisory[]>();
  for (const row of advisories) {
    if (row.forecastDay > maxDay) continue;
    const list = byDistrict.get(row.districtId) || [];
    list.push(row);
    byDistrict.set(row.districtId, list);
  }

  const predictionDate = run.generatedAt.slice(0, 10);
  const out: ForecastRow[] = [];

  for (const [districtId, windowRows] of byDistrict.entries()) {
    const districtMeta = ALL_64_DISTRICTS[districtId - 1];
    if (!districtMeta || windowRows.length === 0) continue;

    const peakRow = windowRows.reduce((best, candidate) => {
      if (candidate.severityScore > best.severityScore) return candidate;
      if (candidate.severityScore < best.severityScore) return best;
      if (candidate.peak === 'unique' && best.peak !== 'unique') return candidate;
      if (TIER_RANK[candidate.tier] > TIER_RANK[best.tier]) return candidate;
      return candidate.forecastDay < best.forecastDay ? candidate : best;
    }, windowRows[0]);

    const m = peakRow.metrics || {};
    const w = peakRow.weather || {};
    const confidence = m.confidence ?? m.probTop1 ?? Math.max(0.5, peakRow.severityScore);

    out.push({
      district_id: districtId,
      district_name: peakRow.district,
      division: peakRow.division,
      horizon,
      hazard_type: peakRow.hazard,
      severity_score: peakRow.severityScore,
      final_severity: m.finalSeverity ?? peakRow.severityScore,
      model_severity: m.modelSeverity ?? peakRow.severityScore,
      model_severity_raw: m.modelSeverityRaw,
      physics_severity: m.physicsSeverity ?? peakRow.severityScore,
      physics_override: m.physicsOverride,
      advisory_tier: peakRow.tier,
      advisory_tier_source: 'published',
      requires_review: peakRow.requiresReview,
      confidence,
      confidence_raw: m.confidenceRaw,
      confidence_kind: m.confidence !== undefined
        ? (m.confidenceRaw !== undefined ? 'calibrated_probability' : 'model_softmax_top_class')
        : 'model_softmax_top_class',
      prob_top1: m.probTop1,
      prob_top2: m.probTop2,
      prob_top3: m.probTop3,
      temperature_max: w.temperatureMaxC,
      temperature_min: w.temperatureMinC,
      temperature_mean: w.temperatureMeanC,
      precipitation_mm: w.precipitationMm,
      wind_max_kmh: w.windKmh,
      dewpoint_mean: w.dewpointC,
      solar_radiation_mj_m2: w.solarRadiationMjM2,
      evapotranspiration_mm: w.evapotranspirationMm,
      latitude: districtMeta.lat,
      longitude: districtMeta.lng,
      target_date: peakRow.targetDate,
      prediction_date: predictionDate,
      data_source: 'Kaggle_Daily_Advisory',
      model_version: run.modelVersion,
    });
  }

  return out;
}

/** Convert one district's daily advisory rows (Days 1..7 or 1..15) into ForecastRow records. */
export function dailyAdvisoriesToDistrictForecastRows(
  advisories: DailyAdvisory[],
  run: DailyRun,
  horizon: ForecastHorizon,
): ForecastRow[] {
  const maxDay = horizon === '7_days' ? 7 : 15;
  const predictionDate = run.generatedAt.slice(0, 10);

  return advisories
    .filter((row) => row.forecastDay <= maxDay)
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
    .map((row) => {
      const districtMeta = ALL_64_DISTRICTS[row.districtId - 1];
      const m = row.metrics || {};
      const w = row.weather || {};
      const confidence = m.confidence ?? m.probTop1 ?? Math.max(0.5, row.severityScore);
      return {
        district_id: row.districtId,
        district_name: row.district,
        division: row.division,
        horizon,
        hazard_type: row.hazard,
        severity_score: row.severityScore,
        final_severity: m.finalSeverity ?? row.severityScore,
        model_severity: m.modelSeverity ?? row.severityScore,
        model_severity_raw: m.modelSeverityRaw,
        physics_severity: m.physicsSeverity ?? row.severityScore,
        physics_override: m.physicsOverride,
        advisory_tier: row.tier,
        advisory_tier_source: 'published',
        requires_review: row.requiresReview,
        confidence,
        confidence_raw: m.confidenceRaw,
        confidence_kind: m.confidence !== undefined
          ? (m.confidenceRaw !== undefined ? 'calibrated_probability' : 'model_softmax_top_class')
          : 'model_softmax_top_class',
        prob_top1: m.probTop1,
        prob_top2: m.probTop2,
        prob_top3: m.probTop3,
        temperature_max: w.temperatureMaxC,
        temperature_min: w.temperatureMinC,
        temperature_mean: w.temperatureMeanC,
        precipitation_mm: w.precipitationMm,
        wind_max_kmh: w.windKmh,
        dewpoint_mean: w.dewpointC,
        solar_radiation_mj_m2: w.solarRadiationMjM2,
        evapotranspiration_mm: w.evapotranspirationMm,
        latitude: districtMeta?.lat,
        longitude: districtMeta?.lng,
        target_date: row.targetDate,
        prediction_date: predictionDate,
        data_source: 'Kaggle_Daily_Advisory',
        model_version: run.modelVersion,
      };
    });
}

