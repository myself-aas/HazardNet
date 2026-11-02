/**
 * Public projection of the Kaggle 64-district × 15-day daily advisory export.
 *
 * Publishes all 5 advisory tiers (NORMAL, WATCH, WARNING, SEVERE, EXTREME),
 * severityScore, meteorological drivers, and forecast track metrics while
 * keeping strict field whitelisting so private internal columns (e.g.,
 * fusion_reason or free-text researcher notes) never enter public artifacts.
 *
 * Platform-neutral (zod + districtRegistry only; no node:* built-ins) so both
 * Node scripts and Cloudflare Pages Functions bundle this module cleanly.
 */
import { z } from 'zod';
import { DISTRICT_REGISTRY, lookupDistrict } from './districtRegistry.js';

export const VALID_HAZARDS = [
  'Cold Wave', 'Drought', 'Fire', 'Flash Flood', 'Flood', 'Heat Wave',
  'Severe Local Storm', 'Tropical Cyclone',
];

export const DAILY_ADVISORY_SCHEMA = 'hazardnet-daily-advisories/v1';
export const DAILY_ADVISORY_DAYS = 15;
export const DAILY_ADVISORY_MAX_AGE_HOURS = 36;
export const DAILY_PUBLIC_TIERS = ['NORMAL', 'WATCH', 'WARNING', 'SEVERE', 'EXTREME'];
export const REQUIRES_REVIEW_TIERS = ['WARNING', 'SEVERE', 'EXTREME'];
const ALL_TIERS = DAILY_PUBLIC_TIERS;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const utcTime = z.string().regex(UTC).refine((value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value.slice(0, 10);
});
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const isRunFact = (value) => value === value.trim()
  && !/^(?:TBD|TODO|UNKNOWN|N\/A)(?:\b|_)/i.test(value);

export const dailyAdvisoryManifestSchema = z.object({
  schema_version: z.literal('4.3-pb'),
  run_id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/).refine(isRunFact),
  generated_at: utcTime,
  data_cutoff: utcTime,
  model_version: z.string().min(1).max(100).refine(isRunFact),
  csv_sha256: digest,
}).strict();

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

export const publicWeatherSchema = z.object({
  precipitationMm: z.number().min(0).max(1000).optional(),
  temperatureMaxC: z.number().min(-30).max(65).optional(),
  temperatureMinC: z.number().min(-40).max(55).optional(),
  temperatureMeanC: z.number().min(-35).max(60).optional(),
  windKmh: z.number().min(0).max(450).optional(),
  humidityPct: z.number().min(0).max(100).optional(),
  dewpointC: z.number().min(-45).max(50).optional(),
  solarRadiationMjM2: z.number().min(0).max(60).optional(),
  evapotranspirationMm: z.number().min(0).max(50).optional(),
}).strict();

export const publicMetricsSchema = z.object({
  confidence: z.number().min(0).max(1).optional(),
  confidenceRaw: z.number().min(0).max(1).optional(),
  modelSeverity: z.number().min(0).max(1).optional(),
  modelSeverityRaw: z.number().min(0).max(1).optional(),
  physicsSeverity: z.number().min(0).max(1).optional(),
  finalSeverity: z.number().min(0).max(1).optional(),
  physicsOverride: z.boolean().optional(),
  physicsTopHazard: z.enum(VALID_HAZARDS).optional(),
  physicsTopSeverity: z.number().min(0).max(1).optional(),
  trackDivergence: z.number().min(0).max(1).optional(),
  probTop1: z.number().min(0).max(1).optional(),
  probTop2: z.number().min(0).max(1).optional(),
  probTop3: z.number().min(0).max(1).optional(),
  top2Hazard: z.enum(VALID_HAZARDS).optional(),
  top3Hazard: z.enum(VALID_HAZARDS).optional(),
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
  severityScore: z.number().min(0).max(1),
  requiresReview: z.boolean(),
  reasonCode: z.enum(['district_outlook', 'no_major_risk']),
  actionIds: z.array(z.string().regex(/^[a-z_]+$/)).min(2).max(4),
  peak: z.enum(['unique', 'tied', 'unknown', 'none']),
  qualityNotes: z.array(z.enum(['official_update_unverified', 'limited_forecast_detail'])),
  weather: publicWeatherSchema,
  metrics: publicMetricsSchema.optional(),
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
    sourceDatasetVersion: z.number().int().positive().max(1_000_000_000).optional(),
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

function round4(value) {
  return Math.round(value * 10000) / 10000;
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
  return Number.isFinite(number) && number >= min && number <= max ? round4(number) : null;
}

function bool(value) {
  if (value === true || value === false) return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'true' || text === '1') return true;
  if (text === 'false' || text === '0') return false;
  return null;
}

function optionalBool(raw, field, defaultVal, rowNumber) {
  if (raw[field] === '' || raw[field] === null || raw[field] === undefined) return defaultVal;
  const parsed = bool(raw[field]);
  if (parsed === null) fail(`row ${rowNumber} has an invalid required result, date, score or availability flag`);
  return parsed;
}

function firstOptionalDecimal(raw, fields, min, max, rowNumber, transform = (v) => v) {
  for (const field of fields) {
    if (raw[field] === '' || raw[field] === null || raw[field] === undefined) continue;
    const rawNum = Number(String(raw[field]).trim());
    if (!Number.isFinite(rawNum)) fail(`row ${rowNumber} has invalid ${field}`);
    const transformed = round4(transform(rawNum));
    if (transformed < min || transformed > max) fail(`row ${rowNumber} has invalid ${field}`);
    return transformed;
  }
  return undefined;
}

function firstOptionalHazard(raw, fields, rowNumber) {
  for (const field of fields) {
    if (raw[field] === '' || raw[field] === null || raw[field] === undefined) continue;
    const value = String(raw[field]).trim();
    if (!VALID_HAZARDS.includes(value)) fail(`row ${rowNumber} has invalid ${field}`);
    return value;
  }
  return undefined;
}

/**
 * Normalize an ISO-like UTC timestamp (including Kaggle's 7-digit fractional
 * seconds or `YYYY-MM-DD HH:MM:SS` UTC strings) into canonical `.sssZ` ISO.
 */
export function normalizeUtcTimestamp(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(candidate)) {
    candidate = `${candidate.replace(' ', 'T')}Z`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{4,9}Z$/.test(candidate)) {
    candidate = `${candidate.slice(0, 23)}Z`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?\+00:00$/.test(candidate)) {
    const base = candidate.slice(0, -6);
    const dot = base.indexOf('.');
    candidate = dot === -1 ? `${base}Z` : `${base.slice(0, dot + 4)}Z`;
  }
  if (!UTC.test(candidate)) return null;
  const parsed = Date.parse(candidate);
  if (!Number.isFinite(parsed)) return null;
  const iso = new Date(parsed).toISOString();
  if (iso.slice(0, 10) !== candidate.slice(0, 10)) return null;
  return iso;
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
 * Derive a validated daily run manifest directly from a 960-row Kaggle CSV
 * (and optional Kaggle dataset version metadata) when a separate `.run.json`
 * companion file is absent.
 */
export function deriveDailyManifestFromCsv(rows, {
  sha256,
  datasetVersion,
  datasetTimestamp,
  defaultModelVersion = '2.1.9+model.0bb5bdaf1789',
  now = new Date(),
  allowStale = false,
} = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    fail('cannot derive run metadata from an empty CSV');
  }
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) {
    fail('a valid CSV SHA-256 checksum is required');
  }

  const firstField = (names) => {
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      for (const name of names) {
        const val = row[name];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim();
        }
      }
    }
    return null;
  };

  const day1Dates = rows
    .filter((r) => String(r?.forecast_day ?? '').trim() === '1')
    .map((r) => String(r?.target_date ?? '').trim())
    .filter((d) => dateValue(d) !== null)
    .sort();
  const allDates = rows
    .map((r) => String(r?.target_date ?? '').trim())
    .filter((d) => dateValue(d) !== null)
    .sort();
  const day1Date = day1Dates[0] || allDates[0] || null;
  const day1Epoch = day1Date ? dateValue(day1Date) : null;

  // Guard against re-uploading an expired forecast window without `.run.json`.
  if (!allowStale && day1Epoch !== null) {
    const windowAgeMs = now.getTime() - (day1Epoch + DAY);
    if (windowAgeMs > DAILY_ADVISORY_MAX_AGE_HOURS * HOUR) {
      fail('source CSV forecast window is stale');
    }
  }

  const csvGeneratedIso = normalizeUtcTimestamp(firstField(['generated_at', 'completed_at_utc']));
  const datasetIso = normalizeUtcTimestamp(datasetTimestamp);
  const csvPredictionIso = normalizeUtcTimestamp(firstField(['prediction_date']));

  let generatedAt = csvGeneratedIso || datasetIso || csvPredictionIso;
  if (!generatedAt) {
    if (day1Epoch !== null) {
      const currentMs = now.getTime();
      if (Number.isFinite(currentMs) && Math.abs(currentMs - day1Epoch) <= 2 * DAY) {
        generatedAt = new Date(currentMs).toISOString();
      } else {
        generatedAt = new Date(day1Epoch).toISOString();
      }
    } else {
      fail('cannot determine generation timestamp from CSV or dataset metadata');
    }
  }

  const csvCutoffIso = normalizeUtcTimestamp(firstField(['data_cutoff', 'data_cutoff_utc']));
  let dataCutoff = csvCutoffIso;
  if (!dataCutoff && csvPredictionIso && Date.parse(csvPredictionIso) <= Date.parse(generatedAt)) {
    dataCutoff = csvPredictionIso;
  }
  if (!dataCutoff) {
    dataCutoff = generatedAt;
  }
  if (Date.parse(dataCutoff) > Date.parse(generatedAt)) {
    dataCutoff = generatedAt;
  }

  const rawRunId = firstField(['run_id']);
  const validCsvRunId = rawRunId
    && /^[a-zA-Z0-9._-]{1,100}$/.test(rawRunId)
    && isRunFact(rawRunId)
    ? rawRunId
    : null;
  const fallbackRunId = Number.isSafeInteger(datasetVersion) && datasetVersion > 0
    ? `kaggle-v${datasetVersion}-${sha256.slice(0, 12)}`
    : `daily-${day1Date || generatedAt.slice(0, 10)}-${sha256.slice(0, 12)}`;

  const rawModelVersion = firstField(['model_version']);
  const validModelVersion = rawModelVersion
    && rawModelVersion.length <= 100
    && isRunFact(rawModelVersion)
    ? rawModelVersion
    : defaultModelVersion;

  return validateDailyManifest({
    schema_version: '4.3-pb',
    run_id: validCsvRunId || fallbackRunId,
    generated_at: generatedAt,
    data_cutoff: dataCutoff,
    model_version: validModelVersion,
    csv_sha256: sha256,
  }, { sha256, now, allowStale });
}

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

function extractRowWeather(raw, rowNumber) {
  const candidates = {
    precipitationMm: firstOptionalDecimal(raw, ['om_precip_mm', 'precipitation_mm'], 0, 1000, rowNumber)
      ?? firstOptionalDecimal(raw, ['om_precip_m'], 0, 1000, rowNumber, (v) => v * 1000),
    temperatureMaxC: firstOptionalDecimal(raw, ['om_max_temp_c', 'om_temp_max_c', 'om_temp_max', 'temperature_max', 'om_max_temp_k'], -30, 65, rowNumber),
    temperatureMinC: firstOptionalDecimal(raw, ['om_min_temp_c', 'om_temp_min_c', 'om_temp_min', 'temperature_min', 'om_min_temp_k'], -40, 55, rowNumber),
    temperatureMeanC: firstOptionalDecimal(raw, ['om_temp_mean_c', 'temperature_mean', 'om_temp_2m_k'], -35, 60, rowNumber),
    windKmh: firstOptionalDecimal(raw, ['om_wind_kmh', 'wind_max_kmh'], 0, 450, rowNumber)
      ?? firstOptionalDecimal(raw, ['om_wind_max_ms'], 0, 450, rowNumber, (v) => v * 3.6),
    humidityPct: firstOptionalDecimal(raw, ['om_humidity_pct', 'relative_humidity_pct', 'humidity_pct'], 0, 100, rowNumber),
    dewpointC: firstOptionalDecimal(raw, ['dewpoint_mean', 'om_dewpoint_c', 'om_dewpoint_k'], -45, 50, rowNumber),
    solarRadiationMjM2: firstOptionalDecimal(raw, ['solar_radiation_mj_m2', 'om_solar_mj_m2'], 0, 60, rowNumber),
    evapotranspirationMm: firstOptionalDecimal(raw, ['evapotranspiration_mm', 'om_et_mm'], 0, 50, rowNumber),
  };
  return Object.fromEntries(Object.entries(candidates).filter(([, value]) => value !== undefined));
}

function extractRowMetrics(raw, rowNumber) {
  const overrideRaw = raw.physics_override;
  const physicsOverride = overrideRaw === '' || overrideRaw === null || overrideRaw === undefined
    ? undefined
    : optionalBool(raw, 'physics_override', false, rowNumber);

  const candidates = {
    confidence: firstOptionalDecimal(raw, ['confidence_calibrated', 'confidence'], 0, 1, rowNumber),
    confidenceRaw: firstOptionalDecimal(raw, ['confidence_raw'], 0, 1, rowNumber),
    modelSeverity: firstOptionalDecimal(raw, ['cnn_severity', 'model_severity'], 0, 1, rowNumber),
    modelSeverityRaw: firstOptionalDecimal(raw, ['cnn_severity_raw', 'model_severity_raw'], 0, 1, rowNumber),
    physicsSeverity: firstOptionalDecimal(raw, ['physics_severity'], 0, 1, rowNumber),
    finalSeverity: firstOptionalDecimal(raw, ['final_severity'], 0, 1, rowNumber),
    physicsOverride,
    physicsTopHazard: firstOptionalHazard(raw, ['physics_top_hazard'], rowNumber),
    physicsTopSeverity: firstOptionalDecimal(raw, ['physics_top_severity'], 0, 1, rowNumber),
    trackDivergence: firstOptionalDecimal(raw, ['track_divergence'], 0, 1, rowNumber),
    probTop1: firstOptionalDecimal(raw, ['prob_top1'], 0, 1, rowNumber),
    probTop2: firstOptionalDecimal(raw, ['prob_top2'], 0, 1, rowNumber),
    probTop3: firstOptionalDecimal(raw, ['prob_top3'], 0, 1, rowNumber),
    top2Hazard: firstOptionalHazard(raw, ['prob_top2_hazard', 'hazard_top2', 'top2_hazard'], rowNumber),
    top3Hazard: firstOptionalHazard(raw, ['prob_top3_hazard', 'hazard_top3', 'top3_hazard'], rowNumber),
  };
  return Object.fromEntries(Object.entries(candidates).filter(([, value]) => value !== undefined));
}

/**
 * Validate a complete 64×15 continuous ledger and return the public projection.
 * Includes severityScore, all 5 advisory tiers, all present weather metrics,
 * and whitelisted forecast track metrics while stripping any unknown/private columns.
 */
export function buildPublicDailySnapshot(rows, manifest, { expectedDistricts = 64, sourceDatasetVersion } = {}) {
  if (!Array.isArray(rows) || !Number.isInteger(expectedDistricts) || expectedDistricts < 1
    || expectedDistricts > 64 || rows.length !== expectedDistricts * DAILY_ADVISORY_DAYS) {
    fail(`expected ${expectedDistricts * DAILY_ADVISORY_DAYS} district/day rows`);
  }
  if (sourceDatasetVersion !== undefined && (!Number.isSafeInteger(sourceDatasetVersion)
    || sourceDatasetVersion < 1 || sourceDatasetVersion > 1_000_000_000)) {
    fail('invalid source dataset version');
  }

  const hasPeakColumn = rows.some((r) => r && r.is_peak_day !== undefined && r.is_peak_day !== null && String(r.is_peak_day).trim() !== '');
  const districts = new Map();
  const globalDates = new Map();

  for (const [index, raw] of rows.entries()) {
    const rowNumber = index + 2;
    if (!raw || typeof raw !== 'object') fail(`row ${rowNumber} is missing`);
    const districtName = String(raw.district ?? raw.district_name ?? '').trim();
    const district = lookupDistrict(districtName);
    if (!district) fail(`row ${rowNumber} has an unknown district`);
    const day = integer(raw.forecast_day, 1, DAILY_ADVISORY_DAYS);
    const targetDateStr = String(raw.target_date ?? '').trim();
    const targetDate = dateValue(targetDateStr);
    const hazard = String(raw.hazard ?? raw.hazard_type ?? '').trim();
    const tier = String(raw.advisory_tier ?? '').trim().toUpperCase();
    const rawScore = raw.severity_score !== undefined && raw.severity_score !== ''
      ? raw.severity_score
      : raw.final_severity;
    const severity = decimal(rawScore, 0, 1);
    const flagged = hasPeakColumn ? bool(raw.is_peak_day) : false;
    const bmdStale = optionalBool(raw, 'bmd_stale', false, rowNumber);
    const degraded = optionalBool(raw, 'physics_degraded', false, rowNumber);

    if (!day || targetDate === null || !VALID_HAZARDS.includes(hazard)
      || !ALL_TIERS.includes(tier) || severity === null || flagged === null) {
      fail(`row ${rowNumber} has an invalid required result, date, score or availability flag`);
    }
    if (globalDates.has(day) && globalDates.get(day) !== targetDate) {
      fail(`row ${rowNumber} does not match the national date for day ${day}`);
    }
    globalDates.set(day, targetDate);

    const group = districts.get(district.district_id) || new Map();
    if (group.has(day)) fail(`district ${district.district_id} has duplicate day ${day}`);
    group.set(day, {
      district,
      day,
      targetDate: targetDateStr,
      hazard,
      tier,
      severity,
      flagged,
      bmdStale,
      degraded,
      weather: extractRowWeather(raw, rowNumber),
      metrics: extractRowMetrics(raw, rowNumber),
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
    if (hasPeakColumn) {
      const marked = ordered.filter((row) => row.flagged);
      if (marked.length !== 1 || !maxima.includes(marked[0]) || marked[0] !== maxima[0]) {
        fail(`district ${districtId} has an inconsistent peak marker`);
      }
    }
    const peakState = maxima.length === 1 ? 'unique' : 'tied';
    for (const row of ordered) {
      const qualityNotes = [
        ...(row.bmdStale ? ['official_update_unverified'] : []),
        ...(row.degraded ? ['limited_forecast_detail'] : []),
      ];
      const slug = row.hazard.toLowerCase().replace(/\s+/g, '-');
      const entry = {
        advisoryId: `${districtId}-${row.targetDate}-${slug}`,
        districtId,
        district: row.district.district_name,
        division: row.district.division,
        forecastDay: row.day,
        targetDate: row.targetDate,
        hazard: row.hazard,
        tier: row.tier,
        severityScore: row.severity,
        requiresReview: REQUIRES_REVIEW_TIERS.includes(row.tier),
        reasonCode: row.tier === 'NORMAL' ? 'no_major_risk' : 'district_outlook',
        actionIds: actionsForHazard(row.hazard, row.tier),
        peak: peakState === 'unique' ? (row === maxima[0] ? 'unique' : 'none') : 'tied',
        qualityNotes,
        weather: row.weather,
        ...(Object.keys(row.metrics).length > 0 ? { metrics: row.metrics } : {}),
      };
      advisories.push(entry);
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
      ...(sourceDatasetVersion === undefined ? {} : { sourceDatasetVersion }),
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
      || date === null
      || row.requiresReview !== REQUIRES_REVIEW_TIERS.includes(row.tier)
      || row.reasonCode !== (row.tier === 'NORMAL' ? 'no_major_risk' : 'district_outlook')
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

const TIER_RANK = { NORMAL: 0, WATCH: 1, WARNING: 2, SEVERE: 3, EXTREME: 4 };

/**
 * Roll up a validated 960-row daily snapshot into canonical `7_days` and `15_days`
 * `ForecastRow` arrays (64 districts × 2 horizons = 128 rows) so `/live`,
 * `forecasts-latest.json`, `/advisories`, and district panels stay unified with
 * the daily Kaggle run.
 */
export function rollupDailySnapshotToHorizons(snapshotInput) {
  const snapshot = snapshotInput?.schema === DAILY_ADVISORY_SCHEMA
    ? parsePublicDailySnapshot(snapshotInput)
    : null;
  if (!snapshot) return null;

  const byDistrict = new Map();
  for (const row of snapshot.advisories) {
    const list = byDistrict.get(row.districtId) || [];
    list.push(row);
    byDistrict.set(row.districtId, list);
  }

  const predictionDate = snapshot.run.generatedAt.slice(0, 10);
  const horizons = { '7_days': [], '15_days': [] };

  for (const districtMeta of DISTRICT_REGISTRY) {
    const districtRows = (byDistrict.get(districtMeta.district_id) || [])
      .slice()
      .sort((a, b) => a.forecastDay - b.forecastDay);
    if (districtRows.length === 0) continue;

    for (const [horizon, maxDay] of [['7_days', 7], ['15_days', 15]]) {
      const windowRows = districtRows.filter((r) => r.forecastDay <= maxDay);
      if (windowRows.length === 0) continue;

      // Pick the peak-severity day within the horizon window (ties broken by
      // unique peak marker, higher published tier, then earliest forecast day).
      const peakRow = windowRows.reduce((best, candidate) => {
        if (candidate.severityScore > best.severityScore) return candidate;
        if (candidate.severityScore < best.severityScore) return best;
        if (candidate.peak === 'unique' && best.peak !== 'unique') return candidate;
        if ((TIER_RANK[candidate.tier] ?? 0) > (TIER_RANK[best.tier] ?? 0)) return candidate;
        return candidate.forecastDay < best.forecastDay ? candidate : best;
      }, windowRows[0]);

      const m = peakRow.metrics || {};
      const w = peakRow.weather || {};
      const windowMaxTemps = windowRows.map((r) => r.weather?.temperatureMaxC).filter((v) => typeof v === 'number');
      const windowMinTemps = windowRows.map((r) => r.weather?.temperatureMinC).filter((v) => typeof v === 'number');
      const windowMeanTemps = windowRows.map((r) => r.weather?.temperatureMeanC).filter((v) => typeof v === 'number');
      const windowWinds = windowRows.map((r) => r.weather?.windKmh).filter((v) => typeof v === 'number');
      const windowPrecips = windowRows.map((r) => r.weather?.precipitationMm).filter((v) => typeof v === 'number');

      const confidence = m.confidence ?? m.probTop1 ?? round4(Math.max(0.5, peakRow.severityScore));
      const confidenceKind = m.confidence !== undefined
        ? (m.confidenceRaw !== undefined ? 'calibrated_probability' : 'model_softmax_top_class')
        : m.probTop1 !== undefined
          ? 'model_softmax_top_class'
          : 'severity_proxy';

      const forecastRow = {
        district_id: districtMeta.district_id,
        district_name: districtMeta.district_name,
        division: districtMeta.division,
        pcode: districtMeta.pcode,
        latitude: districtMeta.latitude,
        longitude: districtMeta.longitude,
        horizon,
        hazard_type: peakRow.hazard,
        severity_score: peakRow.severityScore,
        final_severity: m.finalSeverity ?? peakRow.severityScore,
        model_severity: m.modelSeverity ?? peakRow.severityScore,
        ...(m.modelSeverityRaw !== undefined ? { model_severity_raw: m.modelSeverityRaw } : {}),
        physics_severity: m.physicsSeverity ?? peakRow.severityScore,
        ...(m.physicsOverride !== undefined ? { physics_override: m.physicsOverride } : {}),
        ...(m.physicsTopHazard !== undefined ? { physics_top_hazard: m.physicsTopHazard } : {}),
        ...(m.physicsTopSeverity !== undefined ? { physics_top_severity: m.physicsTopSeverity } : {}),
        ...(m.trackDivergence !== undefined ? { track_divergence: m.trackDivergence } : {}),
        confidence,
        ...(m.confidenceRaw !== undefined ? { confidence_raw: m.confidenceRaw, confidence_calibrated: confidence } : {}),
        confidence_kind: confidenceKind,
        ...(m.probTop1 !== undefined ? { prob_top1: m.probTop1 } : {}),
        ...(m.probTop2 !== undefined ? { prob_top2: m.probTop2 } : {}),
        ...(m.probTop3 !== undefined ? { prob_top3: m.probTop3 } : {}),
        ...(w.temperatureMaxC !== undefined || windowMaxTemps.length > 0
          ? { temperature_max: w.temperatureMaxC ?? Math.max(...windowMaxTemps) } : {}),
        ...(w.temperatureMinC !== undefined || windowMinTemps.length > 0
          ? { temperature_min: w.temperatureMinC ?? Math.min(...windowMinTemps) } : {}),
        ...(w.temperatureMeanC !== undefined || windowMeanTemps.length > 0
          ? { temperature_mean: w.temperatureMeanC ?? round4(windowMeanTemps.reduce((s, v) => s + v, 0) / windowMeanTemps.length) } : {}),
        ...(w.precipitationMm !== undefined || windowPrecips.length > 0
          ? { precipitation_mm: w.precipitationMm ?? Math.max(...windowPrecips) } : {}),
        ...(w.windKmh !== undefined || windowWinds.length > 0
          ? { wind_max_kmh: w.windKmh ?? Math.max(...windowWinds) } : {}),
        ...(w.dewpointC !== undefined ? { dewpoint_mean: w.dewpointC } : {}),
        ...(w.solarRadiationMjM2 !== undefined ? { solar_radiation_mj_m2: w.solarRadiationMjM2 } : {}),
        ...(w.evapotranspirationMm !== undefined ? { evapotranspiration_mm: w.evapotranspirationMm } : {}),
        advisory_tier: peakRow.tier,
        advisory_tier_source: 'published',
        requires_review: peakRow.requiresReview,
        target_date: peakRow.targetDate,
        prediction_date: predictionDate,
        data_source: 'Kaggle_Daily_Advisory',
        model_version: snapshot.run.modelVersion,
        run_id: snapshot.run.id,
      };
      horizons[horizon].push(forecastRow);
    }
  }

  return {
    schema: 'hazardnet-forecast-snapshot/v2',
    generated_at: snapshot.run.generatedAt,
    prediction_date: predictionDate,
    source_daily_run_id: snapshot.run.id,
    data_cutoff: snapshot.run.dataCutoff,
    horizons,
  };
}
