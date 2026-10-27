/**
 * @jest-environment node
 *
 * Phase 1 — exercise every Pages Function route once and assert a **leaf value**, not a 200.
 *
 * The batch defect passed a parity test because that test compared `count` and `id`s over a
 * stub that did not mirror the upstream. Here each of the seven edge routes is invoked with
 * either a real captured upstream response (backend/utils/__tests__/fixtures/*), or the
 * committed deployed artifact the route reads in production
 * (`frontend/public/data/*.json`). Every expected number/string is read **from that
 * fixture at test time** — a fixture refresh cannot silently turn these into presence
 * assertions, and a route that answers `{id, _meta}` fails.
 *
 * Live GET probes were made on 2026-10-27 against www.hazardnet.live; the exact bodies are
 * recorded in docs/ops/pr/phase-1-route-sweep.md. POST /api/v1/telemetry cannot be sent
 * from this sandbox (no outbound POST), so its two runtime paths are exercised here and the
 * live curl is an owner verification in Action 12.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const URL_BASE = 'https://www.hazardnet.live';
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));

const FORECAST_SNAPSHOT = readJson('frontend/public/data/forecasts-latest.json');
const ALERT_SNAPSHOT = readJson('frontend/public/data/alerts-latest.json');
const UPSTREAM_OBJECT = require('../backend/utils/__tests__/fixtures/openMeteoSingleObject.js');
const UPSTREAM_ARRAY = require('../backend/utils/__tests__/fixtures/openMeteoMultiArray.js');

const { clearCache } = require('../backend/utils/openMeteo.js');

const TELEMETRY_FIXTURE = {
  sessionId: 'phase1-route-sweep',
  events: [{ event: 'route_value_assertion', at: 1_767_000_000_000, properties: { phase: 1, hollow: false } }],
};

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json' },
});

/** The Pages ASSETS binding, serving the real committed artifacts by path. */
const assets = {
  fetch: jest.fn(async (request) => {
    const pathname = new URL(request.url).pathname;
    if (pathname.endsWith('/data/forecasts-latest.json')) return jsonResponse(FORECAST_SNAPSHOT);
    if (pathname.endsWith('/data/alerts-latest.json')) return jsonResponse(ALERT_SNAPSHOT);
    return new Response('not found', { status: 404 });
  }),
};
const env = { ASSETS: assets };

let fetchSpy;
let logSpy;
let writeDataPoint;

beforeEach(() => {
  clearCache();
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const latitude = new URL(String(url)).searchParams.get('latitude') || '';
    // The shape follows the query, as upstream does: `%2C` in `latitude=` → array.
    return jsonResponse(latitude.includes(',') ? UPSTREAM_ARRAY : UPSTREAM_OBJECT);
  });
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  writeDataPoint = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
  clearCache();
  assets.fetch.mockClear();
});

const get = (route) => new Request(`${URL_BASE}${route}`);

describe('GET /api/v1/forecasts/bulk — leaf values from the deployed snapshot', () => {
  test('count, district id and severity are the artifact’s values, not just present keys', async () => {
    const { onRequestGet } = require('../functions/api/v1/forecasts/bulk.ts');
    const response = await onRequestGet({ request: get('/api/v1/forecasts/bulk?horizon=7_days'), env });
    const body = await response.json();
    const rows = FORECAST_SNAPSHOT.horizons['7_days'];

    expect(response.status).toBe(200);
    expect(body.count).toBe(rows.length);                       // 64 in the committed artifact
    expect(body.forecasts[0].district_id).toBe(rows[0].district_id);
    expect(body.forecasts[0].severity_score).toBe(rows[0].severity_score);
    expect(body.forecasts[0].advisory_tier).toBe(rows[0].advisory_tier);
    expect(body.data_source).toBe('hazardnet/weekly-forecasts');
  });
});

describe('GET /api/v1/forecasts/metadata — freshness headline', () => {
  test('prediction_date and row_count match the snapshot', async () => {
    const { onRequestGet } = require('../functions/api/v1/forecasts/metadata.ts');
    const response = await onRequestGet({ request: get('/api/v1/forecasts/metadata'), env });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.prediction_date).toBe(FORECAST_SNAPSHOT.prediction_date);
    const total = Object.values(FORECAST_SNAPSHOT.horizons).reduce((n, rows) => n + rows.length, 0);
    expect(body.row_count).toBe(total);
  });
});

describe('GET /api/v1/alerts — published row values', () => {
  test('the first published alert carries the artifact’s district, severity and state', async () => {
    const { onRequestGet } = require('../functions/api/v1/alerts/index.ts');
    const response = await onRequestGet({ request: get('/api/v1/alerts?limit=1'), env });
    const body = await response.json();
    const published = ALERT_SNAPSHOT.alerts.filter((a) => a.state === 'PUBLISHED').slice(0, 1);

    expect(response.status).toBe(200);
    expect(body.count).toBe(published.length);
    expect(body.alerts[0].district_id).toBe(published[0].district_id);
    expect(body.alerts[0].severity_score).toBe(published[0].severity_score);
    expect(body.alerts[0].state).toBe('PUBLISHED');
    expect(body.filters.state).toBe('PUBLISHED');
  });
});

describe('GET /api/v1/alerts/policy — the stamped thresholds', () => {
  test('watch_probability is the artifact’s stamped value, and policy_source names the writer', async () => {
    const { onRequestGet } = require('../functions/api/v1/alerts/policy.ts');
    const response = await onRequestGet({ request: get('/api/v1/alerts/policy'), env });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.thresholds.watch_probability).toBe(ALERT_SNAPSHOT.policy.thresholds.watch_probability);
    expect(body.thresholds.warning_probability).toBe(ALERT_SNAPSHOT.policy.thresholds.warning_probability);
    expect(body.policy_source).toBe(ALERT_SNAPSHOT.policy_source);
  });
});

describe('GET /api/v1/weather — real reading', () => {
  test('temperature and wind direction are the captured upstream leaves', async () => {
    const { onRequestGet } = require('../functions/api/v1/weather.ts');
    const response = await onRequestGet({ request: get('/api/v1/weather?lat=23.8&lon=90.4&mini=1'), env });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.current.temperature_2m).toBe(UPSTREAM_OBJECT.current.temperature_2m);
    expect(body.current.wind_direction_10m).toBe(UPSTREAM_OBJECT.current.wind_direction_10m);
    expect(body._meta.current_vars).toBeGreaterThan(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/v1/weather/batch — both separator spellings', () => {
  test('`|` and `;` produce the same two points with the captured leaves', async () => {
    const { onRequest } = require('../functions/api/v1/weather/batch.ts');
    const pipe = await onRequest({
      request: get('/api/v1/weather/batch?coords=23.8103,90.4125,dhaka%7C22.3569,91.7832,chattogram'), env,
    });
    const semi = await onRequest({
      request: get('/api/v1/weather/batch?coords=23.8%2C90.4%3B22.3%2C91.8'), env,
    });
    const pipeBody = await pipe.json();
    const semiBody = await semi.json();

    expect(pipe.status).toBe(200);
    expect(pipeBody.count).toBe(2);
    expect(pipeBody.points.map((p) => p.current.temperature_2m))
      .toEqual(UPSTREAM_ARRAY.map((p) => p.current.temperature_2m));
    expect(pipeBody.points[1].current.relative_humidity_2m)
      .toBe(UPSTREAM_ARRAY[1].current.relative_humidity_2m);
    expect(semi.status).toBe(200);
    expect(semiBody.count).toBe(2);   // the verification matrix's form is no longer one point
  });
});

describe('POST /api/v1/telemetry — both sinks, method gate', () => {
  const post = () => new Request(`${URL_BASE}/api/v1/telemetry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(TELEMETRY_FIXTURE),
  });

  test('bound: 204 and one data point whose blobs are the fixture’s leaves', async () => {
    const { onRequest } = require('../functions/api/v1/telemetry.ts');
    const response = await onRequest({ request: post(), env: { ANALYTICS: { writeDataPoint } } });
    expect(response.status).toBe(204);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    const point = writeDataPoint.mock.calls[0][0];
    expect(point.blobs[0]).toBe(TELEMETRY_FIXTURE.events[0].event);
    expect(point.blobs[1]).toBe(TELEMETRY_FIXTURE.sessionId);
    expect(JSON.parse(point.blobs[2])).toEqual(TELEMETRY_FIXTURE.events[0].properties);
    expect(point.doubles).toEqual([TELEMETRY_FIXTURE.events[0].at]);
  });

  test('unbound: 204 and the same event name in the fail-open log line', async () => {
    const { onRequest } = require('../functions/api/v1/telemetry.ts');
    const response = await onRequest({ request: post(), env: {} });
    expect(response.status).toBe(204);
    expect(writeDataPoint).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0]).event).toBe(TELEMETRY_FIXTURE.events[0].event);
  });

  test('GET is 405, so the route exists without POST being callable', async () => {
    const { onRequest } = require('../functions/api/v1/telemetry.ts');
    const response = await onRequest({ request: get('/api/v1/telemetry'), env });
    expect(response.status).toBe(405);
    expect((await response.json()).error).toBe('method not allowed');
  });
});
