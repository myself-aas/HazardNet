/**
 * @jest-environment node
 *
 * The edge API: `functions/api/v1/forecasts/{bulk,metadata}.ts`.
 *
 * These two routes are the first endpoints of the API to leave Node for Cloudflare Pages
 * Functions (`docs/ops/owner-actions.md` Action 21). What they must guarantee:
 *
 *   1. **The same contract as the Node runtime.** The client parses one envelope
 *      (`parseBulkResponse`, `fetchForecastMetadata`) regardless of which runtime answered,
 *      so the key sets are asserted equal to `serverless/v1/forecasts/*`'s — not "similar".
 *   2. **The same validation.** `parseBulkQuery` is imported rather than re-typed, so an
 *      invalid horizon answers the same 400 with the same message.
 *   3. **No store, no `fs`.** Rows come from the deployed snapshot through the `ASSETS`
 *      binding; a missing or malformed asset is a named 503, not a 500 or a hang.
 *   4. **Nothing silently empty.** An unreadable snapshot must not answer `200 {count: 0}` —
 *      that is the failure the front door had on 2026-10-26, where an empty API response
 *      hid a perfectly good committed snapshot from every visitor.
 */

const RESET = () => jest.resetModules();

/* The routes log the reason a snapshot could not be read before answering 503 — that log is
   the diagnostic a probe failure is read with, so it stays. Silenced here, and asserted
   rather than ignored: a 503 that logs nothing is a probe result nobody can act on. */
let errorSpy;
beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

/** The snapshot artifact's shape, with just enough rows to be meaningful. */
const SNAPSHOT = {
  schema: 'hazardnet-forecast-snapshot/v2',
  generated_at: '2026-10-25T10:49:05.018Z',
  prediction_date: '2026-10-24',
  source: 'Kaggle 8-hazardnet-advisory (daily ingestion pipeline)',
  kernel: 'hazardnet/forecast-pipeline',
  horizons: {
    '7_days': [
      { district_id: 40, district_name: 'Bagerhat', horizon: '7_days', hazard_type: 'Flash Flood', prediction_date: '2026-10-24', target_date: '2026-10-31' },
      { district_id: 19, district_name: 'Dhaka', horizon: '7_days', hazard_type: 'Heat Wave', prediction_date: '2026-10-24', target_date: '2026-10-31' },
    ],
    '15_days': [
      { district_id: 40, district_name: 'Bagerhat', horizon: '15_days', hazard_type: 'Flash Flood', prediction_date: '2026-10-24', target_date: '2026-11-08' },
    ],
  },
};

const URL_BASE = 'https://www.hazardnet.live';

/** A Pages `EventContext` whose `ASSETS.fetch` answers with the given payload. */
function context(path, { snapshot = SNAPSHOT, assetResponse, env = {} } = {}) {
  const assets = {
    fetch: jest.fn(async () => {
      if (assetResponse) return assetResponse;
      return new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  };
  return {
    request: new Request(`${URL_BASE}${path}`),
    env: { ASSETS: assets, ...env },
    assets,
  };
}

describe('GET /api/v1/forecasts/bulk (Pages Function)', () => {
  test('serves every row for the requested horizon from the deployed snapshot', async () => {
    const { onRequestGet } = require('../functions/api/v1/forecasts/bulk.ts');
    const ctx = context('/api/v1/forecasts/bulk?horizon=7_days');

    const response = await onRequestGet(ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.horizon).toBe('7_days');
    expect(body.count).toBe(2);
    expect(body.forecasts).toEqual(SNAPSHOT.horizons['7_days']);
    expect(body.data_source).toBe('hazardnet/weekly-forecasts');
    expect(body.generated_at).toBeTruthy();
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');

    // Read through the binding, not over the network: `env.ASSETS.fetch` is the only way a
    // Pages Function can see an asset, and a same-origin `fetch()` would re-enter the edge.
    expect(ctx.assets.fetch).toHaveBeenCalledTimes(1);
    expect(String(ctx.assets.fetch.mock.calls[0][0].url)).toContain('/data/forecasts-latest.json');
  });

  test('serves the 15-day horizon independently of the 7-day one', async () => {
    const { onRequestGet } = require('../functions/api/v1/forecasts/bulk.ts');
    const response = await onRequestGet(context('/api/v1/forecasts/bulk?horizon=15_days'));

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.count).toBe(1);
  });

  test('rejects an invalid horizon with the Node runtime\'s own message', async () => {
    // The same function the Express and Node-function routes call, imported here so the
    // comparison is against the implementation rather than against a copied string.
    const { parseBulkQuery } = require('../backend/utils/forecastServe.js');
    const { onRequestGet } = require('../functions/api/v1/forecasts/bulk.ts');

    const expected = parseBulkQuery({ horizon: '10_days' });
    const response = await onRequestGet(context('/api/v1/forecasts/bulk?horizon=10_days'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(expected.error);
    expect(body.error).toMatch(/Invalid horizon/);
  });

  test('rejects a missing horizon the same way', async () => {
    const { onRequestGet } = require('../functions/api/v1/forecasts/bulk.ts');
    const response = await onRequestGet(context('/api/v1/forecasts/bulk'));
    expect(response.status).toBe(400);
  });

  test('answers a named 503 when the snapshot asset answers 404', async () => {
    const { onRequestGet } = require('../functions/api/v1/forecasts/bulk.ts');
    const response = await onRequestGet(
      context('/api/v1/forecasts/bulk?horizon=7_days', {
        assetResponse: new Response('not found', { status: 404 }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe('forecast snapshot is unavailable');
    expect(body.detail).toContain('404');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[forecasts/bulk]'),
      expect.stringContaining('404')
    );
    // The important part: it does not pretend the forecast is empty.
    expect(body.forecasts).toBeUndefined();
  });

  test('answers a named 503 when the asset is not a snapshot', async () => {
    const { onRequestGet } = require('../functions/api/v1/forecasts/bulk.ts');

    const notJson = await onRequestGet(
      context('/api/v1/forecasts/bulk?horizon=7_days', {
        assetResponse: new Response('<html>index.html</html>', { status: 200 }),
      })
    );
    expect(notJson.status).toBe(503);
    expect((await notJson.json()).detail).toContain('not JSON');

    const wrongShape = await onRequestGet(
      context('/api/v1/forecasts/bulk?horizon=7_days', { snapshot: { schema: 'something-else' } })
    );
    expect(wrongShape.status).toBe(503);
    expect((await wrongShape.json()).detail).toContain('hazardnet-forecast-snapshot');
  });

  test('answers a named 503 when the ASSETS binding is absent', async () => {
    const { onRequestGet } = require('../functions/api/v1/forecasts/bulk.ts');
    const response = await onRequestGet({
      request: new Request(`${URL_BASE}/api/v1/forecasts/bulk?horizon=7_days`),
      env: {},
    });

    expect(response.status).toBe(503);
    expect((await response.json()).detail).toContain('ASSETS binding');
  });

  test('honours FORECAST_DATASET from the Pages environment', async () => {
    const { onRequestGet } = require('../functions/api/v1/forecasts/bulk.ts');
    const response = await onRequestGet(
      context('/api/v1/forecasts/bulk?horizon=7_days', { env: { FORECAST_DATASET: 'myself-aas/replay' } })
    );
    expect((await response.json()).data_source).toBe('myself-aas/replay');
  });
});

describe('GET /api/v1/forecasts/metadata (Pages Function)', () => {
  test('reports freshness from the artifact itself', async () => {
    const { onRequestGet } = require('../functions/api/v1/forecasts/metadata.ts');
    const response = await onRequestGet(context('/api/v1/forecasts/metadata'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.prediction_date).toBe('2026-10-24');
    expect(body.ingestion_timestamp).toBe('2026-10-25T10:49:05.018Z');
    // Two rows in the 7-day horizon plus one in the 15-day horizon.
    expect(body.row_count).toBe(3);
    expect(body.notebook_source).toBe('hazardnet/forecast-pipeline');
    expect(body.data_source).toBe('hazardnet/weekly-forecasts');
    expect(body.generated_at).toBeTruthy();
    // The dataset list carries the published content id; it is imported from the shared
    // module, so the edge cannot advertise a different id than the Node runtimes.
    const { metadataDatasets } = require('../backend/utils/forecastServe.js');
    expect(body.datasets).toEqual(metadataDatasets());
  });

  test('derives prediction_date from the newest row when the snapshot omits it', async () => {
    const { onRequestGet } = require('../functions/api/v1/forecasts/metadata.ts');
    const { prediction_date: _omitted, ...withoutDate } = SNAPSHOT;
    const response = await onRequestGet(
      context('/api/v1/forecasts/metadata', { snapshot: withoutDate })
    );
    expect((await response.json()).prediction_date).toBe('2026-10-24');
  });

  test('answers nulls, not an error, for an empty snapshot', async () => {
    const { onRequestGet } = require('../functions/api/v1/forecasts/metadata.ts');
    const response = await onRequestGet(
      context('/api/v1/forecasts/metadata', {
        snapshot: { schema: 'hazardnet-forecast-snapshot/v2', horizons: {} },
      })
    );
    const body = await response.json();

    // Absent freshness is an alarm the SLO monitor should see, so it must be present as null.
    expect(response.status).toBe(200);
    expect(body.prediction_date).toBeNull();
    expect(body.ingestion_timestamp).toBeNull();
    expect(body.row_count).toBe(0);
  });

  test('answers a named 503 when the snapshot is missing', async () => {
    const { onRequestGet } = require('../functions/api/v1/forecasts/metadata.ts');
    const response = await onRequestGet(
      context('/api/v1/forecasts/metadata', { assetResponse: new Response('', { status: 503 }) })
    );
    expect(response.status).toBe(503);
    expect((await response.json()).detail).toContain('503');
  });
});

describe('the edge envelopes are the Node envelopes', () => {
  /** Minimal Node-function `res` double (the same shape `__tests__/forecastHandlers.test.js` uses). */
  const invoke = (handler, { method = 'GET', query = {} } = {}) => {
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
    return Promise.resolve(handler({ method, query }, res)).then(() => res);
  };

  test('bulk: same keys, same count, same cache policy on both runtimes', async () => {
    // A store double, so the Node handler answers with these rows instead of Firestore.
    const rows = SNAPSHOT.horizons['7_days'];
    jest.doMock('../backend/forecastStore.js', () => ({
      getForecastStoreMode: () => 'memory-test-double',
      resetForecastStore: () => {},
      getForecastStore: () => ({
        getLatestForecastsByHorizon: async (horizon) => (horizon === '7_days' ? rows : []),
      }),
    }));

    RESET();
    const nodeBulk = require('../serverless/v1/forecasts/bulk.js').default;
    const nodeRes = await invoke(nodeBulk, { query: { horizon: '7_days' } });

    RESET();
    const { onRequestGet } = require('../functions/api/v1/forecasts/bulk.ts');
    const edgeResponse = await onRequestGet(context('/api/v1/forecasts/bulk?horizon=7_days'));
    const edgeBody = await edgeResponse.json();

    expect(nodeRes.statusCode).toBe(200);
    expect(Object.keys(edgeBody).sort()).toEqual(Object.keys(nodeRes.body).sort());
    expect(edgeBody.count).toBe(nodeRes.body.count);
    expect(edgeBody.forecasts).toEqual(nodeRes.body.forecasts);
    expect(edgeResponse.headers.get('cache-control')).toBe(nodeRes.headers['cache-control']);

    jest.dontMock('../backend/forecastStore.js');
  });

  test('metadata: same keys on both runtimes', async () => {
    jest.doMock('../backend/forecastStore.js', () => ({
      getForecastStoreMode: () => 'memory-test-double',
      resetForecastStore: () => {},
      getForecastStore: () => ({
        getLatestPredictionDate: async () => '2026-10-24',
        getLatestIngestionTimestamp: async () => '2026-10-25T10:49:05.018Z',
        getLatestRowCount: async () => 3,
      }),
    }));

    RESET();
    const nodeMetadata = require('../serverless/v1/forecasts/metadata.js').default;
    const nodeRes = await invoke(nodeMetadata, {});

    RESET();
    const { onRequestGet } = require('../functions/api/v1/forecasts/metadata.ts');
    const edgeResponse = await onRequestGet(context('/api/v1/forecasts/metadata'));
    const edgeBody = await edgeResponse.json();

    expect(nodeRes.statusCode).toBe(200);
    expect(Object.keys(edgeBody).sort()).toEqual(Object.keys(nodeRes.body).sort());
    // …and the values that mean the same thing on both runtimes agree.
    expect(edgeBody.prediction_date).toBe(nodeRes.body.prediction_date);
    expect(edgeBody.ingestion_timestamp).toBe(nodeRes.body.ingestion_timestamp);
    expect(edgeBody.row_count).toBe(nodeRes.body.row_count);
    expect(edgeBody.datasets).toEqual(nodeRes.body.datasets);

    jest.dontMock('../backend/forecastStore.js');
  });
});
