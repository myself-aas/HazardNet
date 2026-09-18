/**
 * @jest-environment node
 *
 * parseCsvForecastRow — shared CSV ingest row parser (backend/utils/forecastRow.js).
 *
 * The forecast pipeline writes dual-track columns (`model_severity`,
 * `physics_severity`, plus `division` / `pcode`), while the legacy ingest
 * contract used a single `severity_score`. Both shapes must ingest cleanly.
 */
import { parseCsvForecastRow, VALID_HAZARDS, VALID_HORIZONS } from '../backend/utils/forecastRow.js';

const legacyRow = {
  district_id: '19',
  district_name: 'Dhaka',
  horizon: '7_days',
  hazard_type: 'Flood',
  severity_score: '0.5',
  confidence: '0.9',
  target_date: '2026-09-19',
  prediction_date: '2026-09-12'
};

const notebookRow = {
  district_id: '19',
  district_name: 'Dhaka',
  division: 'Dhaka',
  pcode: '3019',
  admin_level: '3',
  adm2_name: 'Dhaka',
  adm2_pcode: '3037',
  horizon: '15_days',
  hazard_type: 'Heat Wave',
  model_severity: '0.72',
  physics_severity: '0.64',
  confidence: '0.81',
  target_date: '2026-09-27',
  prediction_date: '2026-09-12'
};

describe('parseCsvForecastRow — accepted shapes', () => {
  it('accepts the legacy single-track severity_score shape', () => {
    const r = parseCsvForecastRow(legacyRow, 1);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({
      district_id: 19,
      district_name: 'Dhaka',
      horizon: '7_days',
      hazard_type: 'Flood',
      severity_score: 0.5,
      confidence: 0.9,
      target_date: '2026-09-19',
      prediction_date: '2026-09-12'
    });
  });

  it('accepts the notebook dual-track shape (model_severity as severity source)', () => {
    const r = parseCsvForecastRow(notebookRow, 2);
    expect(r.ok).toBe(true);
    expect(r.value.severity_score).toBe(0.72);
    expect(r.value.model_severity).toBe(0.72);
    expect(r.value.physics_severity).toBe(0.64);
    expect(r.value.division).toBe('Dhaka');
    expect(r.value.pcode).toBe('3019');
    expect(r.value.admin_level).toBe(3); // ADM3 identity (ADR 0005)
    expect(r.value.adm2_name).toBe('Dhaka');
    expect(r.value.adm2_pcode).toBe('3037');
  });

  it('preserves forecasted meteorological fields for individual location views', () => {
    const r = parseCsvForecastRow({
      ...notebookRow,
      temperature_mean: '299.4',
      temperature_max: '304.2',
      temperature_min: '294.1',
      precipitation_mm: '42.5',
      wind_max_kmh: '31.8',
      dewpoint_mean: '292.7',
      solar_radiation_mj_m2: '18.6',
      evapotranspiration_mm: '4.2'
    }, 2);

    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({
      temperature_mean: 299.4,
      temperature_max: 304.2,
      temperature_min: 294.1,
      precipitation_mm: 42.5,
      wind_max_kmh: 31.8,
      dewpoint_mean: 292.7,
      solar_radiation_mj_m2: 18.6,
      evapotranspiration_mm: 4.2
    });
  });

  it('converts the notebook native om_* columns into documented API units', () => {
    // Real Bagerhat 7-day row from hazardnet_forecasts_latest.csv (2026-09-12).
    // The notebook accumulates several Open-Meteo terms over the whole horizon
    // and mislabels two of them, so the raw values must NOT pass through:
    //   om_et_sum_m 30.45 is MILLIMETRES over 7 days (not metres)
    //   om_solar_rad_j 146060 is kJ/m² over 7 days
    // Storing the raw totals produced ~30,000 mm of evapotranspiration and
    // 0.15 MJ/m² of solar radiation.
    const r = parseCsvForecastRow({
      district_id: '1',
      district_name: 'Bagerhat',
      division: 'Khulna',
      pcode: '5795',
      horizon: '7_days',
      hazard_type: 'Tropical Cyclone',
      model_severity: '1.0',
      physics_severity: '0.0522',
      confidence: '1.0',
      target_date: '2026-09-19',
      prediction_date: '2026-09-12',
      om_temp_2m_k: '27.825',   // Celsius despite the _k suffix
      om_precip_m: '0.0522',    // metres -> mm
      om_max_temp_k: '33.1',
      om_min_temp_k: '24.9',
      om_dewpoint_k: '25.5375',
      om_solar_rad_j: '146060.0',
      om_wind_max_ms: '10.3',
      om_et_sum_m: '30.45'
    }, 1);

    expect(r.ok).toBe(true);
    expect(r.value.temperature_mean).toBeCloseTo(27.825, 4); // pass-through
    expect(r.value.temperature_max).toBeCloseTo(33.1, 4);
    expect(r.value.temperature_min).toBeCloseTo(24.9, 4);
    expect(r.value.dewpoint_mean).toBeCloseTo(25.5375, 4);
    expect(r.value.precipitation_mm).toBeCloseTo(52.2, 4);        // ×1000
    expect(r.value.wind_max_kmh).toBeCloseTo(37.08, 4);           // ×3.6
    // 146060 kJ/m² ÷ 1000 ÷ 7 days
    expect(r.value.solar_radiation_mj_m2).toBeCloseTo(20.8657, 3);
    // 30.45 mm ÷ 7 days
    expect(r.value.evapotranspiration_mm).toBeCloseTo(4.35, 4);

    // Guard the specific magnitudes that regressed: horizon totals must never
    // survive the ingest boundary.
    expect(r.value.evapotranspiration_mm).toBeLessThan(20);
    expect(r.value.solar_radiation_mj_m2).toBeLessThan(40);
  });

  it('scales the om_* per-day conversions by the horizon length', () => {
    // Real Bagerhat 15-day row — same district, twice the horizon. The
    // horizon totals grow, but the per-day rates must stay in the same band.
    const r = parseCsvForecastRow({
      district_id: '1',
      district_name: 'Bagerhat',
      horizon: '15_days',
      hazard_type: 'Flash Flood',
      model_severity: '1.0',
      physics_severity: '0.524',
      confidence: '0.7614',
      target_date: '2026-09-27',
      prediction_date: '2026-09-12',
      om_temp_2m_k: '27.8467',
      om_precip_m: '0.0786',
      om_max_temp_k: '33.1',
      om_min_temp_k: '24.9',
      om_dewpoint_k: '25.7333',
      om_solar_rad_j: '272080.0',
      om_wind_max_ms: '12.6',
      om_et_sum_m: '56.24'
    }, 1);

    expect(r.ok).toBe(true);
    expect(r.value.precipitation_mm).toBeCloseTo(78.6, 4);
    expect(r.value.wind_max_kmh).toBeCloseTo(45.36, 4);
    expect(r.value.solar_radiation_mj_m2).toBeCloseTo(18.1387, 3); // ÷ 15
    expect(r.value.evapotranspiration_mm).toBeCloseTo(3.7493, 3);  // ÷ 15
  });

  it('prefers the documented API columns when both spellings are present', () => {
    const r = parseCsvForecastRow({
      ...notebookRow,
      // A row that genuinely carries API units is trusted as-is; the om_*
      // originals are only a fallback for notebook-native CSVs.
      temperature_mean: '28.5',
      precipitation_mm: '12.3',
      wind_max_kmh: '20',
      solar_radiation_mj_m2: '19.4',
      evapotranspiration_mm: '3.9',
      om_temp_2m_k: '27.825',
      om_precip_m: '0.0522',
      om_solar_rad_j: '146060.0',
      om_et_sum_m: '30.45'
    }, 1);

    expect(r.ok).toBe(true);
    expect(r.value.temperature_mean).toBeCloseTo(28.5, 4);
    expect(r.value.precipitation_mm).toBeCloseTo(12.3, 4);
    expect(r.value.wind_max_kmh).toBeCloseTo(20, 4);
    expect(r.value.solar_radiation_mj_m2).toBeCloseTo(19.4, 4);
    expect(r.value.evapotranspiration_mm).toBeCloseTo(3.9, 4);
  });

  it('omits meteorological fields entirely when the CSV has none', () => {
    const r = parseCsvForecastRow(legacyRow, 1);
    expect(r.ok).toBe(true);
    for (const field of [
      'temperature_mean', 'temperature_max', 'temperature_min', 'precipitation_mm',
      'wind_max_kmh', 'dewpoint_mean', 'solar_radiation_mj_m2', 'evapotranspiration_mm',
    ]) {
      expect(r.value[field]).toBeUndefined();
    }
  });

  it('prefers severity_score when both columns are present', () => {
    const r = parseCsvForecastRow({ ...notebookRow, severity_score: '0.4', model_severity: '0.9' }, 1);
    expect(r.ok).toBe(true);
    expect(r.value.severity_score).toBe(0.4);
  });
});

describe('parseCsvForecastRow — rejections', () => {
  it.each(VALID_HORIZONS)('accepts horizon %s', (h) => {
    expect(parseCsvForecastRow({ ...legacyRow, horizon: h }, 1).ok).toBe(true);
  });

  it('rejects an unknown horizon', () => {
    const r = parseCsvForecastRow({ ...legacyRow, horizon: '20_days' }, 1);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Invalid horizon');
  });

  it('rejects an unknown hazard', () => {
    const r = parseCsvForecastRow({ ...legacyRow, hazard_type: 'Landslide' }, 1);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Invalid hazard');
  });

  it('rejects missing severity (neither severity_score nor model_severity)', () => {
    const { severity_score: _omit, ...noSeverity } = legacyRow;
    const r = parseCsvForecastRow(noSeverity, 1);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Invalid severity');
  });

  it.each([['-0.1'], ['1.5'], ['abc'], ['']])('rejects out-of-range/non-numeric severity %s', (bad) => {
    expect(parseCsvForecastRow({ ...legacyRow, severity_score: bad }, 1).ok).toBe(false);
  });

  it.each([['-0.1'], ['1.5'], ['oops']])('rejects invalid confidence %s', (bad) => {
    expect(parseCsvForecastRow({ ...legacyRow, confidence: bad }, 1).ok).toBe(false);
  });

  it('rejects a non-numeric district_id', () => {
    const r = parseCsvForecastRow({ ...legacyRow, district_id: 'dhaka' }, 1);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('district_id');
  });

  it('rejects missing district_name', () => {
    const r = parseCsvForecastRow({ ...legacyRow, district_name: '' }, 1);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('district_name');
  });

  it('rejects missing dates', () => {
    const r = parseCsvForecastRow({ ...legacyRow, prediction_date: '' }, 1);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('prediction_date');
  });

  it('rejects non-object input', () => {
    expect(parseCsvForecastRow(null, 1).ok).toBe(false);
  });
});

describe('parseCsvForecastRow — constants parity', () => {
  it('keeps the 7/15-day horizons and 8 hazard classes in sync with the model', () => {
    expect(VALID_HORIZONS).toEqual(['7_days', '15_days']);
    expect(VALID_HAZARDS).toHaveLength(8);
    expect(VALID_HAZARDS).toContain('Severe Local Storm');
  });
});
