/**
 * @jest-environment node
 *
 * parseCsvForecastRow — shared CSV ingest row parser (backend/utils/forecastRow.js).
 *
 * The weekly Kaggle notebook writes dual-track columns (`model_severity`,
 * `physics_severity`, plus `division` / `pcode`), while the legacy ingest
 * contract used a single `severity_score`. Both shapes must ingest cleanly.
 */
import { parseCsvForecastRow, VALID_HAZARDS, VALID_HORIZONS } from '../backend/utils/forecastRow.js';

const legacyRow = {
  district_id: '19',
  district_name: 'Dhaka',
  horizon: '10_days',
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
  horizon: '20_days',
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
      horizon: '10_days',
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
    // '15_days' is the retired 7/15-era value — must now be rejected.
    const r = parseCsvForecastRow({ ...legacyRow, horizon: '15_days' }, 1);
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
    expect(VALID_HORIZONS).toEqual(['10_days', '20_days', '30_days']);
    expect(VALID_HAZARDS).toHaveLength(8);
    expect(VALID_HAZARDS).toContain('Severe Local Storm');
  });
});
