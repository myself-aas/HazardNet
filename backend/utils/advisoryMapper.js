/**
 * advisoryMapper.js — Column Mapper (Advisory CSV → ForecastRow)
 *
 * Implements TASK-002 per PRD §4.1 / TRD §2.2, §4.2, §5.2.
 * Converts raw rows from the Kaggle notebook output `hazardnet_advisories_latest.csv`
 * into canonical `ForecastRow` objects ready for storage in Firestore, JSON snapshots,
 * or API serving.
 */

import { applyCalibrationToRow } from '../alerts/calibration.js';
import {
  buildPublicDailySnapshot,
  deriveDailyManifestFromCsv,
  rollupDailySnapshotToHorizons,
} from './dailyAdvisoryPublic.js';

export const ADVISORY_CSV_COLUMNS = [
  'district',
  'division',
  'latitude',
  'longitude',
  'horizon',
  'hazard',
  'confidence',
  'cnn_severity_raw',
  'cnn_severity',
  'physics_severity',
  'final_severity',
  'physics_override',
  'advisory_tier',
  'target_date',
  'generated_at',
  'om_max_temp_c',
  'om_min_temp_c',
  'om_precip_mm',
  'om_wind_kmh',
  'prob_top1',
  'prob_top2',
  'prob_top3',
];

export const VALID_ADVISORY_TIERS = ['EXTREME', 'SEVERE', 'WARNING', 'WATCH', 'NORMAL'];
export const VALID_HORIZONS = ['7_days', '15_days'];
export const VALID_HAZARDS = [
  'Cold Wave',
  'Drought',
  'Fire',
  'Flash Flood',
  'Flood',
  'Heat Wave',
  'Severe Local Storm',
  'Tropical Cyclone',
];

export const DATA_SOURCE_CONSTANT = 'Kaggle_Daily_Advisory';

import { lookupDistrict } from './districtRegistry.js';
export { DISTRICT_REGISTRY, lookupDistrict, normalizeDistrictKey } from './districtRegistry.js';

/**
 * Parse boolean value safely from string or boolean.
 *
 * @param {any} val
 * @returns {boolean}
 */
function parseBoolean(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const clean = val.trim().toLowerCase();
    return clean === 'true' || clean === '1' || clean === 't' || clean === 'yes';
  }
  return Boolean(val);
}

/**
 * Parse finite float safely with default fallback.
 *
 * @param {any} val
 * @param {number|null} [fallback=null]
 * @returns {number|null}
 */
function parseFloatSafe(val, fallback = null) {
  if (val === undefined || val === null || val === '') return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Map a single raw row from `hazardnet_advisories_latest.csv` to backend `ForecastRow`.
 *
 * @param {Record<string, any>} rawRow - Raw row object from CSV parser
 * @param {number} [rowNumber=1] - 1-indexed row number for diagnostics
 * @param {{ modelVersion?: string | null }} [options={}] - Provenance stamping options
 * @returns {object} Formatted ForecastRow matching TRD §2.2
 */
export function mapAdvisoryRow(rawRow, rowNumber = 1, options = {}) {
  if (!rawRow || typeof rawRow !== 'object') {
    throw new Error(`Row ${rowNumber}: Empty or invalid advisory row object`);
  }

  const rawDistrict = String(rawRow.district || rawRow.district_name || '').trim();
  const districtInfo = lookupDistrict(rawDistrict);
  if (!districtInfo) {
    throw new Error(`Row ${rowNumber}: Unknown district name "${rawDistrict}"`);
  }

  const horizon = String(rawRow.horizon || '').trim();
  if (!VALID_HORIZONS.includes(horizon)) {
    throw new Error(`Row ${rowNumber}: Invalid horizon "${horizon}". Expected one of: ${VALID_HORIZONS.join(', ')}`);
  }

  const hazard = String(rawRow.hazard || rawRow.hazard_type || '').trim();
  if (!VALID_HAZARDS.includes(hazard)) {
    throw new Error(`Row ${rowNumber}: Invalid hazard "${hazard}". Expected one of: ${VALID_HAZARDS.join(', ')}`);
  }

  const advisoryTier = String(rawRow.advisory_tier || '').trim().toUpperCase();
  if (!VALID_ADVISORY_TIERS.includes(advisoryTier)) {
    throw new Error(`Row ${rowNumber}: Invalid advisory_tier "${advisoryTier}". Expected one of: ${VALID_ADVISORY_TIERS.join(', ')}`);
  }

  const finalSeverity = parseFloatSafe(rawRow.final_severity);
  if (finalSeverity === null || finalSeverity < 0 || finalSeverity > 1) {
    throw new Error(`Row ${rowNumber}: final_severity must be a float in [0, 1], got ${rawRow.final_severity}`);
  }

  const confidence = parseFloatSafe(rawRow.confidence);
  if (confidence === null || confidence < 0 || confidence > 1) {
    throw new Error(`Row ${rowNumber}: confidence must be a float in [0, 1], got ${rawRow.confidence}`);
  }

  // Model & Physics Severities
  const cnnSeverityRaw = parseFloatSafe(rawRow.cnn_severity_raw);
  const cnnSeverity = parseFloatSafe(rawRow.cnn_severity);
  const physicsSeverity = parseFloatSafe(rawRow.physics_severity);

  // Physics Override Boolean
  const physicsOverride = parseBoolean(rawRow.physics_override);

  // Coordinates (favor CSV values if valid float, fallback to registered district centroid)
  const lat = parseFloatSafe(rawRow.latitude, districtInfo.latitude);
  const lng = parseFloatSafe(rawRow.longitude, districtInfo.longitude);

  // Dates
  const targetDate = String(rawRow.target_date || '').trim();
  const generatedAt = String(rawRow.generated_at || '').trim();

  // Weather parameters
  const tempMax = parseFloatSafe(rawRow.om_max_temp_c);
  const tempMin = parseFloatSafe(rawRow.om_min_temp_c);
  const precipMm = parseFloatSafe(rawRow.om_precip_mm);
  const windKmh = parseFloatSafe(rawRow.om_wind_kmh);

  // Top class probabilities
  const probTop1 = parseFloatSafe(rawRow.prob_top1);
  const probTop2 = parseFloatSafe(rawRow.prob_top2);
  const probTop3 = parseFloatSafe(rawRow.prob_top3);

  // Prediction date derived from generated_at ISO timestamp (YYYY-MM-DD) or full string
  let predictionDate = targetDate;
  if (generatedAt) {
    const parsedDate = new Date(generatedAt);
    if (!isNaN(parsedDate.getTime())) {
      predictionDate = parsedDate.toISOString().slice(0, 10);
    }
  }

  const mapped = {
    district_id: districtInfo.district_id,
    district_name: districtInfo.district_name,
    division: rawRow.division ? String(rawRow.division).trim() : districtInfo.division,
    pcode: districtInfo.pcode,
    latitude: lat,
    longitude: lng,
    horizon,
    hazard_type: hazard,
    confidence,
    severity_score: finalSeverity, // Primary severity used across all UI
    final_severity: finalSeverity,
    model_severity: cnnSeverity !== null ? cnnSeverity : undefined,
    model_severity_raw: cnnSeverityRaw !== null ? cnnSeverityRaw : undefined,
    physics_severity: physicsSeverity !== null ? physicsSeverity : undefined,
    physics_override: physicsOverride,
    advisory_tier: advisoryTier, // Preserved verbatim per TRD §2.2
    target_date: targetDate,
    prediction_date: predictionDate,
    created_at: generatedAt || new Date().toISOString(),
    temperature_max: tempMax !== null ? tempMax : undefined,
    temperature_min: tempMin !== null ? tempMin : undefined,
    precipitation_mm: precipMm !== null ? precipMm : undefined,
    wind_max_kmh: windKmh !== null ? windKmh : undefined,
    prob_top1: probTop1 !== null ? probTop1 : undefined,
    prob_top2: probTop2 !== null ? probTop2 : undefined,
    prob_top3: probTop3 !== null ? probTop3 : undefined,
    data_source: DATA_SOURCE_CONSTANT,
  };

  const modelVersion = rawRow.model_version
    ? String(rawRow.model_version).trim()
    : options?.modelVersion
      ? String(options.modelVersion).trim()
      : '';
  if (modelVersion) {
    mapped.model_version = modelVersion;
  }

  if (options?.calibrationMap) {
    return applyCalibrationToRow(mapped, options.calibrationMap);
  }

  const calibratedCol = parseFloatSafe(rawRow.confidence_calibrated);
  if (calibratedCol !== null && calibratedCol >= 0 && calibratedCol <= 1) {
    mapped.confidence_raw = confidence;
    mapped.confidence = calibratedCol;
    mapped.confidence_calibrated = calibratedCol;
    mapped.confidence_kind = 'calibrated_probability';
  } else if (rawRow.confidence_kind && String(rawRow.confidence_kind).trim()) {
    mapped.confidence_kind = String(rawRow.confidence_kind).trim();
  }

  return mapped;
}

/**
 * Maps an array of raw advisory rows (either 128-row two-horizon CSV or 960-row
 * daily 15-day CSV) into canonical `7_days` and `15_days` ForecastRow objects.
 *
 * @param {Array<Record<string, any>>} rawRows
 * @param {{ modelVersion?: string | null, sha256?: string, datasetTimestamp?: string }} [options={}]
 * @returns {Array<object>}
 */
export function mapAdvisoryRows(rawRows, options = {}) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw new Error('No advisory rows to map');
  }

  const first = rawRows[0] || {};
  if (first.forecast_day !== undefined && first.forecast_day !== '' && !first.horizon) {
    const expectedDistricts = Math.floor(rawRows.length / 15);
    const sha256 = typeof options.sha256 === 'string' && /^[a-f0-9]{64}$/.test(options.sha256)
      ? options.sha256
      : '0'.repeat(64);
    const manifest = deriveDailyManifestFromCsv(rawRows, {
      sha256,
      datasetTimestamp: options.datasetTimestamp,
      defaultModelVersion: options.modelVersion || '2.1.9+model.0bb5bdaf1789',
      allowStale: true,
    });
    const snapshot = buildPublicDailySnapshot(rawRows, manifest, { expectedDistricts });
    const rolled = rollupDailySnapshotToHorizons(snapshot);
    const combined = [
      ...(rolled?.horizons?.['7_days'] || []),
      ...(rolled?.horizons?.['15_days'] || []),
    ].map((row) => ({
      ...row,
      created_at: snapshot.run.generatedAt,
    }));
    if (options?.calibrationMap) {
      return combined.map((row) => applyCalibrationToRow(row, options.calibrationMap));
    }
    return combined;
  }

  const mappedRows = [];
  for (let i = 0; i < rawRows.length; i++) {
    mappedRows.push(mapAdvisoryRow(rawRows[i], i + 1, options));
  }

  return mappedRows;
}

/**
 * Convert mapped ForecastRow array into RFC4180 CSV string conforming to backend schema.
 *
 * @param {Array<object>} forecastRows
 * @returns {string}
 */
export function forecastRowsToCsv(forecastRows) {
  if (!Array.isArray(forecastRows) || forecastRows.length === 0) {
    return '';
  }

  const headers = [
    'district_id',
    'district_name',
    'division',
    'pcode',
    'latitude',
    'longitude',
    'horizon',
    'hazard_type',
    'severity_score',
    'final_severity',
    'model_severity',
    'model_severity_raw',
    'physics_severity',
    'physics_override',
    'advisory_tier',
    'confidence',
    'target_date',
    'prediction_date',
    'temperature_max',
    'temperature_min',
    'precipitation_mm',
    'wind_max_kmh',
    'prob_top1',
    'prob_top2',
    'prob_top3',
    'data_source',
    'model_version',
    'confidence_raw',
    'confidence_calibrated',
    'confidence_kind',
  ];

  const lines = [headers.join(',')];

  for (const row of forecastRows) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val === undefined || val === null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}
