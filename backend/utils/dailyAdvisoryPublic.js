/**
 * Public-only projection of a district/day advisory export.
 *
 * The upstream technical export is a private input. This module knows only the
 * published result, date, district and a few availability flags. Never add a
 * pass-through of input rows to this snapshot: the static asset is world-readable.
 */
import { z } from 'zod';
import { lookupDistrict } from './districtRegistry.js';

const VALID_HAZARDS = [
  'Cold Wave', 'Drought', 'Fire', 'Flash Flood', 'Flood', 'Heat Wave',
  'Severe Local Storm', 'Tropical Cyclone',
];

export const DAILY_ADVISORY_SCHEMA = 'hazardnet-daily-advisories/v1';
export const DAILY_ADVISORY_DAYS = 15;
export const DAILY_ADVISORY_MAX_AGE_HOURS = 36;
export const DAILY_PUBLIC_TIERS = ['NORMAL', 'WATCH'];
const ALL_TIERS = [...DAILY_PUBLIC_TIERS, 'WARNING', 'SEVERE', 'EXTREME'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const utcTime = z.string().regex(UTC).refine((value) => !Number.isNaN(Date.parse(value)));
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const dailyAdvisoryManifestSchema = z.object({
  schema_version: z.literal('4.3-pb'),
  run_id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/),
  generated_at: utcTime,
  data_cutoff: utcTime,
  model_version: z.string().min(1).max(100),
  csv_sha256: digest,
}).strict();

// An authorized project owner or release operator issues this minimal release
// receipt. No separate producer identity is required. The receipt is never
// copied into the public snapshot; issuer/reviewer authority and run evidence
// must be verified outside this repository. Field validation cannot do that.
const issuedName = z.string().min(2).max(120).refine((value) =>
  value === value.trim() && !/^(?:TBD|TODO|UNKNOWN|N\/A)(?:\b|_)/i.test(value));
const approved = (scope, boundField) => z.object({
  status: z.literal('approved'),
  approved_by: issuedName,
  approved_at_utc: utcTime,
  scope: z.literal(scope),
  [boundField]: digest,
}).strict();

export const publishableDailyManifestSchema = z.object({
  manifest_version: z.literal('1.0'),
  status: z.literal('issued'),
  artifact: z.object({
    type: z.literal('hazardnet_advisory_csv'),
    filename: z.string().min(5).max(160).regex(/^[a-zA-Z0-9._-]+\.csv$/),
    sha256: digest,
    size_bytes: z.number().int().positive().max(10 * 1024 * 1024),
    rows: z.number().int().positive().max(64 * 15),
    columns: z.number().int().positive().max(256),
    district_count: z.number().int().min(1).max(64),
    forecast_window_start: z.string().regex(DATE),
    forecast_window_end: z.string().regex(DATE),
  }).strict(),
  run: z.object({
    run_id: dailyAdvisoryManifestSchema.shape.run_id,
    pipeline_version: issuedName,
    schema_version: z.literal('4.3-pb'),
    model_version: issuedName,
    started_at_utc: utcTime,
    completed_at_utc: utcTime,
    data_cutoff_utc: utcTime,
    time_zone: z.literal('UTC'),
  }).strict(),
  issuer: z.object({
    issued_by: issuedName,
    role: z.enum(['project_owner', 'authorized_operator']),
    issued_at_utc: utcTime,
  }).strict(),
  approvals: z.object({
    release_approval: approved('public advisory publication', 'artifact_sha256'),
    bangla_copy_approval: approved('Bangla farmer-facing copy', 'copy_sha256'),
  }).strict(),
  publication: z.object({ status: z.literal('approved') }).strict(),
}).strict();

const publicAdvisorySchema = z.object({
  advisoryId: z.string().min(1),
  districtId: z.number().int().min(1).max(64),
  district: z.string().min(1),
  division: z.string().min(1),
  forecastDay: z.number().int().min(1).max(DAILY_ADVISORY_DAYS),
  targetDate: z.string().regex(DATE),
  hazard: z.enum(VALID_HAZARDS),
  tier: z.enum(DAILY_PUBLIC_TIERS),
  reasonCode: z.enum(['district_outlook', 'no_major_risk']),
  actionIds: z.array(z.string().regex(/^[a-z_]+$/)).min(2).max(4),
  peak: z.enum(['unique', 'tied', 'unknown', 'none']),
  qualityNotes: z.array(z.enum(['official_update_unverified', 'limited_forecast_detail'])),
  weather: z.object({
    precipitationMm: z.number().min(0).max(500).optional(),
    temperatureMaxC: z.number().min(-20).max(60).optional(),
    windKmh: z.number().min(0).max(400).optional(),
  }).strict(),
}).strict();

export const publicDailySnapshotSchema = z.object({
  schema: z.literal(DAILY_ADVISORY_SCHEMA),
  run: z.object({
    id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/),
    generatedAt: utcTime,
    dataCutoff: utcTime,
    expiresAt: utcTime,
    modelVersion: z.string().min(1).max(100),
    inputSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  coverage: z.object({
    districts: z.number().int().min(1).max(64),
    forecastDays: z.literal(DAILY_ADVISORY_DAYS),
    publishedRows: z.number().int().min(0).max(64 * DAILY_ADVISORY_DAYS),
  }).strict(),
  advisories: z.array(publicAdvisorySchema).max(64 * DAILY_ADVISORY_DAYS),
}).strict();

function fail(message) {
  throw new Error(`Daily advisory publication refused: ${message}`);
}

function dateValue(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
    ? parsed : null;
}

function integer(value, min, max) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

function decimal(value, min, max) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function bool(value) {
  if (value === true || value === false) return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'true' || text === '1') return true;
  if (text === 'false' || text === '0') return false;
  return null;
}

/** An absent optional weather value stays absent; an invalid one is never coerced to zero. */
function optionalWeather(raw, field, min, max, rowNumber) {
  if (raw[field] === '' || raw[field] === null || raw[field] === undefined) return undefined;
  const value = decimal(raw[field], min, max);
  if (value === null) fail(`row ${rowNumber} has invalid ${field}`);
  return value;
}

export function validateDailyManifest(raw, {
  sha256, now = new Date(), maxAgeHours = DAILY_ADVISORY_MAX_AGE_HOURS, allowStale = false,
} = {}) {
  const result = dailyAdvisoryManifestSchema.safeParse(raw);
  if (!result.success) fail('a complete UTC run manifest is required');
  const manifest = result.data;
  if (manifest.csv_sha256 !== sha256) fail('input checksum does not match the run manifest');
  const generated = Date.parse(manifest.generated_at);
  const cutoff = Date.parse(manifest.data_cutoff);
  const current = now.getTime();
  if (!Number.isFinite(current) || !Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
    fail('invalid freshness configuration');
  }
  if (generated < cutoff || cutoff > current + 5 * 60_000 || generated > current + 5 * 60_000) {
    fail('generation time and data cutoff are inconsistent');
  }
  if (!allowStale && current - cutoff > maxAgeHours * HOUR) fail('source data cutoff is stale');
  return manifest;
}

/**
 * Machine-check an owner/operator-issued, approval-bound receipt against CSV
 * facts. This does not verify the issuer's authority, underlying UTC evidence
 * or a cryptographic signature; those must be checked outside this checkout.
 * Nothing from the private approval record is returned in the public snapshot.
 */
export function validatePublishableDailyManifest(raw, {
  sha256, copySha256, filename, sizeBytes, rows, columns, districts, firstDate, lastDate,
  now = new Date(), allowStale = false,
} = {}) {
  const result = publishableDailyManifestSchema.safeParse(raw);
  if (!result.success || /^(?:TBD|TODO|UNKNOWN)(?:\b|_)/i.test(result.data?.run.run_id || '')) {
    fail('a complete owner-issued publication receipt with bound approvals is required');
  }
  const { artifact, run, issuer, approvals } = result.data;
  if (artifact.sha256 !== sha256 || artifact.filename !== filename
    || artifact.size_bytes !== sizeBytes || artifact.rows !== rows || artifact.columns !== columns
    || artifact.district_count !== districts || artifact.forecast_window_start !== firstDate
    || artifact.forecast_window_end !== lastDate
    || approvals.release_approval.artifact_sha256 !== sha256
    || !copySha256 || approvals.bangla_copy_approval.copy_sha256 !== copySha256) {
    fail('publication manifest does not match the CSV artifact or approved copy revision');
  }
  const current = now.getTime();
  const started = Date.parse(run.started_at_utc);
  const completed = Date.parse(run.completed_at_utc);
  const released = Date.parse(approvals.release_approval.approved_at_utc);
  const copyApproved = Date.parse(approvals.bangla_copy_approval.approved_at_utc);
  const issued = Date.parse(issuer.issued_at_utc);
  if (!Number.isFinite(current) || started > completed || released < completed
    || issued < completed || issued < released || issued < copyApproved
    || [started, released, copyApproved, issued].some((time) => time > current + 5 * 60_000)) {
    fail('publication issuance and approval times are inconsistent');
  }
  return validateDailyManifest({
    schema_version: run.schema_version,
    run_id: run.run_id,
    generated_at: run.completed_at_utc,
    data_cutoff: run.data_cutoff_utc,
    model_version: run.model_version,
    csv_sha256: artifact.sha256,
  }, { sha256, now, allowStale });
}

/**
 * Validate a complete continuous ledger and return ONLY the approved public projection.
 * The technical source rows are never retained on the returned object.
 * `expectedDistricts` is a test seam; production callers must use the default 64.
 */
export function buildPublicDailySnapshot(rows, manifest, { expectedDistricts = 64 } = {}) {
  if (!Array.isArray(rows) || !Number.isInteger(expectedDistricts) || expectedDistricts < 1
    || expectedDistricts > 64 || rows.length !== expectedDistricts * DAILY_ADVISORY_DAYS) {
    fail(`expected ${expectedDistricts * DAILY_ADVISORY_DAYS} district/day rows`);
  }

  const districts = new Map();
  const globalDates = new Map();
  for (const [index, raw] of rows.entries()) {
    const rowNumber = index + 2;
    if (!raw || typeof raw !== 'object') fail(`row ${rowNumber} is missing`);
    const district = lookupDistrict(String(raw.district || '').trim());
    if (!district) fail(`row ${rowNumber} has an unknown district`);
    const day = integer(raw.forecast_day, 1, DAILY_ADVISORY_DAYS);
    const targetDate = dateValue(raw.target_date);
    const hazard = String(raw.hazard || '').trim();
    const tier = String(raw.advisory_tier || '').trim();
    const severity = decimal(raw.severity_score, 0, 1);
    const flagged = bool(raw.is_peak_day);
    const bmdStale = bool(raw.bmd_stale);
    const degraded = bool(raw.physics_degraded);
    if (!day || targetDate === null || !VALID_HAZARDS.includes(hazard)
      || !ALL_TIERS.includes(tier) || severity === null
      || flagged === null || bmdStale === null || degraded === null) {
      fail(`row ${rowNumber} has an invalid required result, date, score or availability flag`);
    }
    if (globalDates.has(day) && globalDates.get(day) !== targetDate) {
      fail(`row ${rowNumber} does not match the national date for day ${day}`);
    }
    globalDates.set(day, targetDate);

    const group = districts.get(district.district_id) || new Map();
    if (group.has(day)) fail(`district ${district.district_id} has duplicate day ${day}`);
    group.set(day, {
      district, day, targetDate: raw.target_date, hazard, tier, severity, flagged,
      bmdStale, degraded,
      weather: {
        ...(hazard === 'Flood' || hazard === 'Flash Flood' || hazard === 'Drought'
          ? { precipitationMm: optionalWeather(raw, 'om_precip_mm', 0, 500, rowNumber) } : {}),
        ...(hazard === 'Heat Wave' || hazard === 'Cold Wave'
          ? { temperatureMaxC: optionalWeather(raw, 'om_max_temp_c', -20, 60, rowNumber) } : {}),
        ...(hazard === 'Tropical Cyclone' || hazard === 'Severe Local Storm'
          ? { windKmh: optionalWeather(raw, 'om_wind_kmh', 0, 400, rowNumber) } : {}),
      },
    });
    districts.set(district.district_id, group);
  }

  if (districts.size !== expectedDistricts || globalDates.size !== DAILY_ADVISORY_DAYS) {
    fail('incomplete district or national day coverage');
  }
  const start = globalDates.get(1);
  for (let day = 1; day <= DAILY_ADVISORY_DAYS; day += 1) {
    if (globalDates.get(day) !== start + (day - 1) * DAY) {
      fail(`day ${day} is not consecutive with day 1`);
    }
  }

  const advisories = [];
  for (const [districtId, group] of districts) {
    if (group.size !== DAILY_ADVISORY_DAYS) fail(`district ${districtId} has missing days`);
    const ordered = Array.from({ length: DAILY_ADVISORY_DAYS }, (_, i) => group.get(i + 1));
    if (ordered.some((row) => !row)) fail(`district ${districtId} has missing days`);
    const max = Math.max(...ordered.map((row) => row.severity));
    const maxima = ordered.filter((row) => row.severity === max);
    const marked = ordered.filter((row) => row.flagged);
    if (marked.length !== 1 || marked[0] !== maxima[0]) {
      fail(`district ${districtId} has an inconsistent peak marker`);
    }
    const allPublic = ordered.every((row) => DAILY_PUBLIC_TIERS.includes(row.tier));
    const peak = allPublic ? (maxima.length === 1 ? 'unique' : 'tied') : 'unknown';
    for (const row of ordered) {
      // A higher tier is *not* a published alert. Only the existing reviewed alert
      // lifecycle may make one public; this snapshot cannot authorize it.
      if (!DAILY_PUBLIC_TIERS.includes(row.tier)) continue;
      const qualityNotes = [
        ...(row.bmdStale ? ['official_update_unverified'] : []),
        ...(row.degraded ? ['limited_forecast_detail'] : []),
      ];
      const slug = row.hazard.toLowerCase().replace(/\s+/g, '-');
      advisories.push({
        advisoryId: `${districtId}-${row.targetDate}-${slug}`,
        districtId,
        district: row.district.district_name,
        division: row.district.division,
        forecastDay: row.day,
        targetDate: row.targetDate,
        hazard: row.hazard,
        tier: row.tier,
        reasonCode: row.tier === 'NORMAL' ? 'no_major_risk' : 'district_outlook',
        actionIds: actionsForHazard(row.hazard, row.tier),
        peak: peak === 'unique' ? (row === maxima[0] ? 'unique' : 'none') : peak,
        qualityNotes,
        weather: Object.fromEntries(Object.entries(row.weather).filter(([, value]) => value !== undefined)),
      });
    }
  }
  advisories.sort((a, b) => a.districtId - b.districtId || a.forecastDay - b.forecastDay);
  const parsedManifest = dailyAdvisoryManifestSchema.safeParse(manifest);
  if (!parsedManifest.success) fail('a valid run manifest is required');
  const meta = parsedManifest.data;
  const snapshot = {
    schema: DAILY_ADVISORY_SCHEMA,
    run: {
      id: meta.run_id,
      generatedAt: meta.generated_at,
      dataCutoff: meta.data_cutoff,
      expiresAt: new Date(Date.parse(meta.data_cutoff) + DAILY_ADVISORY_MAX_AGE_HOURS * HOUR).toISOString(),
      modelVersion: meta.model_version,
      inputSha256: meta.csv_sha256,
    },
    coverage: { districts: districts.size, forecastDays: DAILY_ADVISORY_DAYS, publishedRows: advisories.length },
    advisories,
  };
  return publicDailySnapshotSchema.parse(snapshot);
}

// Fixed action identifiers, not arbitrary input prose. Copy lives in the site's
// English/Bangla dictionary and remains subject to editorial review.
export function actionsForHazard(hazard, tier) {
  const byHazard = {
    'Cold Wave': ['cover_seedlings', 'shelter_animals'],
    Drought: ['save_irrigation', 'mulch_soil'],
    Fire: ['avoid_burning', 'clear_dry_debris'],
    'Flash Flood': ['check_drains', 'keep_feed_dry'],
    Flood: ['check_drains', 'keep_feed_dry'],
    'Heat Wave': ['work_cool_hours', 'shade_animals'],
    'Severe Local Storm': ['secure_loose_items', 'avoid_open_fields'],
    'Tropical Cyclone': ['secure_loose_items', 'store_drinking_water'],
  };
  return tier === 'NORMAL' ? ['check_official_updates', 'continue_safely']
    : [...(byHazard[hazard] || []), 'check_official_updates'];
}

/** Re-check the public boundary on *every* read, not only in the build command. */
export function parsePublicDailySnapshot(value) {
  const parsed = publicDailySnapshotSchema.safeParse(value);
  if (!parsed.success) return null;
  const snapshot = parsed.data;
  if (snapshot.advisories.length !== snapshot.coverage.publishedRows) return null;
  const cutoff = Date.parse(snapshot.run.dataCutoff);
  if (Date.parse(snapshot.run.generatedAt) < cutoff
    || Date.parse(snapshot.run.expiresAt) !== cutoff + DAILY_ADVISORY_MAX_AGE_HOURS * HOUR) return null;
  const keys = new Set();
  let firstDate = null;
  for (const row of snapshot.advisories) {
    const district = lookupDistrict(row.district);
    const date = dateValue(row.targetDate);
    if (!district || district.district_id !== row.districtId
      || district.district_name !== row.district || district.division !== row.division
      || date === null || row.reasonCode !== (row.tier === 'NORMAL' ? 'no_major_risk' : 'district_outlook')
      || JSON.stringify(row.actionIds) !== JSON.stringify(actionsForHazard(row.hazard, row.tier))) return null;
    const key = `${row.districtId}-${row.targetDate}-${row.hazard.toLowerCase().replace(/\s+/g, '-')}`;
    if (row.advisoryId !== key || keys.has(key)) return null;
    keys.add(key);
    const dayOne = date - (row.forecastDay - 1) * DAY;
    if (firstDate !== null && firstDate !== dayOne) return null;
    firstDate = dayOne;
  }
  return snapshot;
}

/** Distinguish an old but readable copy from a currently usable one. */
export function publicDailyStatus(snapshot, now = new Date()) {
  if (!snapshot || !Number.isFinite(now.getTime())) return 'unavailable';
  return now.getTime() < Date.parse(snapshot.run.dataCutoff) - 5 * 60_000
    || now.getTime() > Date.parse(snapshot.run.expiresAt) ? 'stale' : 'fresh';
}
