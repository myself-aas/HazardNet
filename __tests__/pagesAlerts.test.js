/**
 * @jest-environment node
 *
 * The alerts API on the edge — `functions/api/v1/alerts/{index,policy}.ts`.
 *
 * The site's front door calls `/api/v1/alerts` first (`ALERTS_API_URL` in
 * `frontend/src/lib/alerts.ts`) and falls back to `/data/alerts-latest.json`. Until
 * 2026-10-26 both calls 404'd, so every visitor took the fallback. This suite is what
 * makes the edge answer *the same list the Node runtime would* — not "a list from the
 * same file", which is a weaker claim and the one that lets filtering drift.
 *
 * The parity assertions run both handlers over the same stored documents:
 *   · Node — `serverless/v1/alerts/index.js`, through its real store double and its own
 *     `getPolicy()` from `process.env`;
 *   · edge — the Pages Function, through an `ASSETS` binding serving an artifact built by
 *     the real builder (`scripts/build_alert_snapshot.mjs`), so the stamped policy is the
 *     one a nightly run would produce.
 *
 * The one intended difference is named in the test that asserts it: the Node handler adds
 * `freshness_at_read` per row (a read-time SLO annotation computed from the store). The
 * artifact's rows carry their own `freshness` block instead.
 */

import { buildSnapshot } from '../scripts/build_alert_snapshot.mjs';
import { alertFromDocument } from '../backend/alerts/store.js';
import { ALERT_STATES } from '../backend/alerts/lifecycle.js';
import { ALERT_LEVELS } from '../backend/alerts/policy.js';

jest.mock('../backend/alerts/store.js', () => ({
  ...jest.requireActual('../backend/alerts/store.js'),
  getAlertStore: jest.fn(),
}));

jest.mock('../backend/utils/alertAuth.js', () => ({
  authenticateAlertRequest: jest.fn(async () => ({
    privileged: false,
    user: null,
    apiKey: { ok: false },
    dutyOfficer: false,
  })),
}));

const storeModule = require('../backend/alerts/store.js');
const nodeListHandler = require('../serverless/v1/alerts/index.js').default;
const nodePolicyHandler = require('../serverless/v1/alerts/policy.js').default;
const edgeList = require('../functions/api/v1/alerts/index.ts');
const edgePolicy = require('../functions/api/v1/alerts/policy.ts');

const URL_BASE = 'https://www.hazardnet.live';
const AT = '2026-10-24T06:00:00.000Z';

/** A stored alert document, shaped as the engine persists it. */
function document({
  id,
  level = 'WATCH',
  state = 'PUBLISHED',
  horizon = '7_days',
  districtId = 19,
  actor = 'alert-pipeline',
} = {}) {
  const events = [{ type: 'created', at: AT, level }];
  if (state === 'PUBLISHED') {
    events.push({
      type: 'transition',
      from: 'PENDING_REVIEW',
      to: 'PUBLISHED',
      at: AT,
      actor,
      level,
      model_version: '2.1.9+model.d7b1a5b48aa6',
    });
  }
  if (state === 'REJECTED') {
    events.push({
      type: 'transition',
      from: 'PENDING_REVIEW',
      to: 'REJECTED',
      at: AT,
      actor,
      level,
      rejection_reason: 'duplicate of an existing alert',
    });
  }
  return {
    id,
    alert_key: id,
    state,
    level,
    horizon,
    district_id: districtId,
    district_name: `District ${districtId}`,
    division: 'Dhaka',
    hazard_type: 'Flood',
    severity_score: 0.6,
    confidence: 0.8,
    confidence_kind: 'model_softmax_top_class',
    prediction_date: '2026-10-24',
    target_date: '2026-10-31',
    generated_at: AT,
    disclaimer: null,
    events,
  };
}

const DOCUMENTS = [
  document({ id: 'alert-a', districtId: 19 }),
  document({ id: 'alert-b', districtId: 21, level: 'WARNING' }),
  document({ id: 'alert-c', districtId: 30, horizon: '15_days' }),
  document({ id: 'alert-d', districtId: 19, horizon: '15_days', level: 'SEVERE' }),
  // Never public: operational states an anonymous caller must not see.
  document({ id: 'alert-draft', state: 'DRAFT', districtId: 40 }),
  document({ id: 'alert-rejected', state: 'REJECTED', districtId: 45 }),
];

function installStore() {
  storeModule.getAlertStore.mockReturnValue({
    async listDocuments({ state, level, horizon, districtId, max = 200 } = {}) {
      return DOCUMENTS
        .filter((doc) => (state ? doc.state === state : true))
        .filter((doc) => (level ? doc.level === level : true))
        .filter((doc) => (horizon ? doc.horizon === horizon : true))
        .filter((doc) => (districtId !== undefined && districtId !== null
          ? Number(doc.district_id) === Number(districtId) : true))
        .slice(0, max);
    },
  });
}

/** The artifact a nightly run would ship: PUBLISHED rows only, policy stamped. */
function artifact({ extraRows = [] } = {}) {
  const rows = DOCUMENTS
    .filter((doc) => doc.state === 'PUBLISHED')
    .map((doc) => alertFromDocument(doc));
  return buildSnapshot({ alerts: [...rows, ...extraRows] }, { generatedAt: AT, env: process.env });
}

function edgeContext(path, { snapshot = artifact(), assetResponse, env = {} } = {}) {
  const assets = {
    fetch: jest.fn(async () => {
      if (assetResponse) return assetResponse;
      return new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  };
  return { request: new Request(`${URL_BASE}${path}`), env: { ASSETS: assets, ...env }, assets };
}

/** Minimal Node-function `res` double. */
function invoke(handler, { path = '/api/v1/alerts', method = 'GET' } = {}) {
  const url = new URL(`${URL_BASE}${path}`);
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  const query = Object.fromEntries(url.searchParams.entries());
  return Promise.resolve(handler({ method, query, headers: {}, url: `${path}` }, res)).then(() => res);
}

beforeEach(() => {
  installStore();
  for (const name of [
    'ALERT_WATCH_PROBABILITY', 'ALERT_WARNING_PROBABILITY', 'ALERT_WATCH_SEVERITY',
    'ALERT_DIVERGENCE_WATCH', 'ALERT_AGREEMENT_EPSILON', 'ALERT_MAX_AUTO_PUBLISH_LEVEL',
    'ALERT_ALLOW_UNCALIBRATED_WARNING', 'SMS_PROVIDER', 'BULKSMSBD_API_KEY',
    'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALERT_CHAT_ID', 'TELEGRAM_CHAT_ID',
  ]) delete process.env[name];
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/v1/alerts — the edge list is the Node list', () => {
  test('serves the same ids, in the same order, with the same envelope', async () => {
    const node = await invoke(nodeListHandler);
    const edge = await edgeList.onRequestGet(edgeContext('/api/v1/alerts'));
    const body = await edge.json();

    expect(node.statusCode).toBe(200);
    expect(edge.status).toBe(200);

    expect(body.alerts.map((alert) => alert.id))
      .toEqual(node.body.alerts.map((alert) => alert.id));
    expect(body.count).toBe(node.body.count);
    expect(body.counts).toEqual(node.body.counts);
    expect(body.state_counts).toEqual(node.body.state_counts);
    expect(body.states_visible).toEqual(node.body.states_visible);
    expect(body.policy_version).toBe(node.body.policy_version);
    expect(body.max_auto_publish_level).toBe(node.body.max_auto_publish_level);
    expect(body.disclaimer).toBe(node.body.disclaimer);
    expect(body.filters).toEqual(node.body.filters);
    expect(Object.keys(body).sort()).toEqual(Object.keys(node.body).sort());
  });

  test('never serves a non-published state, even when the artifact contains one', async () => {
    // A buggy or older builder: the row is in the file. The route must still drop it.
    const leaked = { ...artifact(), alerts: [
      ...artifact().alerts,
      { id: 'leak', state: 'DRAFT', level: 'SEVERE', district_id: 99, history: [] },
    ] };
    const response = await edgeList.onRequestGet(edgeContext('/api/v1/alerts', { snapshot: leaked }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.alerts.map((alert) => alert.id)).not.toContain('leak');
    expect(body.state_counts).toEqual({ PUBLISHED: body.alerts.length });
  });

  test('a known state an anonymous caller may not see is narrowed, not rejected', async () => {
    const node = await invoke(nodeListHandler, { path: '/api/v1/alerts?state=DRAFT' });
    const edge = await edgeList.onRequestGet(edgeContext('/api/v1/alerts?state=DRAFT'));
    const body = await edge.json();

    // Node: 200, PUBLISHED rows, and `filters.state` echoing what was *served* (PUBLISHED),
    // not what was asked for. The edge has to echo the same thing or a client caching on
    // `filters` would think it received a DRAFT list.
    expect(node.statusCode).toBe(200);
    expect(node.body.alerts.every((alert) => alert.state === 'PUBLISHED')).toBe(true);
    expect(node.body.filters.state).toBe('PUBLISHED');

    expect(edge.status).toBe(200);
    expect(body.alerts.every((alert) => alert.state === 'PUBLISHED')).toBe(true);
    expect(body.filters.state).toBe('PUBLISHED');
    expect(body.alerts.map((alert) => alert.id)).toEqual(node.body.alerts.map((alert) => alert.id));
  });

  test('an unknown state or level is a 400 on both runtimes, with the same message', async () => {
    const nodeState = await invoke(nodeListHandler, { path: '/api/v1/alerts?state=NOT_A_STATE' });
    const edgeState = await edgeList.onRequestGet(edgeContext('/api/v1/alerts?state=NOT_A_STATE'));
    expect(edgeState.status).toBe(400);
    expect((await edgeState.json()).error).toBe(nodeState.body.error);

    const nodeLevel = await invoke(nodeListHandler, { path: '/api/v1/alerts?level=APOCALYPSE' });
    const edgeLevel = await edgeList.onRequestGet(edgeContext('/api/v1/alerts?level=APOCALYPSE'));
    expect(edgeLevel.status).toBe(400);
    expect((await edgeLevel.json()).error).toBe(nodeLevel.body.error);
  });

  test('every filter narrows the same rows on both runtimes', async () => {
    for (const query of [
      '/api/v1/alerts?level=WARNING',
      '/api/v1/alerts?horizon=15_days',
      '/api/v1/alerts?district_id=19',
      '/api/v1/alerts?limit=1',
    ]) {
      const node = await invoke(nodeListHandler, { path: query });
      const body = await (await edgeList.onRequestGet(edgeContext(query))).json();
      expect({ query, ids: body.alerts.map((alert) => alert.id) })
        .toEqual({ query, ids: node.body.alerts.map((alert) => alert.id) });
    }
  });

  test('applies the reviewer-contact redaction, exactly like the Node view', async () => {
    const withReviewer = artifact({
      extraRows: [{
        id: 'alert-human',
        state: 'PUBLISHED',
        level: 'WARNING',
        district_id: 55,
        history: [],
        published: { at: AT, level: 'WARNING', reviewer: 'duty@example.org', mode: 'human' },
      }],
    });
    const response = await edgeList.onRequestGet(edgeContext('/api/v1/alerts', { snapshot: withReviewer }));
    const body = await response.json();

    const published = body.alerts.find((alert) => alert.id === 'alert-human').published;
    expect(published.reviewer).toBe('reviewer (contact redacted)');
    expect(published.contact_redacted).toBe('reviewer email is available to duty officers only');
    expect(JSON.stringify(body)).not.toContain('duty@example.org');
  });

  test('the one documented divergence: no read-time freshness_at_read on the edge', async () => {
    const node = await invoke(nodeListHandler);
    const body = await (await edgeList.onRequestGet(edgeContext('/api/v1/alerts'))).json();

    expect(node.body.alerts[0]).toHaveProperty('freshness_at_read');
    expect(body.alerts[0]).not.toHaveProperty('freshness_at_read');
    // Everything the client actually reads is still there.
    for (const key of ['id', 'state', 'level', 'district_id', 'hazard_type', 'published']) {
      expect(body.alerts[0]).toHaveProperty(key);
    }
  });

  test('answers 503 with a named reason when the artifact is unusable', async () => {
    const missing = await edgeList.onRequestGet(
      edgeContext('/api/v1/alerts', { assetResponse: new Response('', { status: 404 }) })
    );
    expect(missing.status).toBe(503);
    expect((await missing.json()).detail).toContain('404');

    const wrongShape = await edgeList.onRequestGet(
      edgeContext('/api/v1/alerts', { snapshot: { schema: 'nope' } })
    );
    expect(wrongShape.status).toBe(503);
    expect((await wrongShape.json()).detail).toContain('alerts');

    const noBinding = await edgeList.onRequestGet({ request: new Request(`${URL_BASE}/api/v1/alerts`), env: {} });
    expect(noBinding.status).toBe(503);
    expect((await noBinding.json()).detail).toContain('ASSETS binding');
  });

  test('caches for 60 s, like the Node handler\'s anonymous branch', async () => {
    const response = await edgeList.onRequestGet(edgeContext('/api/v1/alerts'));
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
  });
});

describe('GET /api/v1/alerts/policy — served from the stamped artifact', () => {
  test('reports the same policy the Node runtime computes, plus its provenance', async () => {
    const node = await invoke(nodePolicyHandler, { path: '/api/v1/alerts/policy' });
    const edge = await edgePolicy.onRequestGet(edgeContext('/api/v1/alerts/policy'));
    const body = await edge.json();

    expect(node.statusCode).toBe(200);
    expect(edge.status).toBe(200);

    // Every field the Node runtime serves, by value.
    for (const key of Object.keys(node.body)) {
      expect({ key, value: body[key] }).toEqual({ key, value: node.body[key] });
    }
    // The single addition, pinned so it cannot grow into a divergence.
    const extra = Object.keys(body).filter((key) => !(key in node.body));
    expect(extra).toEqual(['policy_source']);
    expect(body.policy_source).toBe('builder');
  });

  test('carries the thresholds, the §1.6 ceiling and the §1.7 disclaimer', async () => {
    const body = await (await edgePolicy.onRequestGet(edgeContext('/api/v1/alerts/policy'))).json();

    expect(body.thresholds.watch_probability).toBe(0.4);
    expect(body.thresholds.watch_severity).toBe(0.4);
    expect(body.human_in_the_loop.max_auto_publish_level).toBe('WATCH');
    expect(body.calibration.calibrated_probability_required_for_warning).toBe(true);
    expect(body.disclaimer).toContain('not an official warning service');
    expect(body.levels).toEqual(ALERT_LEVELS);
    expect(body.states).toEqual(ALERT_STATES);
    expect(body.transports.sms.provider).toBe('none');
    expect(body.transports.telegram.configured).toBe(false);
  });

  test('answers 503 rather than inventing thresholds when the artifact has no policy', async () => {
    const bare = { schema: 'hazardnet-alerts/v1', alerts: [] };
    const response = await edgePolicy.onRequestGet(edgeContext('/api/v1/alerts/policy', { snapshot: bare }));

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain('no policy block');
    expect(body.thresholds).toBeUndefined();
  });

  test('never carries secret material, only what the endpoint publishes', async () => {
    process.env.BULKSMSBD_API_KEY = 'sms-secret-value';
    process.env.TELEGRAM_BOT_TOKEN = 'telegram-secret-value';
    const body = await (await edgePolicy.onRequestGet(
      edgeContext('/api/v1/alerts/policy', { snapshot: artifact() })
    )).json();

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('sms-secret-value');
    expect(serialized).not.toContain('telegram-secret-value');
    expect(body.transports.sms).not.toHaveProperty('api_key');
    expect(body.transports.telegram).toEqual({ channel: 'telegram', configured: false });
  });
});
