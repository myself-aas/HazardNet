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

  // Severity: accepting Kaggle notebook's dual-track (`physics_severity` and `model_severity`)
  // as well as single-track `severity_score`.
  const modelSevRaw = row.model_severity !== undefined && row.model_severity !== ''
    ? row.model_severity
    : undefined;
  const physicsSevRaw = row.physics_severity !== undefined && row.physics_severity !== ''
    ? row.physics_severity
    : undefined;

  const modelSev = parseFloat(modelSevRaw);
  const physicsSev = parseFloat(physicsSevRaw);

  const severityRaw = row.severity_score !== undefined && row.severity_score !== ''
    ? row.severity_score
    : (row.model_severity !== undefined && row.model_severity !== '' ? row.model_severity : row.physics_severity);
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

  // The Kaggle notebook publishes Open-Meteo values in native units. Convert
  // them at the ingest boundary so API consumers keep the documented units.
  //
  // Two of the notebook's column names are actively misleading, and the CSV
  // values only make sense once that is accounted for:
  //
  //   * `om_temp_2m_k` holds CELSIUS despite the `_k` suffix (Open-Meteo
  //     defaults to Celsius), so it passes through unconverted — converting it
  //     as Kelvin would store ~300 °C.
  //   * `om_et_sum_m` holds MILLIMETRES despite the `_m` suffix, and
  //     `om_solar_rad_j` holds kJ/m² — the notebook accumulates both over the
  //     whole horizon (`np.nansum(...)`, with a `* 1000` on the solar term).
  //
  // The two fields below are documented as DAILY values (the pre-cutover
  // fixture used 18.6 MJ/m² and 4.2 mm), so the horizon totals are divided by
  // the horizon length. Without this a real notebook row stores ~30,000 mm of
  // evapotranspiration — about 30 metres of water.
  const horizonDays = parseInt(String(horizon).split('_')[0], 10);
  const validDays = Number.isFinite(horizonDays) && horizonDays > 0;
  const perDay = (total) => (validDays ? Number(total) / horizonDays : undefined);

  const meteorologicalValues = {
    temperature_mean: row.temperature_mean ?? row.om_temp_2m_k,
    temperature_max: row.temperature_max ?? row.om_max_temp_k,
    temperature_min: row.temperature_min ?? row.om_min_temp_k,
    precipitation_mm: row.precipitation_mm ?? (row.om_precip_m !== undefined ? Number(row.om_precip_m) * 1000 : undefined),
    wind_max_kmh: row.wind_max_kmh ?? (row.om_wind_max_ms !== undefined ? Number(row.om_wind_max_ms) * 3.6 : undefined),
    dewpoint_mean: row.dewpoint_mean ?? row.om_dewpoint_k,
    // kJ/m² over the horizon -> MJ/m²/day.
    solar_radiation_mj_m2: row.solar_radiation_mj_m2
      ?? (row.om_solar_rad_j !== undefined ? perDay(Number(row.om_solar_rad_j) / 1000) : undefined),
    // mm over the horizon -> mm/day.
    evapotranspiration_mm: row.evapotranspiration_mm
      ?? (row.om_et_sum_m !== undefined ? perDay(row.om_et_sum_m) : undefined),
  };
  for (const field of METEOROLOGICAL_FIELDS) {
    if (meteorologicalValues[field] !== undefined && meteorologicalValues[field] !== '') {
      const parsed = parseFloat(meteorologicalValues[field]);
      if (Number.isFinite(parsed)) value[field] = parsed;
    }
  }

  // Dual-track severity (physics-based proxy & model severity)
  if (!isNaN(physicsSev) && physicsSev >= 0 && physicsSev <= 1) {
    value.physics_severity = physicsSev;
  }
  if (!isNaN(modelSev) && modelSev >= 0 && modelSev <= 1) {
    value.model_severity = modelSev;
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
