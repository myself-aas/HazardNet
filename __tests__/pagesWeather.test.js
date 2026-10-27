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

/**
 * Phase 3: the stubs are **committed fixtures captured from the real upstream**, not
 * hand-written approximations. Each carries the provenance header
 * `__tests__/testQuality.test.js` requires, and every expected leaf below is read from the
 * fixture at assertion time — a fixture refresh cannot turn these back into presence tests.
 *
 * `UPSTREAM` is the single-coordinate object with hourly/daily series (what the full
 * `fetchWeather` request receives); `UPSTREAM_MULTI` is the two-coordinate **array** of
 * complete per-location objects (what the batch request receives). On 2026-10-27 the
 * deployed batch route answered `{count: 2, points: [{id, _meta}, {id, _meta}]}` because
 * `_extractPoint` indexed into an array as if it were the imaginary nested form. The suite
 * that should have caught it stubbed every request with a flat object and compared ids.
 */
const UPSTREAM = require('./fixtures/weatherFullObject.js');
const UPSTREAM_MULTI = require('../backend/utils/__tests__/fixtures/openMeteoMultiArray.js');

const URL_BASE = 'https://www.hazardnet.live';

let fetchSpy;

beforeEach(() => {
  // The 15-minute cache lives in the module instance, so it has to be cleared between tests
  // or one test's coordinates leak into the next (same instance — no resetModules, which
  // would give the clearer a *different* instance than the one the routes hold).
  require('../backend/utils/openMeteo.js').clearCache();
  // `openMeteo` reads `globalThis.fetch`, so replacing it is the whole upstream stub — and it
  // doubles as the assertion that the edge route is a *proxy* and not a second data source.
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    // A comma in `latitude` is how Open-Meteo is asked for several locations, and the
    // response shape changes with it — so the stub has to follow the request rather than
    // always answering with the single-point object. `URLSearchParams` encodes the comma as
    // `%2C`, which is worth matching explicitly: the first version of this stub only looked
    // for a literal comma, silently answered every batch with the single-point object, and
    // the two tests below still passed.
    const multi = /[?&]latitude=[^&]*(,|%2C)/.test(String(url));
    const payload = multi ? UPSTREAM_MULTI : UPSTREAM;
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  });
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
    // Leaf value, from the captured upstream fixture — not just "current exists".
    expect(body.current.temperature_2m).toBe(UPSTREAM.current.temperature_2m);
    expect(body.daily.temperature_2m_max[0]).toBe(UPSTREAM.daily.temperature_2m_max[0]);
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

  test('returns the current conditions for every point, not just their ids', async () => {
    const { onRequest } = require('../functions/api/v1/weather/batch.ts');
    const response = await onRequest(ctx('/api/v1/weather/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        points: [{ id: 'dhaka', lat: 23.8103, lng: 90.4125 }, { id: 'chattogram', lat: 22.3569, lng: 91.7832 }],
      }),
    }));
    const body = await response.json();

    // The regression: the deployment answered 200 with two points whose only content was
    // `_meta`, because upstream returns an ARRAY for N coordinates and the old normaliser
    // indexed into it as if it were the nested-object form its comment described. Phase 0
    // replaced that with `_normalisePoint` → one contract; this assertion stays as the
    // value-level guard against reintroducing the bug.
    expect(body.points.map((point) => point.current?.temperature_2m))
      .toEqual(UPSTREAM_MULTI.map((point) => point.current.temperature_2m));
    expect(body.points[1].current.relative_humidity_2m)
      .toBe(UPSTREAM_MULTI[1].current.relative_humidity_2m);
    expect(body.points[0]._meta.current_vars).toBeGreaterThan(0);
    expect(body.points[0].latitude).toBe(UPSTREAM_MULTI[0].latitude);
  });

  test('one upstream call for N points, and the cache does not swallow the first', async () => {
    const { onRequest } = require('../functions/api/v1/weather/batch.ts');
    const { onRequestGet } = require('../functions/api/v1/weather.ts');

    const batch = await onRequest(ctx('/api/v1/weather/batch?coords=23.8103,90.4125,dhaka|22.3569,91.7832,chattogram'));
    const batchBody = await batch.json();
    // One request carrying both coordinates, not two requests.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('latitude=23.8103%2C22.3569');
    expect(batchBody.points[0].current.temperature_2m)
      .toBe(UPSTREAM_MULTI[0].current.temperature_2m);

    // A `mini` request for the same coordinate is served from the cache the batch just
    // filled — which is only safe because the cached point is a complete one. Before the
    // fix this returned an empty bundle for 15 minutes. Phase 3: assert the cached object
    // **equals the returned object**, not merely that a temperature exists.
    const mini = await onRequestGet(ctx('/api/v1/weather?lat=23.8103&lng=90.4125&mini=1'));
    const miniBody = await mini.json();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(miniBody.current?.temperature_2m).toBe(UPSTREAM_MULTI[0].current.temperature_2m);
    const { id: _batchId, ...batchPoint } = batchBody.points[0];
    expect(miniBody).toEqual(batchPoint);   // the cached object IS the returned object
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

  test('batch: same count, same point payloads, same cache header on both runtimes', async () => {
    const nodeHandler = require('../serverless/v1/weather/batch.js').default;
    const { onRequest } = require('../functions/api/v1/weather/batch.ts');
    const points = [{ id: 'dhaka', lat: 23.8103, lng: 90.4125 }, { id: 'chattogram', lat: 22.3569, lng: 91.7832 }];

    const node = await invoke(nodeHandler, { method: 'POST', body: { points } });
    const edgeResponse = await onRequest(ctx('/api/v1/weather/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ points }),
    }));
    const edgeBody = await edgeResponse.json();

    expect(node.statusCode).toBe(200);
    expect(edgeBody.count).toBe(node.body.count);
    expect(edgeResponse.headers.get('cache-control')).toBe(node.headers['cache-control']);
    expect(Object.keys(edgeBody).sort())
      .toEqual(Object.keys(JSON.parse(JSON.stringify(node.body))).sort());

    // The payload, not just the ids. `cached_at` is a timestamp per request, so it is the
    // one field that legitimately differs between the two invocations.
    const normalise = (body) => body.points.map((point) => {
      const { _meta, ...rest } = point;
      const { cached_at: _cachedAt, ...meta } = _meta;
      return { ...rest, _meta: meta };
    });
    expect(normalise(edgeBody)).toEqual(normalise(node.body));
  });
});
