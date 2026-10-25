/**
 * @jest-environment node
 *
 * The offline alert-engine replay (Phase 5).
 *
 * This suite pins the property that makes the replay trustworthy: it runs the **real**
 * engine over the **committed** forecast snapshot and reports exactly what the rows
 * support. Since the recovered pipeline stamps `provenance.model_version`
 * (2026-10-24 onward), the honest rehearsal outcome is publication of the auto-publishable
 * rows — and the suite pins the distribution it computes. The opposite arm (a snapshot
 * whose rows carry no provenance → everything `publication_blocked`) is exercised below
 * against an in-memory de-stamped copy, so the §1.6 gate itself stays tested without
 * depending on what the committed data happens to say.
 */

import { memoryStore, rehearseAlertEngine, rowsFromSnapshot } from '../scripts/rehearse_alert_engine.mjs';
import { buildSnapshot } from '../scripts/build_alert_snapshot.mjs';
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
    // 64 districts × 2 horizons in the committed snapshot (asserted against the artifact
    // itself, not a fixture, so the pin rots exactly when the data does).
    expect(result.rows_total).toBe(128);
    expect(result.assessed).toBe(128);
    expect(result.skipped).toEqual([]);
  });

  it('produces WATCH rows only — no warning may be reached without calibration accuracy', () => {
    // Distribution measured on the committed snapshot (2026-10-24): 106 WATCH + 22
    // NO_ALERT, zero WARNING/SEVERE. If the policy bands or the data drift this fails,
    // forcing a deliberate re-baseline rather than a silent level shift.
    expect(result.rows_total).toBe(result.counts.WATCH + result.counts.NO_ALERT
      + result.counts.WARNING + result.counts.SEVERE);
    expect(result.counts.WARNING).toBe(0);
    expect(result.counts.SEVERE).toBe(0);
    expect(result.counts.WATCH).toBe(106);
    expect(result.counts.NO_ALERT).toBe(22);
    expect(result.max_auto_publish_level).toBe('WATCH');
  });

  it('publishes the auto-publishable rows because the committed snapshot is stamped', () => {
    expect(result.persisted.published).toBe(106);
    expect(result.persisted.blocked).toBe(0);
    expect(result.persisted.pending_review).toBe(0);
    for (const alert of result.published_alerts) {
      expect(alert.state).toBe('PUBLISHED');
      expect(alert.level).toBe('WATCH');
      expect(alert.requires_human_review).toBe(false);
      expect(alert.disclaimer).toMatch(/not an official warning service/);
      expect(alert.provenance.model_version).toBe(snapshot.provenance.model_version);
    }
    expect(result.provenance_note).toMatch(/provenance §1\.6 requires/);
  });

  it('records the publication decision on every document — no unexplained drafts', () => {
    expect(result.alerts).toHaveLength(128);
    const published = result.alerts.filter((doc) => doc.state === 'PUBLISHED');
    const drafts = result.alerts.filter((doc) => doc.state === 'DRAFT');
    expect(published).toHaveLength(106);
    expect(drafts).toHaveLength(22);
    for (const doc of published) {
      expect(doc.disclaimer).toMatch(/not an official warning service/);
      expect(doc.provenance.model_version).toBe(snapshot.provenance.model_version);
      expect(doc.publication_blocked_reason).toBeUndefined();
    }
    // The DRAFT remainder is the NO_ALERT cohort: "we looked and saw nothing" is stored,
    // not published (service.js header) — a publication hold would be a defect here.
    for (const doc of drafts) {
      expect(doc.level).toBe('NO_ALERT');
      expect(doc.disclaimer).toMatch(/not an official warning service/);
    }
  });

  it('carries the forecast snapshot it replayed, so the run can be traced', () => {
    expect(result.snapshot_schema).toBe(snapshot.schema);
    expect(result.prediction_date).toBe(snapshot.prediction_date);
    expect(result.generated_at).toBe(NOW.toISOString());
  });

  it('records no saturation warning on the committed (non-degenerate) distribution', () => {
    expect(result.saturation.severity_at_max).toBe(0);
    expect(result.saturation.note).toBeNull();
  });

  it('does fire the model card warning for a degenerate severity distribution', async () => {
    // Synthetic 4-row snapshot at the severity ceiling: the note is data-driven
    // (assess.js), so it is pinned against synthetic rows, not committed data.
    const degenerate = {
      schema: snapshot.schema,
      prediction_date: snapshot.prediction_date,
      provenance: { model_version: snapshot.provenance.model_version },
      horizons: {
        '7_days': [1, 2, 3, 4].map((d) => ({
          district_id: d,
          district_name: `Synthetic-${d}`,
          horizon: '7_days',
          hazard_type: 'Flood',
          severity_score: 1,
          confidence: 0.9,
          target_date: '2026-09-23',
          prediction_date: '2026-09-18',
          model_version: snapshot.provenance.model_version,
        })),
      },
    };
    const run = await rehearseAlertEngine({ snapshot: degenerate, now: NOW });
    expect(run.saturation.severity_at_max).toBeGreaterThan(0);
    expect(run.saturation.note).toMatch(/degenerate/);
  });

  it('is deterministic for a fixed clock', async () => {
    const again = await rehearseAlertEngine({ snapshot, now: NOW });
    expect(again.counts).toEqual(result.counts);
    expect(again.persisted.blocked_reasons).toEqual(result.persisted.blocked_reasons);
  });
});

describe('the run report a pipeline consumes', () => {
  it('carries the committed run’s published rows straight into the alert snapshot', async () => {
    const runResult = await rehearseAlertEngine({ snapshot, now: NOW });
    const built = buildSnapshot(runResult);
    expect(runResult.published_alerts).toHaveLength(runResult.persisted.published);
    expect(built.alerts).toHaveLength(106);
    expect(built.counts.dropped_unpublished).toBe(0);
    expect(built.counts.WATCH).toBe(106);
    expect(built.assessed).toBe(128);
    expect(built.alerts.every((alert) => alert.state === 'PUBLISHED')).toBe(true);
    expect(built.alerts.every((alert) => alert.disclaimer && alert.disclaimer.length > 0)).toBe(true);
  });

  it('blocks publication entirely when the rows carry no model version (in memory only)', async () => {
    // The §1.6 gate arm the committed data no longer exercises: strip the row-level
    // `model_version` (the field the ingest producer stamps — the engine never reads the
    // snapshot's decorative top-level provenance block) in memory, and every auto-publish
    // must fail closed with the reason on the record.
    const stampedOff = {
      ...snapshot,
      provenance: { ...(snapshot.provenance || {}), model_version: null },
      horizons: Object.fromEntries(Object.entries(snapshot.horizons).map(([horizon, rows]) => [
        horizon,
        rows.map((row) => ({ ...row, model_version: undefined })),
      ])),
    };

    const gated = await rehearseAlertEngine({ snapshot: stampedOff, now: NOW });
    expect(gated.persisted.published).toBe(0);
    expect(gated.persisted.blocked).toBe(106);
    expect(Array.isArray(gated.published_alerts)).toBe(true);
    expect(gated.published_alerts).toEqual([]);
    const reasons = Object.keys(gated.persisted.blocked_reasons);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/model version/i);
    expect(gated.provenance_note).toMatch(/must not|not.*invent/i);
    const drafts = gated.alerts.filter((doc) => doc.publication_blocked_reason);
    expect(drafts).toHaveLength(106);
    for (const doc of drafts) {
      expect(doc.state).toBe('DRAFT');
      expect(doc.provenance.model_version ?? null).toBeNull();
    }
  });

  it('never writes the committed snapshot — stamping happens in memory or not at all', async () => {
    const before = readFileSync('frontend/public/data/forecasts-latest.json', 'utf8');
    await rehearseAlertEngine({ snapshot, now: NOW });
    const after = readFileSync('frontend/public/data/forecasts-latest.json', 'utf8');
    expect(after).toBe(before);
    // …and the recovered-pipeline truth that the arm above depends on: the committed
    // artifact IS provenance-stamped (null here means the publication gate is engaged).
    const onDisk = JSON.parse(before);
    expect(onDisk.provenance.model_version).toBeTruthy();
  });
});
