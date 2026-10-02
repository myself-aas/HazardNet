/**
 * advisoryMapper.js — Column Mapper (Advisory CSV → ForecastRow)
 *
 * Implements TASK-002 per PRD §4.1 / TRD §2.2, §4.2, §5.2.
 * Converts raw rows from the Kaggle notebook output `hazardnet_advisories_latest.csv`
 * into canonical `ForecastRow` objects ready for storage in Firestore, JSON snapshots,
 * or API serving.
 */

import { applyCalibrationToRow } from '../alerts/calibration.js';

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

export const VALID_ADVISORY_TIERS = ['SEVERE', 'WARNING', 'WATCH', 'NORMAL'];
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

/**
 * Canonical 64 Bangladesh Districts reference table.
 * Includes numeric district_id, canonical name, division, official pcode,
 * and centroid coordinates.
 */
export const DISTRICT_REGISTRY = [
  // Rangpur Division (8)
  { district_id: 1, district_name: 'Kurigram', division: 'Rangpur', pcode: '5809', latitude: 25.8058, longitude: 89.6361 },
  { district_id: 2, district_name: 'Rangpur', division: 'Rangpur', pcode: '5818', latitude: 25.7439, longitude: 89.2752 },
  { district_id: 3, district_name: 'Gaibandha', division: 'Rangpur', pcode: '5807', latitude: 25.3288, longitude: 89.5403 },
  { district_id: 4, district_name: 'Nilphamari', division: 'Rangpur', pcode: '5814', latitude: 25.9312, longitude: 88.8560 },
  { district_id: 5, district_name: 'Dinajpur', division: 'Rangpur', pcode: '5806', latitude: 25.6279, longitude: 88.6332 },
  { district_id: 6, district_name: 'Panchagarh', division: 'Rangpur', pcode: '5816', latitude: 26.3411, longitude: 88.5541 },
  { district_id: 7, district_name: 'Thakurgaon', division: 'Rangpur', pcode: '5820', latitude: 26.0337, longitude: 88.4617 },
  { district_id: 8, district_name: 'Lalmonirhat', division: 'Rangpur', pcode: '5810', latitude: 25.9165, longitude: 89.4532 },

  // Rajshahi Division (8)
  { district_id: 9, district_name: 'Rajshahi', division: 'Rajshahi', pcode: '5817', latitude: 24.3745, longitude: 88.6042 },
  { district_id: 10, district_name: 'Bogra', division: 'Rajshahi', pcode: '5805', latitude: 24.8481, longitude: 89.3730 },
  { district_id: 11, district_name: 'Sirajganj', division: 'Rajshahi', pcode: '5819', latitude: 24.4534, longitude: 89.7008 },
  { district_id: 12, district_name: 'Pabna', division: 'Rajshahi', pcode: '5815', latitude: 24.0064, longitude: 89.2372 },
  { district_id: 13, district_name: 'Naogaon', division: 'Rajshahi', pcode: '5811', latitude: 24.8103, longitude: 88.9414 },
  { district_id: 14, district_name: 'Natore', division: 'Rajshahi', pcode: '5812', latitude: 24.4102, longitude: 88.9834 },
  { district_id: 15, district_name: 'Chapainawabganj', division: 'Rajshahi', pcode: '5813', latitude: 24.5965, longitude: 88.2775 },
  { district_id: 16, district_name: 'Joypurhat', division: 'Rajshahi', pcode: '5808', latitude: 25.1013, longitude: 89.0267 },

  // Mymensingh Division (4)
  { district_id: 17, district_name: 'Mymensingh', division: 'Mymensingh', pcode: '5787', latitude: 24.7471, longitude: 90.4203 },
  { district_id: 18, district_name: 'Netrokona', division: 'Mymensingh', pcode: '5790', latitude: 24.8800, longitude: 90.7300 },
  { district_id: 19, district_name: 'Jamalpur', division: 'Mymensingh', pcode: '5782', latitude: 24.9375, longitude: 89.9378 },
  { district_id: 20, district_name: 'Sherpur', division: 'Mymensingh', pcode: '5793', latitude: 25.0205, longitude: 90.0153 },

  // Sylhet Division (4)
  { district_id: 21, district_name: 'Sylhet', division: 'Sylhet', pcode: '5824', latitude: 24.8949, longitude: 91.8687 },
  { district_id: 22, district_name: 'Sunamganj', division: 'Sylhet', pcode: '5823', latitude: 25.0658, longitude: 91.3950 },
  { district_id: 23, district_name: 'Habiganj', division: 'Sylhet', pcode: '5821', latitude: 24.3749, longitude: 91.4168 },
  { district_id: 24, district_name: 'Moulvibazar', division: 'Sylhet', pcode: '5822', latitude: 24.4829, longitude: 91.7774 },

  // Dhaka Division (13)
  { district_id: 25, district_name: 'Dhaka', division: 'Dhaka', pcode: '5778', latitude: 23.8103, longitude: 90.4125 },
  { district_id: 26, district_name: 'Gazipur', division: 'Dhaka', pcode: '5780', latitude: 24.0023, longitude: 90.4264 },
  { district_id: 27, district_name: 'Narayanganj', division: 'Dhaka', pcode: '5788', latitude: 23.6238, longitude: 90.5000 },
  { district_id: 28, district_name: 'Tangail', division: 'Dhaka', pcode: '5794', latitude: 24.2513, longitude: 89.9167 },
  { district_id: 29, district_name: 'Kishoreganj', division: 'Dhaka', pcode: '5783', latitude: 24.4449, longitude: 90.7766 },
  { district_id: 30, district_name: 'Manikganj', division: 'Dhaka', pcode: '5785', latitude: 23.8644, longitude: 90.0047 },
  { district_id: 31, district_name: 'Munshiganj', division: 'Dhaka', pcode: '5786', latitude: 23.5422, longitude: 90.5305 },
  { district_id: 32, district_name: 'Narsingdi', division: 'Dhaka', pcode: '5789', latitude: 23.9193, longitude: 90.7201 },
  { district_id: 33, district_name: 'Faridpur', division: 'Dhaka', pcode: '5779', latitude: 23.6071, longitude: 89.8406 },
  { district_id: 34, district_name: 'Gopalganj', division: 'Dhaka', pcode: '5781', latitude: 23.0051, longitude: 89.8266 },
  { district_id: 35, district_name: 'Madaripur', division: 'Dhaka', pcode: '5784', latitude: 23.1641, longitude: 90.1897 },
  { district_id: 36, district_name: 'Rajbari', division: 'Dhaka', pcode: '5791', latitude: 23.7574, longitude: 89.6444 },
  { district_id: 37, district_name: 'Shariatpur', division: 'Dhaka', pcode: '5792', latitude: 23.2423, longitude: 90.4348 },

  // Khulna Division (10)
  { district_id: 38, district_name: 'Khulna', division: 'Khulna', pcode: '5799', latitude: 22.8456, longitude: 89.5403 },
  { district_id: 39, district_name: 'Satkhira', division: 'Khulna', pcode: '5804', latitude: 22.7185, longitude: 89.0705 },
  { district_id: 40, district_name: 'Bagerhat', division: 'Khulna', pcode: '5795', latitude: 22.6516, longitude: 89.7859 },
  { district_id: 41, district_name: 'Jashore', division: 'Khulna', pcode: '5797', latitude: 23.1664, longitude: 89.2081 },
  { district_id: 42, district_name: 'Jhenaidah', division: 'Khulna', pcode: '5798', latitude: 23.5448, longitude: 89.1539 },
  { district_id: 43, district_name: 'Magura', division: 'Khulna', pcode: '5801', latitude: 23.4873, longitude: 89.4199 },
  { district_id: 44, district_name: 'Narail', division: 'Khulna', pcode: '5803', latitude: 23.1725, longitude: 89.5126 },
  { district_id: 45, district_name: 'Chuadanga', division: 'Khulna', pcode: '5796', latitude: 23.6402, longitude: 88.8418 },
  { district_id: 46, district_name: 'Kushtia', division: 'Khulna', pcode: '5800', latitude: 23.9013, longitude: 89.1205 },
  { district_id: 47, district_name: 'Meherpur', division: 'Khulna', pcode: '5802', latitude: 23.7622, longitude: 88.6318 },

  // Barisal Division (6)
  { district_id: 48, district_name: 'Barishal', division: 'Barisal', pcode: '5762', latitude: 22.7010, longitude: 90.3535 },
  { district_id: 49, district_name: 'Bhola', division: 'Barisal', pcode: '5763', latitude: 22.6859, longitude: 90.6481 },
  { district_id: 50, district_name: 'Jhalokati', division: 'Barisal', pcode: '5764', latitude: 22.6406, longitude: 90.1987 },
  { district_id: 51, district_name: 'Patuakhali', division: 'Barisal', pcode: '5765', latitude: 22.3596, longitude: 90.3298 },
  { district_id: 52, district_name: 'Pirojpur', division: 'Barisal', pcode: '5766', latitude: 22.5841, longitude: 89.9720 },
  { district_id: 53, district_name: 'Barguna', division: 'Barisal', pcode: '5761', latitude: 22.1570, longitude: 90.1228 },

  // Chattogram Division (11)
  { district_id: 54, district_name: 'Chattogram', division: 'Chittagong', pcode: '5770', latitude: 22.3569, longitude: 91.7832 },
  { district_id: 55, district_name: "Cox's Bazar", division: 'Chittagong', pcode: '5772', latitude: 21.4272, longitude: 92.0058 },
  { district_id: 56, district_name: 'Cumilla', division: 'Chittagong', pcode: '5771', latitude: 23.4607, longitude: 91.1809 },
  { district_id: 57, district_name: 'Feni', division: 'Chittagong', pcode: '5773', latitude: 23.0159, longitude: 91.3976 },
  { district_id: 58, district_name: 'Noakhali', division: 'Chittagong', pcode: '5776', latitude: 22.8696, longitude: 91.0995 },
  { district_id: 59, district_name: 'Lakshmipur', division: 'Chittagong', pcode: '5775', latitude: 22.9425, longitude: 90.8411 },
  { district_id: 60, district_name: 'Chandpur', division: 'Chittagong', pcode: '5769', latitude: 23.2333, longitude: 90.6667 },
  { district_id: 61, district_name: 'Brahmanbaria', division: 'Chittagong', pcode: '5768', latitude: 23.9571, longitude: 91.1119 },
  { district_id: 62, district_name: 'Khagrachhari', division: 'Chittagong', pcode: '5774', latitude: 23.1193, longitude: 91.9847 },
  { district_id: 63, district_name: 'Rangamati', division: 'Chittagong', pcode: '5777', latitude: 22.6533, longitude: 92.1753 },
  { district_id: 64, district_name: 'Bandarban', division: 'Chittagong', pcode: '5767', latitude: 21.8311, longitude: 92.3686 },
];

/**
 * Normalized alias dictionary for fuzzy/legacy district name matching.
 */
const DISTRICT_ALIASES = {
  jessore: 'jashore',
  chittagong: 'chattogram',
  comilla: 'cumilla',
  barisal: 'barishal',
  khagrachari: 'khagrachhari',
  bogura: 'bogra',
  jaipurhat: 'joypurhat',
  netrakona: 'netrokona',
  maulvibazar: 'moulvibazar',
  brahamanbaria: 'brahmanbaria',
  jhalakathi: 'jhalokati',
  nawabganj: 'chapainawabganj',
  coxsbazar: "cox's bazar",
  coxbazar: "cox's bazar",
};

/**
 * Normalizes a district name to clean lowercase alphanumeric key.
 *
 * @param {string} name
 * @returns {string}
 */
export function normalizeDistrictKey(name) {
  if (!name || typeof name !== 'string') return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve district details from name with alias handling.
 *
 * @param {string} districtName
 * @returns {typeof DISTRICT_REGISTRY[0] | null}
 */
export function lookupDistrict(districtName) {
  if (!districtName) return null;
  const rawKey = normalizeDistrictKey(districtName);
  const canonicalLookup = DISTRICT_ALIASES[rawKey] ? normalizeDistrictKey(DISTRICT_ALIASES[rawKey]) : rawKey;

  for (const item of DISTRICT_REGISTRY) {
    const itemKey = normalizeDistrictKey(item.district_name);
    if (itemKey === canonicalLookup || itemKey === rawKey) {
      return item;
    }
  }
  return null;
}

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
 * Maps an array of raw advisory rows, asserting that the output is exactly 128 rows
 * when 128 rows are supplied.
 *
 * @param {Array<Record<string, any>>} rawRows
 * @param {{ modelVersion?: string | null }} [options={}]
 * @returns {Array<object>}
 */
export function mapAdvisoryRows(rawRows, options = {}) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw new Error('No advisory rows to map');
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
