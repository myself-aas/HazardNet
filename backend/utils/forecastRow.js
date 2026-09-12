/**
 * Shared forecast-row parsing for the CSV ingest path.
 *
 * The weekly Kaggle notebook (kaggle_notebooks/hazardnet-auto-forecast-pipeline)
 * writes dual-track columns — `model_severity` and `physics_severity` — while
 * the original ingest contract used a single `severity_score` column. This
 * parser accepts both shapes so the weekly pipeline lands without a rename
 * step, and passes the dual-track values (plus `division` / `pcode`) through
 * to storage when present, preserving the README's dual-track severity story
 * for downstream consumers.
 */

// Tactical and strategic forecast horizons shared by the notebook, API, and UI.
export const VALID_HORIZONS = ['7_days', '15_days'];

const METEOROLOGICAL_FIELDS = [
  'temperature_mean',
  'temperature_max',
  'temperature_min',
  'precipitation_mm',
  'wind_max_kmh',
  'dewpoint_mean',
  'solar_radiation_mj_m2',
  'evapotranspiration_mm'
];

export const VALID_HAZARDS = [
  'Cold Wave',
  'Drought',
  'Fire',
  'Flash Flood',
  'Flood',
  'Heat Wave',
  'Severe Local Storm',
  'Tropical Cyclone'
];

/**
 * Parse one CSV row into a storable forecast record.
 *
 * @param {Record<string, string>} row - one csv-parser row object
 * @param {number} rowNumber - 1-based display index for error messages
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function parseCsvForecastRow(row, rowNumber) {
  if (!row || typeof row !== 'object') {
    return { ok: false, error: `Row ${rowNumber}: Missing row data` };
  }

  const hazardType = String(row.hazard_type || '').trim();
  if (!VALID_HAZARDS.includes(hazardType)) {
    return { ok: false, error: `Row ${rowNumber}: Invalid hazard "${row.hazard_type}"` };
  }

  const horizon = String(row.horizon || '').trim();
  if (!VALID_HORIZONS.includes(horizon)) {
    return { ok: false, error: `Row ${rowNumber}: Invalid horizon "${row.horizon}"` };
  }

  // Severity: legacy single-track column (`severity_score`) or the notebook's
  // dual-track `model_severity`. The CNN severity is the canonical value.
  const severityRaw = row.severity_score !== undefined && row.severity_score !== ''
    ? row.severity_score
    : row.model_severity;
  const severity = parseFloat(severityRaw);
  if (isNaN(severity) || severity < 0 || severity > 1) {
    return { ok: false, error: `Row ${rowNumber}: Invalid severity ${severityRaw}` };
  }

  const confidence = parseFloat(row.confidence);
  if (isNaN(confidence) || confidence < 0 || confidence > 1) {
    return { ok: false, error: `Row ${rowNumber}: Invalid confidence ${row.confidence}` };
  }

  const districtId = parseInt(row.district_id, 10);
  if (isNaN(districtId)) {
    return { ok: false, error: `Row ${rowNumber}: Invalid district_id ${row.district_id}` };
  }

  if (!row.district_name || !String(row.district_name).trim()) {
    return { ok: false, error: `Row ${rowNumber}: Missing district_name` };
  }

  if (!row.target_date || !row.prediction_date) {
    return { ok: false, error: `Row ${rowNumber}: Missing target_date or prediction_date` };
  }

  const value = {
    district_id: districtId,
    district_name: String(row.district_name).trim(),
    horizon,
    hazard_type: hazardType,
    severity_score: severity,
    confidence,
    target_date: row.target_date,
    prediction_date: row.prediction_date
  };

  for (const field of METEOROLOGICAL_FIELDS) {
    if (row[field] !== undefined && row[field] !== '') {
      const parsed = parseFloat(row[field]);
      if (Number.isFinite(parsed)) value[field] = parsed;
    }
  }

  // Dual-track severity (physics-based proxy) — optional passthrough.
  const physicsSeverity = parseFloat(row.physics_severity);
  if (!isNaN(physicsSeverity) && physicsSeverity >= 0 && physicsSeverity <= 1) {
    value.physics_severity = physicsSeverity;
    value.model_severity = severity;
  }

  // Administrative context from the FAO GAUL loader — optional passthrough.
  if (row.division && String(row.division).trim()) {
    value.division = String(row.division).trim();
  }
  if (row.pcode && String(row.pcode).trim()) {
    value.pcode = String(row.pcode).trim();
  }

  // ADM3 identity (ADR 0005): admin level + parent ADM2 district context.
  if (row.admin_level !== undefined && row.admin_level !== '') {
    const adminLevel = parseInt(row.admin_level, 10);
    if (Number.isInteger(adminLevel)) value.admin_level = adminLevel;
  }
  if (row.adm2_name && String(row.adm2_name).trim()) {
    value.adm2_name = String(row.adm2_name).trim();
  }
  if (row.adm2_pcode && String(row.adm2_pcode).trim()) {
    value.adm2_pcode = String(row.adm2_pcode).trim();
  }

  return { ok: true, value };
}
