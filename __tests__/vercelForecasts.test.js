/**
 * @jest-environment node
 */
/**
 * Vercel serverless handler tests — api/v1/forecasts/{bulk,history,metadata}.js.
 *
 * These handlers are thin wrappers over the shared serving logic
 * (backend/utils/forecastServe.js) + the forecast store; the tests pin the
 * runtime wiring that the shared-logic unit tests cannot see: method gating,
 * handler→store argument plumbing, response envelopes, download headers, and
 * 500 mapping. ForecastStore is an in-memory double; query semantics are
 * covered by __tests__/forecastServe.test.js and Express parity by
 * __tests__/api/forecasts.test.js.
 */
const bulkHandler = require('../api/v1/forecasts/bulk.js').default;
const historyHandler = require('../api/v1/forecasts/history.js').default;
const metadataHandler = require('../api/v1/forecasts/metadata.js').default;

const memory = [];
const storeDouble = {
  async getLatestForecastsByHorizon(horizon) {
    return memory.filter((r) => r.horizon === horizon);
  },
  async getForecastHistory({ from, to, horizon, districtId } = {}) {
    return memory
      .filter((r) => r.prediction_date >= from && r.prediction_date <= to)
      .filter((r) => !horizon || r.horizon === horizon)
      .filter((r) => districtId === undefined || districtId === null || Number(r.district_id) === Number(districtId));
  },
  async getLatestPredictionDate() {
    if (memory.length === 0) return null;
    return memory.map((r) => r.prediction_date).sort().at(-1);
  },
  async getLatestIngestionTimestamp() {
    return memory.length === 0 ? null : '2026-09-12T02:00:00Z';
  },
};

jest.mock('../backend/forecastStore.js', () => ({
  getForecastStoreMode: jest.fn(() => 'memory-test-double'),
  resetForecastStore: jest.fn(),
  getForecastStore: jest.fn(() => storeDouble),
}));

// The handlers never touch these, but the mocked store module graph can pull
// them in — keep the suite hermetic.
jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }));
jest.mock('../backend/db.js', () => ({}));

const ROWS = [
  {
    district_id: 19,
    district_name: 'Dhaka',
    horizon: '7_days',
    hazard_type: 'Flood',
    severity_score: 0.55,
    confidence: 0.91,
    target_date: '2026-09-19',
    prediction_date: '2026-09-12',
  },
  {
    district_id: 30,
    district_name: 'Jashore',
    horizon: '7_days',
    hazard_type: 'Drought',
    severity_score: 0.35,
    confidence: 0.78,
    target_date: '2026-09-19',
    prediction_date: '2026-09-12',
  },
];

/** Minimal Vercel req/res doubles capturing status, headers, and body. */
function invoke(handler, { method = 'GET', query = {} } = {}) {
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
  return Promise.resolve(handler({ method, query }, res)).then(() => res);
}

beforeEach(() => {
  memory.length = 0;
  memory.push(...ROWS);
  jest.clearAllMocks();
});

describe('GET /api/v1/forecasts/bulk (Vercel)', () => {
  test('serves the Express-identical envelope with no-store caching', async () => {
    const res = await invoke(bulkHandler, { query: { horizon: '7_days' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.horizon).toBe('7_days');
    expect(res.body.count).toBe(2);
    expect(res.body.forecasts).toHaveLength(2);
    expect(res.body.generated_at).toBeTruthy();
    expect(res.body.data_source).toBeTruthy();
    expect(res.headers['cache-control']).toContain('no-store');
  });

  test('rejects non-GET methods and invalid horizons', async () => {
    const method = await invoke(bulkHandler, { method: 'POST', query: { horizon: '7_days' } });
    expect(method.statusCode).toBe(405);

    const horizon = await invoke(bulkHandler, { query: { horizon: '10_days' } });
    expect(horizon.statusCode).toBe(400);
    expect(horizon.body.error).toMatch(/invalid horizon/i);
  });

  test('maps store failures to 500', async () => {
    const { getForecastStore } = require('../backend/forecastStore.js');
    getForecastStore.mockImplementationOnce(() => ({
      getLatestForecastsByHorizon: async () => {
        throw new Error('store down');
      },
    }));
    const res = await invoke(bulkHandler, { query: { horizon: '7_days' } });
    expect(res.statusCode).toBe(500);
    // SEC-13: 5xx responses must never echo the underlying error text back to
    // the client — it leaks driver/host detail. The message is logged instead.
    expect(res.body.error).toBe('Internal server error');
    expect(JSON.stringify(res.body)).not.toContain('store down');
  });
});

describe('GET /api/v1/forecasts/history (Vercel)', () => {
  test('serves JSON with the parsed window echoed back', async () => {
    const res = await invoke(historyHandler, { query: { from: '2026-09-01', to: '2026-09-13' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.from).toBe('2026-09-01');
    expect(res.body.to).toBe('2026-09-13');
    expect(res.body.count).toBe(2);
    expect(res.body.forecasts).toHaveLength(2);
  });

  test('plumbs horizon + district filters through to the store', async () => {
    const res = await invoke(historyHandler, {
      query: { from: '2026-09-01', to: '2026-09-13', horizon: '7_days', district_id: '30' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.forecasts[0].district_name).toBe('Jashore');
  });

  test('exports CSV with download headers', async () => {
    const res = await invoke(historyHandler, {
      query: { from: '2026-09-01', to: '2026-09-13', format: 'csv' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('.csv');
    expect(res.body.split('\n')[0]).toContain('district_id,district_name,horizon,hazard_type');
  });

  test('rejects non-GET methods and invalid queries', async () => {
    expect((await invoke(historyHandler, { method: 'DELETE' })).statusCode).toBe(405);
    const bad = await invoke(historyHandler, { query: { horizon: '10_days' } });
    expect(bad.statusCode).toBe(400);
  });
});

describe('GET /api/v1/forecasts/metadata (Vercel)', () => {
  test('serves prediction date, ingestion stamp, and Kaggle provenance', async () => {
    const res = await invoke(metadataHandler);
    expect(res.statusCode).toBe(200);
    expect(res.body.prediction_date).toBe('2026-09-12');
    expect(res.body.ingestion_timestamp).toBe('2026-09-12T02:00:00Z');
    expect(res.body.notebook_source).toContain('hazardnet/forecast-pipeline');
    expect(res.body.datasets).toHaveLength(2);
    expect(res.headers['cache-control']).toContain('no-store');
  });

  test('reports nulls on an empty store and 405s non-GET methods', async () => {
    memory.length = 0;
    const res = await invoke(metadataHandler);
    expect(res.statusCode).toBe(200);
    expect(res.body.prediction_date).toBeNull();

    expect((await invoke(metadataHandler, { method: 'POST' })).statusCode).toBe(405);
  });
});
