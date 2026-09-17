/**
 * @jest-environment node
 *
 * Alert API contract (PRODUCT_SPEC §1.3/§1.6/§1.7) — through the real Express app,
 * with the alert store and the forecast store swapped for in-memory doubles.
 *
 * What this file exists to prove:
 *   - §1.3: published alerts (and only those) are public, with their evidence trail.
 *   - §1.6: an alert above WATCH cannot be published without a named reviewer, a
 *     reason is required to reject, and the published record carries reviewer
 *     identity, timestamp, model version, data cutoff and the evidence snapshot.
 *   - §1.7: the disclaimer is on the list response, the CSV export and the card.
 *   - the write surfaces are fail-closed: no BACKEND_API_KEY means 503, not "allow".
 *
 * The Firebase-token branch of the reviewer check (a signed-in duty officer) is
 * covered at the logic level in `__tests__/alerts/service.test.js`; a real Firebase
 * ID token cannot be minted in this sandbox, and mocking token verification would
 * test the mock rather than the rule.
 */
const request = require('supertest');

// The alert surface reads the store through the module object, so a spy installed
// per test is what every handler sees.
// The notification leg reads subscriber documents from Firestore; the API contract
// under test here is the alert lifecycle, so the fan-out is stubbed (its own
// behaviour is covered by __tests__/alerts/notify.test.js).
jest.mock('../../backend/alerts/notify.js', () => ({
  notifyAlert: jest.fn(async () => ({ matched: 0, sent: 0, failed: 0, degraded: 0, results: [] })),
}));
jest.spyOn(require('../../backend/alerts/store.js'), 'getAlertStore');
jest.spyOn(require('../../backend/forecastStore.js'), 'getForecastStore');

const notifyModule = require('../../backend/alerts/notify.js');
const storeModule = require('../../backend/alerts/store.js');
const { alertLimiter, alertReviewLimiter } = require('../../backend/middleware/rateLimit.js');
const forecastStoreModule = require('../../backend/forecastStore.js');
const app = require('../../backend/server').default;

const KEY = 'test-pipeline-key';

const NOW = new Date('2026-09-17T06:00:00Z');

function memoryStore() {
  const docs = new Map();
  return {
    docs,
    async putDocument(doc) {
      docs.set(doc.id, doc);
      return doc;
    },
    async getDocument(id) {
      return docs.get(id) || null;
    },
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

const row = (over = {}) => ({
  district_id: 19,
  district_name: 'Dhaka',
  division: 'Dhaka',
  pcode: '3037',
  horizon: '7_days',
  hazard_type: 'Flood',
  severity_score: 0.6,
  confidence: 0.5,
  confidence_kind: 'model_softmax_top_class',
  model_severity: 0.6,
  physics_severity: 0.6,
  prediction_date: '2026-09-16',
  target_date: '2026-09-23',
  model_version: '2.1.9+model.d7b1a5b48aa6',
  dataset_version: 'ds1.0123456789abcdef',
  pipeline_version: 'v2.3.0',
  run_id: 'run-1',
  ...over,
});

const warningRow = () => row({
  district_id: 21,
  district_name: 'Sylhet',
  pcode: '3092',
  hazard_type: 'Flash Flood',
  severity_score: 0.99,
  confidence: 0.8,
  confidence_kind: 'calibrated_probability',
  model_severity: 0.8,
  physics_severity: 0.8,
});

let store;

beforeEach(() => {
  // The limiters are per-IP and shared for the whole file; a suite that runs the
  // engine a dozen times would otherwise start collecting 429s.
  for (const key of ['::ffff:127.0.0.1', '127.0.0.1', '::1']) {
    alertLimiter.resetKey(key);
    alertReviewLimiter.resetKey(key);
  }
  store = memoryStore();
  storeModule.getAlertStore.mockReturnValue(store);
  forecastStoreModule.getForecastStore.mockReturnValue({
    async getLatestForecastsByHorizon(horizon) {
      return [row(), warningRow()].filter((entry) => entry.horizon === horizon);
    },
  });
  process.env.BACKEND_API_KEY = KEY;
  process.env.ALERT_AUTO_PUBLISH_MINUTES = '0';
  delete process.env.ALERT_DUTY_OFFICERS;
  delete process.env.ALERT_ALLOW_UNCALIBRATED_WARNING;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.BULKSMSBD_API_KEY;
  delete process.env.GREENWEB_API_KEY;
  delete process.env.SMS_PROVIDER;
});

afterAll(() => {
  delete process.env.BACKEND_API_KEY;
  delete process.env.ALERT_AUTO_PUBLISH_MINUTES;
});

describe('GET /api/v1/alerts/policy', () => {
  test('is public and states the thresholds, ceiling, caveat and disclaimer', async () => {
    const res = await request(app).get('/api/v1/alerts/policy');
    expect(res.status).toBe(200);
    expect(res.body.thresholds.divergence_watch).toBe(0.3);
    expect(res.body.human_in_the_loop.max_auto_publish_level).toBe('WATCH');
    expect(res.body.calibration.calibrated_probability_required_for_warning).toBe(true);
    expect(res.body.levels).toEqual(['NO_ALERT', 'WATCH', 'WARNING', 'SEVERE']);
    expect(res.body.disclaimer).toMatch(/not an official warning service/);
    expect(res.body.transports.sms.configured).toBe(false);
    expect(res.body.transports.telegram.configured).toBe(false);
  });
});

describe('engine run (POST /api/v1/alerts/run)', () => {
  test('is fail-closed without BACKEND_API_KEY', async () => {
    delete process.env.BACKEND_API_KEY;
    const res = await request(app).post('/api/v1/alerts/run').send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/BACKEND_API_KEY missing/);
  });

  test('rejects a wrong key and accepts the configured one', async () => {
    expect((await request(app).post('/api/v1/alerts/run')
      .set('Authorization', 'Bearer nope').send({})).status).toBe(401);
    const res = await request(app).post('/api/v1/alerts/run')
      .set('Authorization', `Bearer ${KEY}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.rows).toBe(2);
    expect(res.body.max_auto_publish_level).toBe('WATCH');
    expect(res.body.persisted.published).toBe(1);      // the WATCH row
    expect(res.body.persisted.pending_review).toBe(1); // the WARNING row
    expect(res.body.batch.alerts).toBeUndefined();
    expect(res.body.batch.alerts_omitted).toBe(2);
    // Nobody is subscribed in this deployment, so the fan-out has nothing to do —
    // and says so, rather than claiming a delivery.
    expect(res.body.notifications[0]).toMatchObject({ matched: 0, sent: 0, degraded: 0 });
    expect(notifyModule.notifyAlert).toHaveBeenCalled();
  });
});

describe('GET /api/v1/alerts', () => {
  beforeEach(async () => {
    await request(app).post('/api/v1/alerts/run').set('Authorization', `Bearer ${KEY}`).send({});
  });

  test('anonymous callers see only published alerts', async () => {
    const res = await request(app).get('/api/v1/alerts');
    expect(res.status).toBe(200);
    expect(res.body.states_visible).toEqual(['PUBLISHED']);
    expect(res.body.count).toBe(1);
    expect(res.body.alerts[0].level).toBe('WATCH');
    expect(res.body.alerts[0].district_name).toBe('Dhaka');
    expect(res.body.alerts[0].evidence.model.confidence_published)
      .toBe('uncalibrated_model_softmax');
    expect(res.body.disclaimer).toMatch(/not an official warning service/);
  });

  test('the pipeline key unlocks the review queue', async () => {
    const res = await request(app).get('/api/v1/alerts?state=PENDING_REVIEW')
      .set('Authorization', `Bearer ${KEY}`);
    expect(res.status).toBe(200);
    expect(res.body.states_visible).toBe('all');
    expect(res.body.count).toBe(1);
    expect(res.body.alerts[0].level).toBe('WARNING');
    expect(res.body.alerts[0].requires_human_review).toBe(true);
    expect(res.body.alerts[0].blockers.length).toBeGreaterThan(0);
  });

  test('an unknown level or state is a 400, not an empty list', async () => {
    expect((await request(app).get('/api/v1/alerts?level=EXTREME')).status).toBe(400);
    expect((await request(app).get('/api/v1/alerts?state=MAYBE')).status).toBe(400);
  });

  test('the read surface is rate limited', async () => {
    const res = await request(app).get('/api/v1/alerts');
    // draft-7 headers: the policy advertises the window that produced the limit.
    expect(res.headers['ratelimit-policy']).toBe('60;w=60');
  });
});

describe('review (POST /api/v1/alerts/:id/review)', () => {
  const queueWarning = async () => {
    await request(app).post('/api/v1/alerts/run').set('Authorization', `Bearer ${KEY}`).send({});
    const queued = await request(app).get('/api/v1/alerts?state=PENDING_REVIEW')
      .set('Authorization', `Bearer ${KEY}`);
    return queued.body.alerts[0].id;
  };

  test('refuses an unattributed approval and a reasonless rejection', async () => {
    const id = await queueWarning();
    const noName = await request(app).post(`/api/v1/alerts/${id}/review`)
      .set('Authorization', `Bearer ${KEY}`).send({ action: 'approve' });
    expect(noName.status).toBe(422);
    expect(noName.body.error).toMatch(/named reviewer/);

    const noReason = await request(app).post(`/api/v1/alerts/${id}/review`)
      .set('Authorization', `Bearer ${KEY}`)
      .send({ action: 'reject', reviewer: { id: 'officer-1', email: 'officer@example.org' } });
    expect(noReason.status).toBe(422);
    expect(noReason.body.error).toMatch(/rejection reason/);
  });

  test('refuses an unknown action and a missing alert', async () => {
    const id = await queueWarning();
    expect((await request(app).post(`/api/v1/alerts/${id}/review`)
      .set('Authorization', `Bearer ${KEY}`).send({ action: 'shout' })).status).toBe(400);
    expect((await request(app).post('/api/v1/alerts/does-not-exist/review')
      .set('Authorization', `Bearer ${KEY}`)
      .send({ action: 'approve', reviewer: { id: 'officer-1' } })).status).toBe(404);
  });

  test('a named reviewer approves, and §1.6 fields land on the published record', async () => {
    const id = await queueWarning();
    const res = await request(app).post(`/api/v1/alerts/${id}/review`)
      .set('Authorization', `Bearer ${KEY}`)
      .send({
        action: 'approve',
        reason: 'cross-checked against the FFWC bulletin',
        reviewer: { id: 'officer-1', email: 'officer@example.org', name: 'Duty Officer' },
      });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('PUBLISHED');
    expect(res.body.level).toBe('WARNING');
    expect(res.body.published).toMatchObject({
      mode: 'human',
      model_version: '2.1.9+model.d7b1a5b48aa6',
      data_cutoff: '2026-09-16T00:00:00.000Z',
    });
    expect(res.body.published.reviewer.email).toBe('officer@example.org');
    expect(res.body.published.evidence_snapshot.level).toBe('WARNING');
    expect(res.body.notification).toBeTruthy();
  });

  test('a rejection is recorded with its reason and stays visible to the pipeline', async () => {
    const id = await queueWarning();
    const res = await request(app).post(`/api/v1/alerts/${id}/review`)
      .set('Authorization', `Bearer ${KEY}`)
      .send({
        action: 'reject',
        reason: 'no rainfall recorded in the last 72 hours',
        reviewer: { id: 'officer-1', email: 'officer@example.org' },
      });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('REJECTED');
    const listed = await request(app).get('/api/v1/alerts?state=REJECTED')
      .set('Authorization', `Bearer ${KEY}`);
    expect(listed.body.alerts[0].last_rejection.reason)
      .toBe('no rainfall recorded in the last 72 hours');
    expect(listed.body.alerts[0].review.label.decision).toBe('rejected');
  });
});

describe('public read of one alert and its evidence card', () => {
  let publishedId;
  let pendingId;

  beforeEach(async () => {
    await request(app).post('/api/v1/alerts/run').set('Authorization', `Bearer ${KEY}`).send({});
    const published = await request(app).get('/api/v1/alerts');
    publishedId = published.body.alerts[0].id;
    const queue = await request(app).get('/api/v1/alerts?state=PENDING_REVIEW')
      .set('Authorization', `Bearer ${KEY}`);
    pendingId = queue.body.alerts[0].id;
  });

  test('an unpublished alert is 403 to anonymous callers, 200 to the pipeline', async () => {
    expect((await request(app).get(`/api/v1/alerts/${pendingId}`)).status).toBe(403);
    const privileged = await request(app).get(`/api/v1/alerts/${pendingId}`)
      .set('Authorization', `Bearer ${KEY}`);
    expect(privileged.status).toBe(200);
    expect(privileged.body.history_visible).toBe(true);
  });

  test('the run-state document is never served', async () => {
    expect((await request(app).get('/api/v1/alerts/_meta')).status).toBe(404);
  });

  test('the evidence card carries the disclaimer and the review rule', async () => {
    const res = await request(app).get(`/api/v1/alerts/${publishedId}/evidence-card`);
    expect(res.status).toBe(200);
    expect(res.body.card.disclaimer).toMatch(/not an official warning service/);
    expect(res.body.card.sections.map((section) => section.id)).toContain('confidence');
    const markdown = await request(app).get(`/api/v1/alerts/${publishedId}/evidence-card?format=markdown`);
    expect(markdown.headers['content-type']).toMatch(/text\/markdown/);
    expect(markdown.text).toContain('Data cutoff');
    expect(markdown.text).toContain('not an official warning service');
  });

  test('an unpublished card is not public', async () => {
    expect((await request(app).get(`/api/v1/alerts/${pendingId}/evidence-card`)).status).toBe(403);
  });
});

describe('CSV export', () => {
  beforeEach(async () => {
    await request(app).post('/api/v1/alerts/run').set('Authorization', `Bearer ${KEY}`).send({});
  });

  test('carries the §1.7 disclaimer and only published rows for anonymous callers', async () => {
    const res = await request(app).get('/api/v1/alerts/export.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const [header, ...rows] = res.text.trim().split('\n');
    expect(header).toContain('disclaimer');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('not an official warning service');
    expect(rows[0]).toContain('999');
  });
});

describe('preview', () => {
  test('scores supplied rows without writing anything', async () => {
    const res = await request(app).post('/api/v1/alerts/preview')
      .set('Authorization', `Bearer ${KEY}`)
      .send({ rows: [row(), row({ district_id: 22, district_name: 'Rangpur' })] });
    expect(res.status).toBe(200);
    expect(res.body.batch.assessed).toBe(2);
    expect(res.body.report).toContain('# HazardNet alert report');
    expect(store.docs.size).toBe(0);
  });

  test('requires the pipeline key', async () => {
    delete process.env.BACKEND_API_KEY;
    expect((await request(app).post('/api/v1/alerts/preview').send({ rows: [] })).status).toBe(503);
  });
});

describe('transport status', () => {
  test('reports exactly what is wired up, without credentials', async () => {
    process.env.BULKSMSBD_API_KEY = 'super-secret';
    const res = await request(app).get('/api/v1/alerts/transports')
      .set('Authorization', `Bearer ${KEY}`);
    expect(res.status).toBe(200);
    expect(res.body.sms).toMatchObject({ provider: 'bulksmsbd', configured: true });
    expect(JSON.stringify(res.body)).not.toContain('super-secret');
    expect(res.body.auto_publish).toBe('enabled');
  });
});
