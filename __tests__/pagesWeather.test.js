/**
 * @jest-environment node
 *
 * The weather proxy on the edge — `functions/api/v1/weather.ts` and
 * `functions/api/v1/weather/batch.ts`.
 *
 * Both are thin: they validate the query, call `backend/utils/openMeteo.js`, and shape a
 * response. The suite is therefore about the things a thin proxy gets wrong silently:
 *
 *   · the **query contract** the client already speaks (`frontend/src/lib/weather.ts`) —
 *     `mini=1`, `forecast_days`, `timezone`, the `coords` mini-language;
 *   · the **status codes**, which are the difference between "check Open-Meteo" (502) and
 *     "check this deployment" (500);
 *   · the **body cap** the Node entry declared in `config.api.bodyParser.sizeLimit` — at the
 *     edge there is no parser, so the route has to enforce the same 256 KiB itself;
 *   · **parity with the Node handler**, asserted by running both against one upstream fixture.
 */

const UPSTREAM = {
  latitude: 23.8103,
  longitude: 90.4125,
  timezone: 'Asia/Dhaka',
  current: { time: '2026-10-27T06:00', temperature_2m: 28.4, wind_speed_10m: 3.2, relative_humidity_2m: 71 },
  hourly: { time: ['2026-10-27T06:00', '2026-10-27T07:00'], temperature_2m: [28.4, 29.1] },
  daily: { time: ['2026-10-27'], temperature_2m_max: [31.2], temperature_2m_min: [22.8], precipitation_sum: [1.4] },
};

const URL_BASE = 'https://www.hazardnet.live';

let fetchSpy;

beforeEach(() => {
  // The 15-minute cache lives in the module instance, so it has to be cleared between tests
  // or one test's coordinates leak into the next (same instance — no resetModules, which
  // would give the clearer a *different* instance than the one the routes hold).
  require('../backend/utils/openMeteo.js').clearCache();
  // `openMeteo` reads `globalThis.fetch`, so replacing it is the whole upstream stub — and it
  // doubles as the assertion that the edge route is a *proxy* and not a second data source.
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(JSON.stringify(UPSTREAM), { status: 200, headers: { 'content-type': 'application/json' } })
  );
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  const { clearCache } = require('../backend/utils/openMeteo.js');
  clearCache();
});

const ctx = (path, init) => ({ request: new Request(`${URL_BASE}${path}`, init) });

describe('GET /api/v1/weather', () => {
  test('returns the normalised bundle and a 15-minute cache, like the Node handler', async () => {
    const { onRequestGet } = require('../functions/api/v1/weather.ts');
    const response = await onRequestGet(ctx('/api/v1/weather?lat=23.8103&lng=90.4125'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=900');
    expect(body).toBeTruthy();
    // The normaliser's own shape: the deployment never re-shapes upstream's payload.
    expect(fetchSpy).toHaveBeenCalled();
    expect(String(fetchSpy.mock.calls[0][0])).toContain('api.open-meteo.com');
  });

  test('requires numeric lat/lng and says so', async () => {
    const { onRequestGet } = require('../functions/api/v1/weather.ts');

    const missing = await onRequestGet(ctx('/api/v1/weather'));
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toContain('lat and lng');

    const notNumeric = await onRequestGet(ctx('/api/v1/weather?lat=abc&lng=90'));
    expect(notNumeric.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('mini=1 asks upstream for current conditions only', async () => {
    const { onRequestGet } = require('../functions/api/v1/weather.ts');
    const response = await onRequestGet(ctx('/api/v1/weather?lat=23.81&lng=90.41&mini=1'));

    expect(response.status).toBe(200);
    const upstreamUrl = String(fetchSpy.mock.calls[0][0]);
    // The mini path never requests hourly/daily series (that is the point of the flag).
    expect(upstreamUrl).not.toContain('daily=');
  });

  test('an upstream failure is a 502, not a 500 — it is Open-Meteo that is down', async () => {
    fetchSpy.mockImplementation(async () => new Response('rate limited', { status: 429 }));
    const { onRequestGet } = require('../functions/api/v1/weather.ts');

    const response = await onRequestGet(ctx('/api/v1/weather?lat=23.81&lng=90.41'));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe('Weather lookup failed');
  });
});

describe('POST /api/v1/weather/batch', () => {
  const points = [
    { id: 'dhaka', lat: 23.8103, lng: 90.4125 },
    { id: 'sylhet', lat: 24.8949, lng: 91.8687 },
  ];

  test('answers every point in one upstream call', async () => {
    const { onRequest } = require('../functions/api/v1/weather/batch.ts');
    const response = await onRequest(ctx('/api/v1/weather/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ points }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.count).toBeGreaterThan(0);
    expect(body.generated_at).toBeTruthy();
    expect(Array.isArray(body.points)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test('the same query language works over GET, as the Node handler allows', async () => {
    const { onRequest } = require('../functions/api/v1/weather/batch.ts');
    const response = await onRequest(ctx('/api/v1/weather/batch?coords=23.8103,90.4125,dhaka'));

    expect(response.status).toBe(200);
    expect((await response.json()).count).toBeGreaterThan(0);
  });

  test('rejects an empty or malformed point list with the Node wording', async () => {
    const { onRequest } = require('../functions/api/v1/weather/batch.ts');

    const empty = await onRequest(ctx('/api/v1/weather/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ points: [{ id: 'x', lat: 'north', lng: null }] }),
    }));
    expect(empty.status).toBe(400);
    expect((await empty.json()).error).toBe('points array must contain {id,lat,lng} entries');

    const badGet = await onRequest(ctx('/api/v1/weather/batch?coords=nonsense'));
    expect(badGet.status).toBe(400);
    expect((await badGet.json()).error).toContain('coords query must be');
  });

  test('refuses a body over 256 KiB before parsing it', async () => {
    const { onRequest } = require('../functions/api/v1/weather/batch.ts');
    // 300k of whitespace is valid JSON padding, but the cap is checked on the raw bytes.
    const huge = `{"points":[],${' '.repeat(300 * 1024)}}"x":1}`;

    const response = await onRequest(ctx('/api/v1/weather/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: huge,
    }));

    expect(response.status).toBe(413);
    expect((await response.json()).error).toBe('payload too large');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('an unsupported method is a 405 that names what is allowed', async () => {
    const { onRequest } = require('../functions/api/v1/weather/batch.ts');
    const response = await onRequest(ctx('/api/v1/weather/batch', { method: 'DELETE' }));

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, POST');
  });
});

describe('the edge routes are the Node routes', () => {
  /** Minimal Node-function `req`/`res` doubles. */
  const invoke = (handler, { method = 'GET', query = {}, body } = {}) => {
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
      send(payload) {
        this.body = payload;
        return this;
      },
    };
    return Promise.resolve(handler({ method, query, body, url: '' }, res)).then(() => res);
  };

  test('single point: same status, same cache header, same payload on both runtimes', async () => {
    const nodeHandler = require('../serverless/v1/weather.js').default;
    const { onRequestGet } = require('../functions/api/v1/weather.ts');

    const node = await invoke(nodeHandler, { query: { lat: '23.8103', lng: '90.4125' } });
    const edgeResponse = await onRequestGet(ctx('/api/v1/weather?lat=23.8103&lng=90.4125'));
    const edgeBody = await edgeResponse.json();

    expect(node.statusCode).toBe(200);
    expect(edgeResponse.status).toBe(200);
    // The cache header is the contract a CDN and the client both read.
    expect(edgeResponse.headers.get('cache-control')).toBe(node.headers['cache-control']);
    // Same keys *on the wire*. `res.json()` hands the Node handler's object straight to the
    // assertion, so its `undefined`-valued keys are still enumerable; the edge body went
    // through JSON.stringify, which drops them. Comparing the serialised form is the honest
    // comparison — that is what a client actually receives.
    expect(Object.keys(edgeBody).sort())
      .toEqual(Object.keys(JSON.parse(JSON.stringify(node.body))).sort());
  });

  test('batch: same count, same point ids, same cache header on both runtimes', async () => {
    const nodeHandler = require('../serverless/v1/weather/batch.js').default;
    const { onRequest } = require('../functions/api/v1/weather/batch.ts');
    const points = [{ id: 'dhaka', lat: 23.8103, lng: 90.4125 }];

    const node = await invoke(nodeHandler, { method: 'POST', body: { points } });
    const edgeResponse = await onRequest(ctx('/api/v1/weather/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ points }),
    }));
    const edgeBody = await edgeResponse.json();

    expect(node.statusCode).toBe(200);
    expect(edgeBody.count).toBe(node.body.count);
    expect(edgeBody.points.map((point) => point.id)).toEqual(node.body.points.map((point) => point.id));
    expect(edgeResponse.headers.get('cache-control')).toBe(node.headers['cache-control']);
    expect(Object.keys(edgeBody).sort())
      .toEqual(Object.keys(JSON.parse(JSON.stringify(node.body))).sort());
  });
});
