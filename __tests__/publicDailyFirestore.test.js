/** @jest-environment node */
import { DISTRICT_REGISTRY } from '../backend/utils/districtRegistry.js';
import { buildPublicDailySnapshot } from '../backend/utils/dailyAdvisoryPublic.js';
import {
  mirrorApprovedDailySnapshot, readMirroredDailySnapshot,
  DAILY_RUN_COLLECTION, DAILY_HEAD_COLLECTION,
} from '../backend/utils/publicDailyFirestore.js';

const NOW = new Date('2026-11-01T12:00:00.000Z');
const manifest = (runId = 'synthetic-run-1', cutoff = '2026-11-01T08:00:00.000Z') => ({
  schema_version: '4.3-pb', run_id: runId,
  data_cutoff: cutoff, generated_at: '2026-11-01T10:00:00.000Z',
  model_version: 'synthetic-version', csv_sha256: 'a'.repeat(64),
});

function syntheticRun(run = manifest(), withheld = false) {
  const rows = DISTRICT_REGISTRY.flatMap((district) => Array.from({ length: 15 }, (_, index) => ({
    district: district.district_name,
    forecast_day: String(index + 1),
    target_date: new Date(Date.parse('2026-11-02T00:00:00Z') + index * 86_400_000)
      .toISOString().slice(0, 10),
    hazard: 'Flood', advisory_tier: withheld && district.district_id === 1 && index === 2 ? 'WARNING' : 'WATCH',
    severity_score: '0.3', is_peak_day: String(index === 0), bmd_stale: 'True', physics_degraded: 'False',
    unapproved_input_note: 'never in a public result', unapproved_input_metric: '0.9',
  })));
  return buildPublicDailySnapshot(rows, run, { expectedDistricts: 64 });
}

function memoryFirestore() {
  const documents = new Map();
  const makeRef = (path) => ({
    path,
    collection: (name) => makeCollection(`${path}/${name}`),
    get: async () => {
      const data = documents.get(path);
      return { exists: !!data, data: () => data };
    },
  });
  const makeCollection = (name) => ({ doc: (id) => makeRef(`${name}/${id}`) });
  return {
    documents,
    db: {
      collection: jest.fn((name) => makeCollection(name)),
      runTransaction: jest.fn(async (fn) => {
        const writes = [];
        const result = await fn({
          get: (reference) => reference.get(),
          set: (reference, data) => writes.push([reference.path, JSON.parse(JSON.stringify(data))]),
        });
        for (const [path, data] of writes) documents.set(path, data);
        return result;
      }),
    },
  };
}

describe('Admin-only mirror of approved public daily results', () => {
  test('atomically stores one immutable run, 64 bounded districts and the active pointer; reads it back', async () => {
    const snapshot = syntheticRun(manifest(), true);
    const { db, documents } = memoryFirestore();
    expect(await mirrorApprovedDailySnapshot(snapshot, { db, expectedRunId: snapshot.run.id, now: NOW }))
      .toEqual({ status: 'persisted', runId: snapshot.run.id, districts: 64, rows: 960 });
    expect(documents.size).toBe(66);
    expect(documents.get(`${DAILY_HEAD_COLLECTION}/current`).runId).toBe(snapshot.run.id);
    expect(documents.get(`${DAILY_RUN_COLLECTION}/${snapshot.run.id}/districts/1`).advisories).toHaveLength(15);
    expect(await readMirroredDailySnapshot(db)).toEqual(snapshot);
    const publicText = JSON.stringify([...documents.values()]);
    for (const privateField of ['unapproved_input_note', 'unapproved_input_metric', 'never in a public result']) {
      expect(publicText).not.toContain(privateField);
    }
    expect(publicText).toContain('WARNING');
    expect(await mirrorApprovedDailySnapshot(snapshot, { db, expectedRunId: snapshot.run.id, now: NOW }))
      .toEqual({ status: 'unchanged', runId: snapshot.run.id, districts: 64, rows: 960 });
    expect(documents.size).toBe(66);
  });

  test('refuses a mismatched confirmation, a malformed field, and a preview without writing anything', async () => {
    const { db, documents } = memoryFirestore();
    const snapshot = syntheticRun();
    await expect(mirrorApprovedDailySnapshot(snapshot, { db, expectedRunId: 'other', now: NOW }))
      .rejects.toThrow('run ID');
    expect(db.runTransaction).not.toHaveBeenCalled();
    await expect(mirrorApprovedDailySnapshot({ ...snapshot, confidential: 1 }, {
      db, expectedRunId: snapshot.run.id, now: NOW,
    })).rejects.toThrow('run ID');
    await expect(mirrorApprovedDailySnapshot({ ...snapshot, coverage: { ...snapshot.coverage, districts: 1 } }, {
      db, expectedRunId: snapshot.run.id, now: NOW,
    })).rejects.toThrow('incomplete');
    expect(documents.size).toBe(0);
  });

  test('refuses stale data, rollback and reuse of a run ID with different contents', async () => {
    const { db, documents } = memoryFirestore();
    const original = syntheticRun();
    await expect(mirrorApprovedDailySnapshot(original, {
      db, expectedRunId: original.run.id, now: new Date('2026-11-04T12:00:00Z'),
    })).rejects.toThrow('not a current');
    expect(documents.size).toBe(0);
    await mirrorApprovedDailySnapshot(original, { db, expectedRunId: original.run.id, now: NOW });
    const older = syntheticRun(manifest('other-run', '2026-11-01T07:00:00.000Z'));
    await expect(mirrorApprovedDailySnapshot(older, { db, expectedRunId: 'other-run', now: NOW }))
      .rejects.toThrow('newer or equal-cutoff');
    const reused = syntheticRun();
    reused.run.modelVersion = 'changed-but-valid';
    await expect(mirrorApprovedDailySnapshot(reused, { db, expectedRunId: original.run.id, now: NOW }))
      .rejects.toThrow('different result');
    expect(documents.size).toBe(66);
  });

  test('read-back fails closed when a district disappears or a pointer is corrupt', async () => {
    const { db, documents } = memoryFirestore();
    const snapshot = syntheticRun();
    await mirrorApprovedDailySnapshot(snapshot, { db, expectedRunId: snapshot.run.id, now: NOW });
    const districtPath = `${DAILY_RUN_COLLECTION}/${snapshot.run.id}/districts/64`;
    const last = documents.get(districtPath);
    documents.delete(districtPath);
    expect(await readMirroredDailySnapshot(db)).toBeNull();
    documents.set(districtPath, { ...last, confidential: 'not a public field' });
    expect(await readMirroredDailySnapshot(db)).toBeNull();
    documents.set(districtPath, last);
    documents.get(`${DAILY_HEAD_COLLECTION}/current`).digest = '0'.repeat(64);
    expect(await readMirroredDailySnapshot(db)).toBeNull();
  });
});
