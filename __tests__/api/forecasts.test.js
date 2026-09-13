/**
 * @jest-environment node
 */
/**
 * API Integration Tests - Forecast Routes (HTTP contract).
 *
 * Covers POST /api/v1/forecasts/update (CSV ingest incl. auth, validation,
 * and skip-accounting) plus the read endpoints GET /, /bulk, /metadata and
 * /history — through the full Express app (rate limiters, CORS, error
 * mapping). Persistence is an in-memory forecast-store double with the same
 * method semantics as backend/forecastStore.js; the real store
 * implementations are covered by __tests__/forecastStore.test.js, and the
 * CSV row contract by __tests__/forecastRow.test.js.
 */
const request = require('supertest');

// In-memory forecast store double (method semantics mirror forecastStore.js).
jest.mock('../../backend/forecastStore.js', () => {
  const memory = [];
  const byDateDesc = (a, b) => (a.prediction_date < b.prediction_date ? 1 : -1);
  const store = {
    mode: 'memory-test-double',
    __memory: memory,
    async getLatestForecastByDistrict(districtId, horizon) {
      const matches = memory
        .filter((r) => Number(r.district_id) === Number(districtId) && r.horizon === horizon)
        .sort(byDateDesc);
      return matches[0] || null;
    },
    async getLatestForecastsByHorizon(horizon) {
      const latest = new Map();
      for (const row of memory.filter((r) => r.horizon === horizon)) {
        const existing = latest.get(row.district_id);
        if (!existing || row.prediction_date > existing.prediction_date) {
          latest.set(row.district_id, row);
        }
      }
      return Array.from(latest.values());
    },
    async getLatestPredictionDate() {
      if (memory.length === 0) return null;
      return memory.map((r) => r.prediction_date).sort().at(-1);
    },
    async getLatestIngestionTimestamp() {
      const stamps = memory.map((r) => r.created_at).filter(Boolean).sort();
      return stamps.at(-1) || null;
    },
    async getForecastHistory({ from, to, horizon, districtId } = {}) {
      return memory
        .filter((r) => r.prediction_date >= from && r.prediction_date <= to)
        .filter((r) => !horizon || r.horizon === horizon)
        .filter((r) => districtId === undefined || districtId === null || Number(r.district_id) === Number(districtId))
        .sort((a, b) => (a.prediction_date < b.prediction_date ? -1 : 1));
    },
    async replaceForecastsForPredictionDate(predictionDate, rows) {
      for (let i = memory.length - 1; i >= 0; i -= 1) {
        if (memory[i].prediction_date === predictionDate) memory.splice(i, 1);
      }
      const stamped = rows.map((r) => ({ ...r, created_at: new Date().toISOString() }));
      memory.push(...stamped);
      return { written: stamped.length };
    },
    async appendForecasts(rows) {
      memory.push(...rows);
      return { written: rows.length };
    },
  };
  return {
    getForecastStoreMode: jest.fn(() => 'memory-test-double'),
    resetForecastStore: jest.fn(),
    getForecastStore: jest.fn(() => store),
  };
});

jest.mock('../../backend/services/advisoryAgent.js', () => ({
  generateAdvisory: jest.fn(async () => 'Test advisory'),
}));

// Heavy modules the forecast path never touches — keep them out of the suite.
jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }));
jest.mock('../../backend/db.js', () => ({}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: { getUser: jest.fn() } })),
}));

// Set required env vars
process.env.BACKEND_API_KEY = 'test-api-key-12345';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

const app = require('../../backend/server').default;
const { getForecastStore } = require('../../backend/forecastStore');

const NOTEBOOK_CSV = [
  'district_id,district_name,division,pcode,horizon,hazard_type,model_severity,physics_severity,confidence,target_date,prediction_date',
  '19,Dhaka,Dhaka,3019,7_days,Flood,0.55,0.48,0.91,2026-09-19,2026-09-12',
  '30,Jashore,Khulna,4030,7_days,Drought,0.35,0.40,0.78,2026-09-19,2026-09-12',
].join('\n');

const LEGACY_CSV = [
  'district_id,district_name,horizon,hazard_type,severity_score,confidence,target_date,prediction_date',
  '19,Dhaka,15_days,Heat Wave,0.7,0.88,2026-09-27,2026-09-12',
].join('\n');

const auth = (req) => req.set('Authorization', 'Bearer test-api-key-12345');

beforeEach(() => {
  getForecastStore().__memory.length = 0;
  jest.clearAllMocks();
});

describe('POST /api/v1/forecasts/update', () => {
  test('ingests the notebook-shaped dual-track CSV', async () => {
    const response = await auth(request(app).post('/api/v1/forecasts/update'))
      .attach('file', Buffer.from(NOTEBOOK_CSV), 'hazardnet_forecasts_latest.csv')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'success',
      records_updated: 2,
      records_skipped: 0,
      prediction_date: '2026-09-12',
    });
    expect(response.body.advisories).toHaveLength(2);
    expect(getForecastStore().__memory).toHaveLength(2);
  });

  test('still ingests the legacy single-track severity_score CSV', async () => {
    const response = await auth(request(app).post('/api/v1/forecasts/update'))
      .attach('file', Buffer.from(LEGACY_CSV), 'legacy.csv')
      .expect(200);

    expect(response.body.records_updated).toBe(1);
    expect(response.body.advisories).toHaveLength(1);
  });

  test('skips invalid rows, keeps valid ones, and reports both counts', async () => {
    const mixed = [
      'district_id,district_name,horizon,hazard_type,severity_score,confidence,target_date,prediction_date',
      '19,Dhaka,10_days,Flood,0.7,0.88,2026-09-19,2026-09-12',
      '20,Gazipur,15_days,Flood,0.55,0.91,2026-09-19,2026-09-12',
      '21,Tangail,7_days,Landslide,0.4,0.8,2026-09-19,2026-09-12',
    ].join('\n');
    const response = await auth(request(app).post('/api/v1/forecasts/update'))
      .attach('file', Buffer.from(mixed), 'mixed.csv')
      .expect(200);

    expect(response.body.records_updated).toBe(1);
    expect(response.body.records_skipped).toBe(2);
    expect(response.body.validation_errors).toHaveLength(2);
  });

  test('rejects a fully invalid CSV with 422', async () => {
    const bad = [
      'district_id,district_name,horizon,hazard_type,severity_score,confidence,target_date,prediction_date',
      '19,Dhaka,10_days,Flood,0.7,0.88,2026-09-19,2026-09-12',
      '20,Gazipur,7_days,Flood,1.5,0.88,2026-09-19,2026-09-12',
    ].join('\n');
    const response = await auth(request(app).post('/api/v1/forecasts/update'))
      .attach('file', Buffer.from(bad), 'bad.csv')
      .expect(422);

    expect(response.body.error).toMatch(/no valid rows/i);
    expect(response.body.validation_errors.length).toBeGreaterThan(0);
  });

  test('rejects a header-only CSV with 422', async () => {
    const headerOnly = 'district_id,district_name,horizon,hazard_type,severity_score,confidence,target_date,prediction_date';
    const response = await auth(request(app).post('/api/v1/forecasts/update'))
      .attach('file', Buffer.from(headerOnly), 'empty.csv')
      .expect(422);

    expect(response.body.error).toMatch(/no valid rows/i);
  });

  test('rejects requests without an API key (401)', async () => {
    await request(app)
      .post('/api/v1/forecasts/update')
      .attach('file', Buffer.from(NOTEBOOK_CSV), 'forecasts.csv')
      .expect(401);
  });

  test('rejects requests with a wrong API key (401)', async () => {
    await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer wrong-key')
      .attach('file', Buffer.from(NOTEBOOK_CSV), 'forecasts.csv')
      .expect(401);
  });

  test('fails closed with 503 when BACKEND_API_KEY is unset', async () => {
    const saved = process.env.BACKEND_API_KEY;
    delete process.env.BACKEND_API_KEY;
    try {
      await request(app)
        .post('/api/v1/forecasts/update')
        .set('Authorization', 'Bearer test-api-key-12345')
        .attach('file', Buffer.from(NOTEBOOK_CSV), 'forecasts.csv')
        .expect(503);
    } finally {
      process.env.BACKEND_API_KEY = saved;
    }
  });

  test('rejects requests without a file (400)', async () => {
    await auth(request(app).post('/api/v1/forecasts/update')).expect(400);
  });

  test('replace semantics: re-ingesting a prediction_date replaces its rows', async () => {
    await auth(request(app).post('/api/v1/forecasts/update'))
      .attach('file', Buffer.from(NOTEBOOK_CSV), 'a.csv')
      .expect(200);
    await auth(request(app).post('/api/v1/forecasts/update'))
      .attach('file', Buffer.from(NOTEBOOK_CSV), 'b.csv')
      .expect(200);
    expect(getForecastStore().__memory).toHaveLength(2);
  });
});

describe('GET /api/v1/forecasts (single district)', () => {
  beforeEach(async () => {
    await auth(request(app).post('/api/v1/forecasts/update'))
      .attach('file', Buffer.from(NOTEBOOK_CSV), 'seed.csv')
      .expect(200);
  });

  test('returns the latest forecast with severity + confidence bins', async () => {
    const response = await request(app)
      .get('/api/v1/forecasts?district_id=19&horizon=7_days')
      .expect(200);

    expect(response.body.prediction).toMatchObject({
      district_id: 19,
      district_name: 'Dhaka',
      hazard_type: 'Flood',
      confidence_bin: 'Certain',
      severity_bin: 'Moderate',
    });
    expect(response.body.metadata.horizon).toBe('7_days');
  });

  test('returns 404 for a district with no forecast', async () => {
    await request(app).get('/api/v1/forecasts?district_id=999&horizon=7_days').expect(404);
  });

  test('returns 400 for missing parameters', async () => {
    await request(app).get('/api/v1/forecasts?horizon=7_days').expect(400);
    await request(app).get('/api/v1/forecasts?district_id=19').expect(400);
  });

  test('returns 400 for an invalid horizon', async () => {
    const response = await request(app)
      .get('/api/v1/forecasts?district_id=19&horizon=10_days')
      .expect(400);
    expect(response.body.error).toMatch(/invalid horizon/i);
  });
});

describe('GET /api/v1/forecasts/bulk', () => {
  beforeEach(async () => {
    await auth(request(app).post('/api/v1/forecasts/update'))
      .attach('file', Buffer.from(NOTEBOOK_CSV), 'seed.csv')
      .expect(200);
  });

  test('returns one row per district for the horizon', async () => {
    const response = await request(app).get('/api/v1/forecasts/bulk?horizon=7_days').expect(200);
    expect(response.body.horizon).toBe('7_days');
    expect(response.body.count).toBe(2);
    expect(response.body.forecasts).toHaveLength(2);
    expect(response.headers['cache-control']).toContain('no-store');
  });

  test('returns an empty set for a horizon with no rows', async () => {
    const response = await request(app).get('/api/v1/forecasts/bulk?horizon=15_days').expect(200);
    expect(response.body.count).toBe(0);
    expect(response.body.forecasts).toEqual([]);
  });

  test('returns 400 for a missing or invalid horizon', async () => {
    await request(app).get('/api/v1/forecasts/bulk').expect(400);
    await request(app).get('/api/v1/forecasts/bulk?horizon=10_days').expect(400);
  });
});

describe('GET /api/v1/forecasts/metadata', () => {
  test('reports nulls on an empty store, dates after ingest', async () => {
    const empty = await request(app).get('/api/v1/forecasts/metadata').expect(200);
    expect(empty.body.prediction_date).toBeNull();

    await auth(request(app).post('/api/v1/forecasts/update'))
      .attach('file', Buffer.from(NOTEBOOK_CSV), 'seed.csv')
      .expect(200);

    const filled = await request(app).get('/api/v1/forecasts/metadata').expect(200);
    expect(filled.body.prediction_date).toBe('2026-09-12');
    expect(filled.body.ingestion_timestamp).toBeTruthy();
    expect(filled.body.data_source).toBeTruthy();
    expect(filled.body.datasets).toHaveLength(2);
  });
});

describe('GET /api/v1/forecasts/history', () => {
  beforeEach(async () => {
    await auth(request(app).post('/api/v1/forecasts/update'))
      .attach('file', Buffer.from(NOTEBOOK_CSV), 'seed.csv')
      .expect(200);
  });

  test('serves the ingested window as JSON', async () => {
    const response = await request(app)
      .get('/api/v1/forecasts/history?from=2026-09-01&to=2026-09-13')
      .expect(200);
    expect(response.body.count).toBe(2);
    expect(response.body.forecasts).toHaveLength(2);
  });

  test('supports horizon + district filters', async () => {
    const filtered = await request(app)
      .get('/api/v1/forecasts/history?from=2026-09-01&to=2026-09-13&horizon=7_days&district_id=30')
      .expect(200);
    expect(filtered.body.count).toBe(1);
    expect(filtered.body.forecasts[0].district_name).toBe('Jashore');
  });

  test('exports the ingest-compatible CSV', async () => {
    const response = await request(app)
      .get('/api/v1/forecasts/history?from=2026-09-01&to=2026-09-13&format=csv')
      .expect(200);
    expect(response.headers['content-type']).toContain('text/csv');
    const lines = response.text.trim().split('\n');
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[0]).toContain('district_id,district_name,horizon,hazard_type');
  });

  test('validates horizon, district, dates, and window size', async () => {
    await request(app).get('/api/v1/forecasts/history?horizon=10_days').expect(400);
    await request(app).get('/api/v1/forecasts/history?district_id=nope').expect(400);
    await request(app).get('/api/v1/forecasts/history?from=not-a-date').expect(400);
    await request(app).get('/api/v1/forecasts/history?from=2026-09-13&to=2026-09-01').expect(400);
    await request(app).get('/api/v1/forecasts/history?from=2026-01-01&to=2026-09-13').expect(400);
  });
});

// Last: consumes the 120 req/min shared API bucket, so nothing may depend on
// API quota after this test.
describe('API rate limiting', () => {
  test('rate limits excessive API requests with 429', async () => {
    let saw429 = false;
    for (let i = 0; i < 160 && !saw429; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get('/api/v1/forecasts/bulk?horizon=nope');
      if (res.status === 429) saw429 = true;
    }
    expect(saw429).toBe(true);
  }, 60000);
});
