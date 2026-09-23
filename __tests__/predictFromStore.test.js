/**
 * @jest-environment node
 *
 * predictFromStore — the ADR 0009 seam (backend/utils/predictFromStore.js).
 *
 * These tests are the verification section of the ADR: they prove that the
 * stored forecast snapshot can serve the `/api/predict` envelope the frontend
 * already consumes, and that the adapter invents nothing while doing it.
 *
 * The strongest assertion is the last one — declared-unavailable fields must
 * equal the fields that actually come back null, in both directions. That way
 * Phase 2 adding `class_probabilities` to the pipeline fails this test until the
 * module and the architecture doc are updated together, instead of quietly
 * changing what the API promises.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  predictFromStore,
  severityBin,
  NULLABLE_PATHS,
  PREDICT_ENVELOPE_SCHEMA,
  CONFIDENCE_KIND_SOFTMAX,
} from '../backend/utils/predictFromStore.js';

const SNAPSHOT = path.resolve(__dirname, '..', 'frontend', 'public', 'data', 'forecasts-latest.json');

function snapshotRows() {
  const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const rows = Object.values(snap.horizons ?? {}).flat();
  if (rows.length === 0) throw new Error('snapshot has no rows — cannot test the seam against real data');
  return { snap, rows };
}

const firstRow = () => snapshotRows().rows[0];

describe('predictFromStore / envelope from real snapshot data', () => {
  it('produces a schema-complete envelope for a real stored row', () => {
    const row = firstRow();
    const envelope = predictFromStore(row, { now: new Date('2026-09-17T00:00:00Z') });

    expect(envelope.metadata.schema).toBe(PREDICT_ENVELOPE_SCHEMA);
    expect(envelope.prediction.hazard).toBe(row.hazard_type);
    expect(envelope.prediction.severity_score).toBe(row.severity_score);
    expect(envelope.prediction.confidence).toBe(row.confidence);
    expect(envelope.prediction).toHaveProperty('class_probabilities');
    expect(envelope.prediction).toHaveProperty('top_3');
    expect(envelope.prediction.channel_features).toHaveProperty('precip_mean');
    expect(envelope.inference).toMatchObject({
      served_from: 'stored-forecast',
      timestamp: '2026-09-17T00:00:00.000Z',
    });
    expect(envelope.provenance.horizon).toBe(row.horizon);
    expect(envelope.provenance.prediction_date).toBe(row.prediction_date);
  });

  it('carries provenance the UI can display instead of implying live inference', () => {
    const envelope = predictFromStore(firstRow());
    expect(envelope.provenance.district_name).toBeTruthy();
    expect(envelope.provenance.prediction_date).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(envelope.provenance.target_date).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(['7_days', '15_days']).toContain(envelope.provenance.horizon);
  });

  it('reports no inference latency, and never conflates it with store latency', () => {
    const envelope = predictFromStore(firstRow(), { storeLatencyMs: 12 });
    expect(envelope.inference.latency_ms).toBeNull();
    expect(envelope.inference.store_latency_ms).toBe(12);
    // Unmeasured is not zero: a consumer testing `> 0` must see "not measured".
    expect(envelope.inference.latency_ms).not.toBe(0);
  });

  it('labels confidence for what it is (uncalibrated model softmax)', () => {
    const envelope = predictFromStore(firstRow());
    expect(envelope.prediction.confidence_kind).toBe(CONFIDENCE_KIND_SOFTMAX);
  });

  it('maps the meteorological drivers that are published, and only those', () => {
    const { rows } = snapshotRows();
    const withWeather = rows.find((r) => typeof r.temperature_max === 'number');
    expect(withWeather).toBeDefined();

    const envelope = predictFromStore(withWeather);
    for (const field of ['precip_mean', 'max_temp', 'min_temp']) {
      expect(typeof envelope.prediction.channel_features[field]).toBe('number');
    }
    // Driver values the pipeline does not publish must be null, not 0 or a guess.
    for (const field of ['ndvi', 'ndwi', 'soil_moisture', 'sar_vv']) {
      expect(envelope.prediction.channel_features[field]).toBeNull();
    }
  });

  it('never emits NaN, undefined or a fabricated number anywhere in the envelope', () => {
    const envelope = predictFromStore(firstRow());
    const walk = (node, trail = '') => {
      for (const [key, value] of Object.entries(node)) {
        const here = trail ? `${trail}.${key}` : key;
        if (value === undefined) throw new Error(`undefined at ${here}`);
        if (typeof value === 'number') {
          expect(Number.isFinite(value)).toBe(true);
        } else if (value && typeof value === 'object') {
          walk(value, here);
        }
      }
    };
    walk(envelope);
  });

  it('does not mutate the stored row it was handed', () => {
    const row = Object.freeze({ ...firstRow() });
    expect(() => predictFromStore(row)).not.toThrow();
    expect(Object.isFrozen(row)).toBe(true);
  });

  it('holds for every row in the shipped snapshot (no per-district special case)', () => {
    const { rows } = snapshotRows();
    for (const row of rows) {
      const envelope = predictFromStore(row);
      expect(envelope.prediction.hazard).toBe(row.hazard_type);
      expect(envelope.prediction.severity_bin).toBe(severityBin(row.severity_score));
    }
  });
});

describe('predictFromStore / refuses to invent', () => {
  it('rejects a row whose hazard class is not one of the eight', () => {
    const row = { ...firstRow(), hazard_type: 'Landslide' };
    expect(() => predictFromStore(row)).toThrow(/unknown hazard_type/);
  });

  it('rejects a row with a missing or non-numeric severity', () => {
    const row = { ...firstRow() };
    delete row.severity_score;
    expect(() => predictFromStore(row)).toThrow(/severity_score/);
    expect(() => predictFromStore({ ...firstRow(), severity_score: 'high' })).toThrow(/severity_score/);
  });

  it('rejects a row with a missing confidence rather than defaulting it', () => {
    const row = { ...firstRow() };
    delete row.confidence;
    expect(() => predictFromStore(row)).toThrow(/confidence/);
  });

  it('rejects a non-row input', () => {
    expect(() => predictFromStore(null)).toThrow(/stored forecast row/);
  });
});

describe('predictFromStore / declared gaps match actual gaps', () => {
  it('reports exactly the fields that came back null', () => {
    const envelope = predictFromStore(firstRow());
    const actual = [];
    const walk = (value, path = '') => {
      for (const [key, child] of Object.entries(value)) {
        const name = path ? `${path}.${key}` : key;
        if (child === null) actual.push(name);
        else if (child && typeof child === 'object' && !Array.isArray(child)) walk(child, name);
      }
    };
    walk(envelope);
    expect(new Set(envelope.metadata.fields_unavailable)).toEqual(new Set(actual));
  });

  it('keeps metadata.fields_unavailable consistent in both directions', () => {
    const envelope = predictFromStore(firstRow());
    const read = (p) => p.split('.').reduce((n, k) => (n == null ? undefined : n[k]), envelope);
    const actuallyNull = NULLABLE_PATHS.filter((p) => read(p) == null);
    expect(new Set(envelope.metadata.fields_unavailable)).toEqual(new Set(actuallyNull));
    expect(envelope.metadata.fields_unavailable.length).toBeGreaterThan(0);
  });

  it('carries the independent physics track when the row records one', () => {
    const envelope = predictFromStore({
      ...firstRow(),
      physics_top_hazard: 'Tropical Cyclone',
      physics_agreement: false,
      track_divergence: 0.41,
      soil_channels_fabricated: true,
    });
    expect(envelope.provenance.physics_top_hazard).toBe('Tropical Cyclone');
    expect(envelope.provenance.physics_agreement).toBe(false);
    expect(envelope.provenance.track_divergence).toBeCloseTo(0.41);
    expect(envelope.provenance.soil_channels_fabricated).toBe(true);
    for (const path of [
      'provenance.physics_top_hazard',
      'provenance.physics_agreement',
      'provenance.track_divergence',
      'provenance.soil_channels_fabricated',
    ]) {
      expect(envelope.metadata.fields_unavailable).not.toContain(path);
    }
  });

  it('does not guess a physics pick from an unknown hazard label', () => {
    const envelope = predictFromStore({ ...firstRow(), physics_top_hazard: 'Landslide' });
    expect(envelope.provenance.physics_top_hazard).toBeNull();
    expect(envelope.metadata.fields_unavailable).toContain('provenance.physics_top_hazard');
  });

  it('drops model_version from the unavailable list when the row records one', () => {
    const envelope = predictFromStore({
      ...firstRow(),
      model_version: '2.1.9+model.d7b1a5b48aa6',
    });
    expect(envelope.inference.model_version).toBe('2.1.9+model.d7b1a5b48aa6');
    expect(envelope.metadata.fields_unavailable).not.toContain('inference.model_version');
  });
});

describe('severity binning', () => {
  it('uses the documented bands', () => {
    expect(severityBin(0)).toBe('Low');
    expect(severityBin(0.33)).toBe('Low');
    expect(severityBin(0.34)).toBe('Moderate');
    expect(severityBin(0.66)).toBe('Moderate');
    expect(severityBin(0.67)).toBe('High');
    expect(severityBin(1)).toBe('High');
  });

});
