#!/usr/bin/env node
/**
 * Phase 5 — one-scenario monitors are single-point-of-blindness monitors.
 *
 * `site-health.yml`'s `weather_api` check probed one weather shape (single + batch GET).
 * Every endpoint with a second runtime path gets a scenario here:
 *
 *   · ANALYTICS bound vs unbound — the telemetry POST must answer 204 in both states
 *     (fail-open), and an invalid batch must still be refused 400 in both states;
 *   · cache hit vs miss — a fresh coordinate and the same coordinate again must both
 *     carry a numeric reading (a hollow cached point is the 2026-10-27 defect);
 *   · POST-only vs GET — `/api/v1/telemetry` GET is 405, POST is 204; the batch route
 *     answers both GET and POST with two complete points;
 *   · mini vs full — the full weather response must still carry a daily reading, not
 *     only the `current` block (Phase 0's shape contract).
 *
 *   node scripts/probe_runtime_paths.mjs --base-url https://www.hazardnet.live
 *   node scripts/probe_runtime_paths.mjs --base-url http://127.0.0.1:8788   # local mock
 *   node scripts/probe_runtime_paths.mjs --self-test                        # in-process healthy mock
 *   node scripts/probe_runtime_paths.mjs --self-test=broken                  # hollow points, exits 1
 *
 * No dependencies, no credentials. Exits 1 with the failing scenario and the named missing
 * field; exits 0 only when every scenario saw the value it expected. The one thing this
 * cannot do from outside is prove which *sink* accepted a telemetry event: that needs the
 * Analytics Engine SQL query in Action 12 (owner-side, Phase 6).
 */
const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
let BASE = (argValue('--base-url', process.env.SITE_URL || 'https://www.hazardnet.live')).replace(/\/$/, '');
let mockServer = null;

// `--self-test` starts a complete in-process mock, so the exact command in the PR
// description is reproducible without the live site. `--self-test=broken` makes the
// mock return hollow points (`{ id, _meta }`, no `current`) — the 2026-10-27 defect —
// and must exit 1 with `current.temperature_2m` named.
const selfTestMode = args.find((a) => a.startsWith('--self-test'));
if (selfTestMode) {
  const broken = selfTestMode === '--self-test=broken';
  const { createServer } = await import('node:http');
  mockServer = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    if (url.pathname === '/api/v1/telemetry' && req.method === 'GET') return send(405, { error: 'method not allowed' });
    if (url.pathname === '/api/v1/telemetry' && req.method === 'POST') {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      return req.on('end', () => {
        const event = JSON.parse(raw || '{}')?.events?.[0]?.event;
        return /^[a-zA-Z0-9_.:-]+$/.test(event || '') ? send(204) : send(400, { error: 'invalid event' });
      });
    }
    if (url.pathname === '/api/v1/weather' && req.method === 'GET') {
      return send(200, broken
        ? { _meta: { current_vars: 0 } }
        : { current: { temperature_2m: 31.1 }, daily: { temperature_2m_max: [36.7] }, _meta: { current_vars: 11 } });
    }
    if (url.pathname === '/api/v1/weather/batch') {
      return send(200, { count: 2, points: broken
        ? [{ id: 'dhaka' }, { id: 'chattogram' }]
        : [{ id: 'dhaka', current: { temperature_2m: 31.1 } }, { id: 'chattogram', current: { temperature_2m: 27.8 } }] });
    }
    return send(404, { error: 'not found' });
  });
  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  BASE = `http://127.0.0.1:${mockServer.address().port}`;
  console.error(`[self-test] ${broken ? 'broken' : 'healthy'} mock at ${BASE}`);
}
const SESSION = `site-health-${Date.now()}`;
const TELEMETRY_BODY = {
  sessionId: SESSION,
  events: [{ event: 'site_health_probe', at: Date.now(), properties: { phase: 5 } }],
};
const POINTS = [
  { id: 'dhaka', lat: 23.8103, lng: 90.4125 },
  { id: 'chattogram', lat: 22.3569, lng: 91.7832 },
];

const results = [];
async function scenario(name, path, init, verify) {
  const url = `${BASE}${path}`;
  try {
    const response = await fetch(url, {
      ...init,
      headers: { 'user-agent': 'HazardNet-SiteHealth/1.0', ...(init.headers || {}) },
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON is reported below */ }
    const check = verify({ status: response.status, body, text, headers: response.headers });
    results.push({ name, status: response.status, ...check });
  } catch (error) {
    results.push({ name, pass: false, status: 0, detail: `request failed: ${error.message}` });
  }
}

const numeric = (value) => typeof value === 'number' && Number.isFinite(value);
const readingsIn = (body) => Array.isArray(body?.points)
  ? body.points.filter((p) => numeric(p?.current?.temperature_2m)).length
  : 0;

// ── ANALYTICS bound vs unbound (fail-open 204 / validation 400) ────────────
await scenario('telemetry_post_204_bound_or_unbound', '/api/v1/telemetry', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(TELEMETRY_BODY),
}, ({ status }) => ({
  pass: status === 204,
  detail: status === 204
    ? '204 — the fail-open contract holds whether or not ANALYTICS is bound'
    : `expected 204 (bound/unbound both acknowledge), got ${status}`,
}));

await scenario('telemetry_post_invalid_400', '/api/v1/telemetry', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sessionId: SESSION, events: [{ event: 'Bad Name', at: Date.now() }] }),
}, ({ status }) => ({
  pass: status === 400,
  detail: status === 400
    ? '400 — validation still runs in either sink state'
    : `expected 400 for an invalid event name, got ${status}`,
}));

// ── POST-only vs GET ──────────────────────────────────────────────────────
await scenario('telemetry_get_405', '/api/v1/telemetry', { method: 'GET' }, ({ status, body }) => ({
  pass: status === 405 && body?.error === 'method not allowed',
  detail: status === 405 ? '405 — POST-only route exists' : `expected 405 method not allowed, got ${status}`,
}));

// ── cache miss vs hit ─────────────────────────────────────────────────────
const cachePath = `/api/v1/weather?lat=22.3569&lng=91.7832&mini=1&probe=${Date.now()}`;
for (const name of ['weather_cache_miss', 'weather_cache_hit']) {
  await scenario(name, cachePath, { method: 'GET' }, ({ status, body }) => ({
    pass: status === 200 && numeric(body?.current?.temperature_2m),
    detail: status === 200 && numeric(body?.current?.temperature_2m)
      ? `200 with numeric current.temperature_2m = ${body.current.temperature_2m}`
      : `expected 200 with a numeric current.temperature_2m, got ${status} (missing: current.temperature_2m)`,
    leaf: status === 200 ? body?.current?.temperature_2m : null,
  }));
}

// ── mini vs full response shape (Phase 0's second runtime path) ───────────
await scenario('weather_full_shape', '/api/v1/weather?lat=23.8103&lng=90.4125', { method: 'GET' }, ({ status, body }) => ({
  pass: status === 200 && numeric(body?.current?.temperature_2m)
    && Array.isArray(body?.daily?.temperature_2m_max) && numeric(body.daily.temperature_2m_max[0]),
  detail: status === 200 && numeric(body?.current?.temperature_2m) && numeric(body?.daily?.temperature_2m_max?.[0])
    ? `200 with current.temperature_2m = ${body.current.temperature_2m}, daily.temperature_2m_max[0] = ${body.daily.temperature_2m_max[0]}`
    : `expected the full shape with current.temperature_2m and daily.temperature_2m_max[0], got ${status} (missing: daily.temperature_2m_max[0])`,
  leaf: status === 200 ? body?.daily?.temperature_2m_max?.[0] ?? null : null,
}));

// ── batch GET vs POST ─────────────────────────────────────────────────────
await scenario('batch_get_two_points', '/api/v1/weather/batch?coords=23.8103,90.4125,dhaka%7C22.3569,91.7832,chattogram',
  { method: 'GET' }, ({ status, body }) => ({
    pass: status === 200 && body?.count === 2 && readingsIn(body) === 2,
    detail: status === 200 && body?.count === 2 && readingsIn(body) === 2
      ? `200 with count=2 and 2 numeric current.temperature_2m readings`
      : `expected count=2 with 2 numeric readings, got count=${body?.count} readings=${readingsIn(body)} (missing: current.temperature_2m)`,
  }));

await scenario('batch_post_two_points', '/api/v1/weather/batch', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ points: POINTS }),
}, ({ status, body }) => ({
  pass: status === 200 && body?.count === 2 && readingsIn(body) === 2,
  detail: status === 200 && body?.count === 2 && readingsIn(body) === 2
    ? `200 with count=2 and 2 numeric current.temperature_2m readings`
    : `expected count=2 with 2 numeric readings, got count=${body?.count} readings=${readingsIn(body)} (missing: current.temperature_2m)`,
}));

const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({
  schema: 'hazardnet-runtime-paths/v1',
  base_url: BASE,
  ran_at: new Date().toISOString(),
  scenarios: results.length,
  failed: failed.length,
  results,
  note: 'The bound/unbound sink distinction is verified by the Analytics Engine SQL query in Action 12; from the outside both states must answer 204.',
}, null, 2));
if (mockServer) mockServer.close();
if (failed.length) {
  for (const failure of failed) console.error(`::error::${failure.name}: ${failure.detail}`);
  process.exit(1);
}
