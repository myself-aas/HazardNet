/**
 * @jest-environment node
 *
 * Calibrated-confidence ingest contract (Phase 3 MLOps).
 *
 * `python -m mlops.cli apply-calibration` rewrites a published CSV so that
 * `confidence` carries the fitted map's output and `confidence_calibrated` says
 * so. This suite pins what the ingest boundary must then do with those rows: the
 * calibrated value becomes `confidence`, `confidence_kind` becomes
 * `calibrated_probability`, and the raw softmax stays readable — plus the two
 * cases that must not slip through (an out-of-range value, and a stale
 * `confidence_kind` column that contradicts the calibrated one).
 */
import { parseCsvForecastRow } from '../backend/utils/forecastRow.js';

const base = {
  district_id: '19',
  district_name: 'Sylhet',
  horizon: '7_days',
  hazard_type: 'Flood',
  severity_score: '0.9',
  confidence: '0.99',
  target_date: '2026-06-17',
  prediction_date: '2026-06-10'
};

describe('uncalibrated rows (the default)', () => {
  test('keeps confidence as the softmax and leaves confidence_kind unset for the API to default', () => {
    const result = parseCsvForecastRow(base, 2);
    expect(result.ok).toBe(true);
    expect(result.value.confidence).toBe(0.99);
    expect(result.value.confidence_kind).toBeUndefined();
    expect(result.value.confidence_raw).toBeUndefined();
  });

  test('passes an explicit confidence_kind through', () => {
    const result = parseCsvForecastRow({ ...base, confidence_kind: 'model_softmax_top_class' }, 2);
    expect(result.value.confidence_kind).toBe('model_softmax_top_class');
  });
});

describe('calibrated rows', () => {
  test("publishes the map's output as confidence and labels it", () => {
    const result = parseCsvForecastRow({ ...base, confidence_calibrated: '0.42' }, 2);
    expect(result.ok).toBe(true);
    expect(result.value.confidence).toBe(0.42);
    expect(result.value.confidence_kind).toBe('calibrated_probability');
    expect(result.value.confidence_raw).toBe(0.99);
  });

  test('the calibrated column wins over a stale confidence_kind', () => {
    const result = parseCsvForecastRow(
      { ...base, confidence_calibrated: '0.42', confidence_kind: 'model_softmax_top_class' },
      2
    );
    expect(result.value.confidence).toBe(0.42);
    expect(result.value.confidence_kind).toBe('calibrated_probability');
  });

  test('an empty calibrated cell is treated as absent, not as zero', () => {
    const result = parseCsvForecastRow({ ...base, confidence_calibrated: '' }, 2);
    expect(result.ok).toBe(true);
    expect(result.value.confidence).toBe(0.99);
    expect(result.value.confidence_kind).toBeUndefined();
  });

  test('an out-of-range calibrated value is rejected rather than clamped', () => {
    const high = parseCsvForecastRow({ ...base, confidence_calibrated: '1.4' }, 2);
    expect(high.ok).toBe(false);
    expect(high.error).toMatch(/confidence_calibrated/);
    const low = parseCsvForecastRow({ ...base, confidence_calibrated: '-0.1' }, 2);
    expect(low.ok).toBe(false);
  });

  test('a non-numeric calibrated value is rejected', () => {
    const result = parseCsvForecastRow({ ...base, confidence_calibrated: 'n/a' }, 2);
    expect(result.ok).toBe(false);
  });
});
