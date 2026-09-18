/**
 * @jest-environment node
 *
 * The orchestration layer: assess → persist → (auto-publish | queue for review) →
 * review → notify. Uses an in-memory store double with the same method semantics as
 * backend/alerts/store.js, so the state machine is exercised without Firestore.
 */
import {
  buildAlertDocument, getAlertRunState, listAlerts, persistAssessment, previewAssessments,
  reviewAlert, runAlertEngine, setAlertRunState, stateCounts,
} from '../../backend/alerts/service.js';
import { alertFromDocument, alertIdFor } from '../../backend/alerts/store.js';
import { getPolicy } from '../../backend/alerts/policy.js';
import { assessRow } from '../../backend/alerts/assess.js';

const NOW = new Date('2026-09-17T06:00:00Z');
const policy = getPolicy({});

function memoryStore(seed = []) {
  const docs = new Map(seed.map((doc) => [doc.id, doc]));
  return {
    mode: 'memory-test-double',
    docs,
    async putDocument(doc) {
      docs.set(doc.id, doc);
      return doc;
    },
    async getDocument(id) {
      return docs.get(id) || null;
    },
    // Mirrors backend/alerts/store.js: the live issue for an alert key.
    async getLatestDocumentForAlertKey(key) {
      const live = [...docs.values()]
        .filter((doc) => doc.alert_key === key && doc.state !== 'SUPERSEDED')
        .sort((a, b) => String(b.prediction_date || '').localeCompare(String(a.prediction_date || '')));
      return live[0] || null;
    },
    async listDocuments({ state, level, horizon, districtId, max = 200 } = {}) {
      return [...docs.values()]
        .filter((doc) => doc.id !== '_meta')
        .filter((doc) => (state ? doc.state === state : true))
        .filter((doc) => (level ? doc.level === level : true))
        .filter((doc) => (horizon ? doc.horizon === horizon : true))
        .filter((doc) => (districtId !== undefined && districtId !== null
          ? Number(doc.district_id) === Number(districtId) : true))
        .slice(0, max);
    },
  };
}

const forecastStore = (rows) => ({
  async getLatestForecastsByHorizon(horizon) {
    return rows.filter((row) => row.horizon === horizon);
  },
});

const row = (over = {}) => ({
  district_id: 19,
  district_name: 'Dhaka',
  division: 'Dhaka',
  pcode: '3037',
  horizon: '7_days',
  hazard_type: 'Flood',
  severity_score: 0.55,
  confidence: 0.5,
  confidence_kind: 'model_softmax_top_class',
  model_severity: 0.55,
  physics_severity: 0.55,
  prediction_date: '2026-09-16',
  target_date: '2026-09-23',
  model_version: '2.1.9+model.d7b1a5b48aa6',
  dataset_version: 'ds1.0123456789abcdef',
  pipeline_version: 'v2.3.0',
  run_id: 'run-1',
  ...over,
});

const assessmentFor = (over = {}) => assessRow(row(over), { policy, now: NOW });

beforeEach(() => {
  // The auto-publish window is a spam guard, not a rule under test here.
  process.env.ALERT_AUTO_PUBLISH_MINUTES = '0';
});

afterEach(() => {
  delete process.env.ALERT_AUTO_PUBLISH_MINUTES;
  delete process.env.ALERT_AUTO_PUBLISH;
  delete process.env.ALERT_DUTY_OFFICERS;
});

describe('persistAssessment', () => {
  test('auto-publishes a WATCH alert and leaves NO_ALERT unpublished', async () => {
    const store = memoryStore();
    const watch = await persistAssessment(assessmentFor({ confidence: 0.5 }), {
      store, policy, now: NOW,
    });
    expect(watch.action).toBe('created-and-published');
    expect(watch.state).toBe('PUBLISHED');

    const calm = await persistAssessment(assessmentFor({
      district_id: 20, district_name: 'Khulna',
      confidence: 0.1, severity_score: 0.1, model_severity: 0.1, physics_severity: 0.1,
    }), { store, policy, now: NOW });
    expect(calm.state).toBe('DRAFT');
    expect(calm.action).toBe('created');
  });

  test('queues a WARNING for review instead of publishing it (§1.6)', async () => {
    const store = memoryStore();
    const result = await persistAssessment(assessmentFor({
      confidence: 0.8, confidence_kind: 'calibrated_probability',
      model_severity: 0.8, physics_severity: 0.8,
    }), { store, policy, now: NOW });
    expect(result.state).toBe('PENDING_REVIEW');
    expect(result.action).toBe('created-pending-review');
    const stored = alertFromDocument(store.docs.get(result.id));
    expect(stored.requires_human_review).toBe(true);
    expect(stored.history[0].reason).toMatch(/requires a named duty officer/);
  });

  test('re-running with the same forecast and level changes nothing', async () => {
    const store = memoryStore();
    await persistAssessment(assessmentFor(), { store, policy, now: NOW });
    const again = await persistAssessment(assessmentFor(), { store, policy, now: NOW });
    expect(again.action).toBe('unchanged');
    expect(store.docs.size).toBe(1);
    expect(alertFromDocument(store.docs.get(again.id)).history).toHaveLength(1);
  });

  test('re-forecasting the same target supersedes the previous issue, keeping its history', async () => {
    const store = memoryStore();
    const first = await persistAssessment(assessmentFor(), { store, policy, now: NOW });
    const newer = await persistAssessment(assessmentFor({ prediction_date: '2026-09-17' }), {
      store, policy, now: NOW,
    });
    expect(newer.action).toBe('superseded-and-created-published');
    expect(newer.id).not.toBe(first.id);
    expect(store.docs.size).toBe(2);
    const old = alertFromDocument(store.docs.get(first.id));
    expect(old.state).toBe('SUPERSEDED');
    expect(old.superseded_by).toMatch(/replaced by the 2026-09-17 issue of the same alert/);
    // The superseded issue keeps its own audit trail — that is the eval-label history.
    expect(old.history.some((entry) => entry.to === 'SUPERSEDED')).toBe(true);
    expect(alertFromDocument(store.docs.get(newer.id)).state).toBe('PUBLISHED');
  });

  test('re-scoring the same issue in place records the change, and escalation pulls it back', async () => {
    const store = memoryStore();
    const calm = await persistAssessment(assessmentFor({ severity_score: 0.56, confidence: 0.5 }), {
      store, policy, now: NOW,
    });
    expect(calm.state).toBe('PUBLISHED');

    // Same issue (same prediction date), now scoring as a WARNING.
    const escalated = await persistAssessment(assessmentFor({
      severity_score: 0.9, confidence: 0.8, confidence_kind: 'calibrated_probability',
      model_severity: 0.8, physics_severity: 0.8,
    }), { store, policy, now: NOW });
    expect(escalated.action).toBe('escalated-for-review');
    expect(escalated.state).toBe('PENDING_REVIEW');
    const stored = alertFromDocument(store.docs.get(escalated.id));
    const events = store.docs.get(escalated.id).events;
    expect(events.some((event) => event.action === 'reassessed'
      && event.previous_level === 'WATCH' && event.level === 'WARNING')).toBe(true);
    expect(stored.history.at(-1).to).toBe('PENDING_REVIEW');
    expect(stored.history.at(-1).reason).toMatch(/requires a named duty officer/);
  });

  test('a different target date is a separate alert lineage, not an overwrite', async () => {
    const store = memoryStore();
    await persistAssessment(assessmentFor(), { store, policy, now: NOW });
    const later = await persistAssessment(assessmentFor({
      prediction_date: '2026-09-17', target_date: '2026-09-24',
    }), { store, policy, now: NOW });
    expect(later.action).not.toContain('superseded');
    expect(store.docs.size).toBe(2);
    expect(alertFromDocument(store.docs.get(alertIdFor(assessmentFor()))).state).toBe('PUBLISHED');
  });

  test('the auto-publish window holds repeated publications', async () => {
    process.env.ALERT_AUTO_PUBLISH_MINUTES = '720';
    const store = memoryStore();
    const first = await persistAssessment(assessmentFor(), {
      store, policy, now: NOW, lastAutoPublishAt: null,
    });
    expect(first.state).toBe('PUBLISHED');
    const second = await persistAssessment(assessmentFor({
      district_id: 20, district_name: 'Khulna',
    }), { store, policy, now: NOW, lastAutoPublishAt: NOW.toISOString() });
    expect(second.action).toContain('held-for-window');
    expect(second.state).toBe('DRAFT');
  });

  test('an unpublishable row is recorded with the §1.6 reason, not silently held', async () => {
    const store = memoryStore();
    const result = await persistAssessment(assessmentFor({ model_version: undefined }), {
      store, policy, now: NOW,
    });
    expect(result.action).toBe('created-publication-blocked');
    expect(result.state).toBe('DRAFT');
    expect(result.publication_blocked_reason).toMatch(/model version/);
    const stored = alertFromDocument(store.docs.get(result.id));
    expect(store.docs.get(result.id).events.at(-1).action).toBe('publication_blocked');
  });

  test('auto-publication can be switched off entirely', async () => {
    const store = memoryStore();
    const result = await persistAssessment(assessmentFor(), {
      store, policy, now: NOW, autoPublish: false,
    });
    expect(result.state).toBe('DRAFT');
    expect(result.action).toBe('created');
  });
});

describe('reviewAlert (§1.6 human in the loop)', () => {
  const queueWarning = async (store, over = {}) => {
    const result = await persistAssessment(assessmentFor({
      confidence: 0.8, confidence_kind: 'calibrated_probability',
      model_severity: 0.8, physics_severity: 0.8, ...over,
    }), { store, policy, now: NOW });
    return result.id;
  };

  test('refuses a reviewer who is not a duty officer', async () => {
    const store = memoryStore();
    const id = await queueWarning(store);
    const result = await reviewAlert({
      id, action: 'approve', user: { id: 'walk-in', email: 'nobody@example.org' },
      store, policy, now: NOW, env: {},
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(403);
    expect(result.error).toMatch(/only a duty officer/);
  });

  test('an unauthenticated caller cannot approve or reject', async () => {
    const store = memoryStore();
    const id = await queueWarning(store);
    expect((await reviewAlert({ id, action: 'approve', user: null, store, policy, now: NOW })).code)
      .toBe(401);
    expect((await reviewAlert({ id, action: 'reject', user: null, store, policy, now: NOW })).code)
      .toBe(401);
  });

  test('a duty officer approves and the §1.6 audit fields are stored', async () => {
    const store = memoryStore();
    const id = await queueWarning(store);
    const notify = jest.fn(async () => ({ sent: 2 }));
    const result = await reviewAlert({
      id,
      action: 'approve',
      user: { id: 'officer-1', email: 'officer@example.org', role: 'user' },
      reason: 'cross-checked against the FFWC bulletin',
      store, policy, now: NOW,
      env: { ALERT_DUTY_OFFICERS: 'officer-1' },
      notify,
    });
    expect(result.ok).toBe(true);
    expect(result.state).toBe('PUBLISHED');
    expect(result.published).toMatchObject({
      mode: 'human',
      model_version: '2.1.9+model.d7b1a5b48aa6',
      data_cutoff: '2026-09-16T00:00:00.000Z',
    });
    expect(result.published.reviewer).toMatchObject({
      id: 'officer-1', email: 'officer@example.org', verified_via: 'firebase',
    });
    expect(result.published.evidence_snapshot.level).toBe('WARNING');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(result.notification).toEqual({ sent: 2 });

    const stored = alertFromDocument(store.docs.get(id));
    expect(stored.state).toBe('PUBLISHED');
    expect(stored.published.reviewer).toBe('officer-1');
    expect(stored.history.at(-1).reason).toBe('cross-checked against the FFWC bulletin');
    expect(stored.has_review_history).toBe(true);
  });

  test('a rejection needs a reason, and the reason becomes an eval label', async () => {
    const store = memoryStore();
    const id = await queueWarning(store);
    const env = { ALERT_DUTY_OFFICERS: 'officer-1' };
    const user = { id: 'officer-1', email: 'officer@example.org' };

    const noReason = await reviewAlert({ id, action: 'reject', user, reason: '', store, policy, now: NOW, env });
    expect(noReason.ok).toBe(false);
    expect(noReason.code).toBe(422);
    expect(noReason.error).toMatch(/rejection reason/);

    const rejected = await reviewAlert({
      id, action: 'reject', user, reason: 'no rainfall in the last 72 h', store, policy, now: NOW, env,
    });
    expect(rejected.ok).toBe(true);
    expect(rejected.state).toBe('REJECTED');
    const stored = alertFromDocument(store.docs.get(id));
    expect(stored.review.reason).toBe('no rainfall in the last 72 h');
    expect(stored.last_rejection.reviewer).toBe('officer-1');
    const raw = store.docs.get(id);
    expect(raw.rejections[0].label).toMatchObject({
      decision: 'rejected',
      level: 'WARNING',
      hazard_type: 'Flood',
      district_id: 19,
      reason: 'no rainfall in the last 72 h',
    });
  });

  test('publication is refused when a §1.6 field is missing from the record', async () => {
    const store = memoryStore();
    const assessment = { ...assessmentFor({ confidence: 0.8 }), provenance: {} };
    const document = buildAlertDocument(assessment, { policy, now: NOW });
    await store.putDocument({ ...document, state: 'PENDING_REVIEW' });
    const result = await reviewAlert({
      id: document.id, action: 'approve',
      user: { id: 'officer-1', email: 'o@example.org', role: 'admin' },
      store, policy, now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(422);
    expect(result.error).toMatch(/model version/);
    expect(store.docs.get(document.id).state).toBe('PENDING_REVIEW');
  });

  test('an unknown alert id is a 404 and the meta document is not reachable', async () => {
    const store = memoryStore();
    expect((await reviewAlert({ id: 'nope', action: 'approve', user: { id: 'u' }, store, policy, now: NOW })).code)
      .toBe(404);
    expect((await reviewAlert({ id: '_meta', action: 'approve', user: { id: 'u' }, store, policy, now: NOW })).code)
      .toBe(404);
  });

  test('an api-key caller must attest a named reviewer', async () => {
    const store = memoryStore();
    const id = await queueWarning(store);
    const attributed = await reviewAlert({
      id, action: 'approve',
      user: { id: 'duty-desk', email: 'duty@example.org', role: 'duty_officer' },
      authVia: 'api-key', store, policy, now: NOW, env: {},
    });
    expect(attributed.ok).toBe(true);
    expect(attributed.published.reviewer.verified_via).toBe('api-key');
  });
});

describe('runAlertEngine', () => {
  const rows = [
    row({ district_id: 19, district_name: 'Dhaka', confidence: 0.5 }),
    row({ district_id: 20, district_name: 'Khulna', severity_score: 0.2, confidence: 0.1,
      model_severity: 0.2, physics_severity: 0.2 }),
    row({ district_id: 21, district_name: 'Sylhet', hazard_type: 'Flash Flood',
      severity_score: 0.95, confidence: 0.9, model_severity: 0.95, physics_severity: 0.3 }),
  ];

  test('assesses, persists, auto-publishes and notifies in one pass', async () => {
    const store = memoryStore();
    const notify = jest.fn(async () => ({ sent: 1 }));
    const result = await runAlertEngine({
      forecastStore: forecastStore(rows), store, policy, now: NOW,
      env: { ...process.env, ALERT_AUTO_PUBLISH_MINUTES: '0' },
      notify,
    });
    expect(result.rows).toBe(3);
    expect(result.batch.counts.WATCH).toBe(2);
    expect(result.batch.counts.NO_ALERT).toBe(1);
    expect(result.persisted.created).toBe(3);
    expect(result.persisted.published).toBe(2);
    expect(result.persisted.unchanged).toBe(0);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(result.run_state.last_auto_publish_at).toBe(NOW.toISOString());
    expect(result.max_auto_publish_level).toBe('WATCH');
  });

  test('a second pass over the same rows is a no-op for the store', async () => {
    const store = memoryStore();
    await runAlertEngine({ forecastStore: forecastStore(rows), store, policy, now: NOW,
      env: { ...process.env, ALERT_AUTO_PUBLISH_MINUTES: '0' } });
    const second = await runAlertEngine({ forecastStore: forecastStore(rows), store, policy, now: NOW,
      env: { ...process.env, ALERT_AUTO_PUBLISH_MINUTES: '0' } });
    expect(second.persisted.unchanged).toBe(3);
    expect(second.persisted.created).toBe(0);
    expect(store.docs.size).toBe(4); // 3 alerts + the run-state document
  });

  test('run state survives and records the counts of the last pass', async () => {
    const store = memoryStore();
    await runAlertEngine({ forecastStore: forecastStore(rows), store, policy, now: NOW,
      env: { ...process.env, ALERT_AUTO_PUBLISH_MINUTES: '0' } });
    const state = await getAlertRunState({ store });
    expect(state.last_run_at).toBe(NOW.toISOString());
    expect(state.last_counts.WATCH).toBe(2);
    expect(state.last_policy_version).toBe(policy.version);
    const patched = await setAlertRunState({ note: 'manual' }, { store, now: NOW });
    expect(patched.note).toBe('manual');
  });

  test('rows can be supplied directly, and a preview never writes', async () => {
    const batch = previewAssessments({ rows, policy, now: NOW });
    expect(batch.kind).toBe('alert_batch');
    expect(batch.assessed).toBe(3);
    const store = memoryStore();
    await runAlertEngine({ rows, store, policy, now: NOW,
      env: { ...process.env, ALERT_AUTO_PUBLISH_MINUTES: '0' } });
    expect(store.docs.size).toBe(4);
  });
});

describe('listing', () => {
  test('excludes the run-state document and reports state counts', async () => {
    const store = memoryStore();
    await runAlertEngine({
      forecastStore: forecastStore([row({ confidence: 0.5 })]), store, policy, now: NOW,
      env: { ...process.env, ALERT_AUTO_PUBLISH_MINUTES: '0' },
    });
    const listed = await listAlerts({ store });
    expect(listed).toHaveLength(1);
    expect(listed[0].state).toBe('PUBLISHED');
    expect(stateCounts(listed)).toEqual({ PUBLISHED: 1 });
    expect(store.docs.has('_meta')).toBe(true);
  });

  test('filters by state and district', async () => {
    const store = memoryStore();
    await persistAssessment(assessmentFor({ district_id: 19 }), { store, policy, now: NOW });
    await persistAssessment(assessmentFor({ district_id: 20, district_name: 'Khulna' }), {
      store, policy, now: NOW,
    });
    expect((await listAlerts({ store, districtId: 20 }))[0].district_id).toBe(20);
    expect(await listAlerts({ store, state: 'PENDING_REVIEW' })).toHaveLength(0);
    expect(await listAlerts({ store, state: 'PUBLISHED' })).toHaveLength(2);
  });

  test('the freshness SLO decides what counts as a live alert', async () => {
    const store = memoryStore();
    await persistAssessment(assessmentFor(), { store, policy, now: NOW });
    const fresh = await listAlerts({ store, now: NOW, maxAgeHours: 48 });
    expect(fresh).toHaveLength(1);
    expect(fresh[0].freshness_at_read.within_slo).toBe(true);
    // Two weeks later the same record is history, not a live alert.
    const later = new Date('2026-10-01T00:00:00Z');
    expect(await listAlerts({ store, now: later, maxAgeHours: 48 })).toHaveLength(0);
    expect(await listAlerts({ store, now: later })).toHaveLength(1);
  });
});
