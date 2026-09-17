/**
 * @jest-environment node
 *
 * The offline alert-engine replay (Phase 5).
 *
 * This suite pins the property that makes the replay trustworthy: it runs the **real**
 * engine over the **committed** forecast snapshot and must refuse to publish anything the
 * snapshot cannot support. Today that means every row comes back
 * `publication_blocked` — §1.6 requires a model version, and the committed snapshot's
 * `provenance.model_version` is null. If someone ever "fixes" that by stamping a version,
 * these tests fail, which is the point.
 */

import { memoryStore, rehearseAlertEngine, rowsFromSnapshot } from '../scripts/rehearse_alert_engine.mjs';
import { readFileSync } from 'node:fs';

const snapshot = JSON.parse(readFileSync('frontend/public/data/forecasts-latest.json', 'utf8'));
const NOW = new Date('2026-09-18T06:00:00Z');

describe('rowsFromSnapshot', () => {
  it('flattens both horizons and keeps the horizon on each row', () => {
    const rows = rowsFromSnapshot({
      horizons: { '7_days': [{ district_id: 1 }], '15_days': [{ district_id: 1 }, { district_id: 2 }] },
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.horizon)).toEqual(['7_days', '15_days', '15_days']);
  });

  it('survives a snapshot with no horizons block', () => {
    expect(rowsFromSnapshot({})).toEqual([]);
    expect(rowsFromSnapshot(null)).toEqual([]);
  });
});

describe('memoryStore', () => {
  it('behaves like the real store for the methods the engine calls', async () => {
    const store = memoryStore();
    await store.putDocument({ id: 'x', alert_key: 'k', state: 'DRAFT', prediction_date: '2026-09-18' });
    expect((await store.getDocument('x')).id).toBe('x');
    expect((await store.getLatestDocumentForAlertKey('k')).id).toBe('x');
    await store.putDocument({ id: 'y', alert_key: 'k', state: 'SUPERSEDED', prediction_date: '2026-09-17' });
    expect((await store.getLatestDocumentForAlertKey('k')).id).toBe('x');
  });
});

describe('rehearseAlertEngine over the committed snapshot', () => {
  let result;

  beforeAll(async () => {
    result = await rehearseAlertEngine({ snapshot, now: NOW });
  });

  it('assesses every row the snapshot carries', () => {
    expect(result.rows_total).toBe(74);
    expect(result.assessed).toBe(74);
    expect(result.skipped).toEqual([]);
  });

  it('produces WATCH rows only — no warning may be reached without a calibration map', () => {
    expect(result.counts.WARNING).toBe(0);
    expect(result.counts.SEVERE).toBe(0);
    expect(result.counts.WATCH).toBe(74);
    expect(result.max_auto_publish_level).toBe('WATCH');
  });

  it('publishes nothing, and says why instead of stamping a model version', () => {
    expect(result.persisted.published).toBe(0);
    expect(result.persisted.blocked).toBe(74);
    const reasons = Object.keys(result.persisted.blocked_reasons);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/model version/i);
    expect(result.provenance_note).toMatch(/must not|not.*invent/i);
  });

  it('records the block on every document rather than leaving an unexplained draft', () => {
    expect(result.alerts).toHaveLength(74);
    for (const doc of result.alerts) {
      expect(doc.state).toBe('DRAFT');
      expect(doc.publication_blocked_reason).toMatch(/model version/i);
      expect(doc.disclaimer).toMatch(/not an official warning service/);
      expect(doc.provenance.model_version).toBeNull();
    }
  });

  it('carries the forecast snapshot it replayed, so the run can be traced', () => {
    expect(result.snapshot_schema).toBe(snapshot.schema);
    expect(result.prediction_date).toBe(snapshot.prediction_date);
    expect(result.generated_at).toBe(NOW.toISOString());
  });

  it('reports the saturation warning the model card describes', () => {
    expect(result.saturation.severity_at_max).toBeGreaterThan(0);
    expect(result.saturation.note).toMatch(/degenerate/);
  });

  it('is deterministic for a fixed clock', async () => {
    const again = await rehearseAlertEngine({ snapshot, now: NOW });
    expect(again.counts).toEqual(result.counts);
    expect(again.persisted.blocked_reasons).toEqual(result.persisted.blocked_reasons);
  });
});
