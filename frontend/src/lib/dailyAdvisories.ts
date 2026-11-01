/**
 * Typed, fail-closed public district/day client. This does NOT consume the private
 * technical CSV, infer a second hazard, or turn a model score into certainty.
 */
import { canonicalKey } from './forecasts';
import { ACTION_HAZARD_CLASSES } from './advisoryActions';
import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';

export const DAILY_API_URL = '/api/v1/advisories';
export const DAILY_SNAPSHOT_URL = '/data/daily-advisories-v1.json';
export const DAILY_SCHEMA = 'hazardnet-daily-advisories/v1';

export type DailyTier = 'NORMAL' | 'WATCH';
export type DailyPeak = 'unique' | 'tied' | 'unknown' | 'none';
export type DailyQualityNote = 'official_update_unverified' | 'limited_forecast_detail';
export type DailyActionId = typeof ACTION_IDS[number];
export type DailyStatus = 'fresh' | 'stale' | 'offline' | 'unavailable';

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
  'hazard', 'tier', 'reasonCode', 'actionIds', 'peak', 'qualityNotes', 'weather',
];
const PAYLOAD_KEYS = [
  'schema', 'run', 'coverage', 'advisories', 'scope', 'status', 'asOf', 'selectedDate', 'count',
];
const RUN_KEYS = ['id', 'generatedAt', 'dataCutoff', 'expiresAt', 'modelVersion', 'inputSha256', 'sourceDatasetVersion'];
const COVERAGE_KEYS = ['districts', 'forecastDays', 'publishedRows'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const HOUR = 3_600_000;

export interface DailyAdvisory {
  advisoryId: string;
  districtId: number;
  district: string;
  division: string;
  forecastDay: number;
  targetDate: string;
  hazard: typeof ACTION_HAZARD_CLASSES[number];
  tier: DailyTier;
  reasonCode: 'no_major_risk' | 'district_outlook';
  actionIds: DailyActionId[];
  peak: DailyPeak;
  qualityNotes: DailyQualityNote[];
  weather: { precipitationMm?: number; temperatureMaxC?: number; windKmh?: number };
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
    || !oneOf(value.hazard, ACTION_HAZARD_CLASSES) || !oneOf(value.tier, ['NORMAL', 'WATCH'])
    || !oneOf(value.reasonCode, ['no_major_risk', 'district_outlook'])
    || value.reasonCode !== (value.tier === 'NORMAL' ? 'no_major_risk' : 'district_outlook')
    || !oneOf(value.peak, PEAKS)
    || !Array.isArray(value.qualityNotes) || value.qualityNotes.some((note) => !oneOf(note, NOTES))
    || !Array.isArray(value.actionIds) || value.actionIds.length < 2 || value.actionIds.length > 4
    || value.actionIds.some((id) => !oneOf(id, ACTION_IDS))
    || !isRecord(value.weather) || Object.keys(value.weather).some((key) =>
      !['precipitationMm', 'temperatureMaxC', 'windKmh'].includes(key))) return null;
  for (const [key, raw] of Object.entries(value.weather)) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)
      || (key === 'temperatureMaxC' ? raw < -20 || raw > 60
        : raw < 0 || raw > (key === 'windKmh' ? 400 : 500))) return null;
  }
  const row = value as unknown as DailyAdvisory;
  // Keep a published row bound to the selected district, even if a static file
  // is replaced after the server-side projection. Index parity is tested against
  // the backend's canonical registry for all 64 districts.
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

/** Reject the entire payload if any row leaks an unapproved tier or private column. */
export function parsePublicDailyPayload(payload: unknown, district: string): { run: DailyRun; advisories: DailyAdvisory[]; remoteStale: boolean } | null {
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

  // API timeline envelopes and static assets are two explicit contracts. A
  // malformed query response must not be mistaken for a static snapshot.
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
  const rows: DailyAdvisory[] = [];
  const seen = new Set<string>();
  let firstDay: number | null = null;
  for (const entry of payload.advisories) {
    const row = parseRow(entry);
    if (!row || seen.has(`${row.districtId}-${row.targetDate}`)) return null;
    seen.add(`${row.districtId}-${row.targetDate}`);
    const start = dateValue(row.targetDate)! - (row.forecastDay - 1) * 24 * HOUR;
    if (firstDay !== null && firstDay !== start) return null;
    firstDay = start;
    if (canonicalKey(row.district) === canonicalKey(district)) rows.push(row);
  }
  return {
    run: { id: run.id, generatedAt: run.generatedAt as string, dataCutoff: run.dataCutoff as string,
      expiresAt: run.expiresAt as string, modelVersion: run.modelVersion,
      ...(run.sourceDatasetVersion === undefined ? {} : { sourceDatasetVersion: run.sourceDatasetVersion as number }) },
    advisories: rows.sort((a, b) => a.targetDate.localeCompare(b.targetDate)),
    remoteStale: payload.status === 'stale',
  };
}

export interface LoadDailyOptions { fetcher?: typeof fetch; now?: Date; signal?: AbortSignal }

/** Try a small district API answer, then the separately validated public-only static asset. */
export async function loadDistrictDaily(district: string, { fetcher = fetch, now = new Date(), signal }: LoadDailyOptions = {}): Promise<DistrictDailyResult> {
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
        source: offline ? 'offline' : source, status,
        run: parsed.run, advisories: parsed.advisories.filter((row) => row.targetDate >= today),
        fetchedAt: offline ? null : now.toISOString(),
      };
    } catch {
      if (signal?.aborted) return empty;
    }
  }
  return empty;
}
