/**
 * @jest-environment node
 *
 * GET /api/v1/forecasts/history — the forecast history API (backlog #6).
 *
 * The forecast store is mocked: this suite pins the HTTP contract — date
 * window validation (format, ordering, 90-day cap), optional horizon /
 * district_id filters, default window (last 30 days), the JSON response
 * shape, and the archive-format CSV export (ingest-compatible dual-track
 * columns, matching the weekly GitHub-Release artifact).
 */
import express from 'express';
import request from 'supertest';
import forecastRoutes from '../backend/routes/forecasts.js';
import { getForecastStore as _getForecastStore } from '../backend/forecastStore.js';

jest.mock('../backend/forecastStore.js', () => ({
  getForecastStore: jest.fn(),
}));

const mockGetForecastStore = jest.mocked(_getForecastStore);
const history = jest.fn();

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.parse(`${today()}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

const row = (over = {}) => ({
  district_id: 19,
  district_name: 'Dhaka',
  horizon: '7_days',
  hazard_type: 'Flood',
  severity_score: 0.55,
  confidence: 0.91,
  target_date: '2026-09-19',
  prediction_date: '2026-09-12',
  model_severity: 0.55,
  physics_severity: 0.48,
  division: 'Dhaka',
  pcode: '3019',
  admin_level: 3,
  adm2_name: 'Dhaka',
  adm2_pcode: '3037',
  ...over,
});

const app = express();
app.use(express.json());
app.use('/api/v1/forecasts', forecastRoutes);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetForecastStore.mockReturnValue({ getForecastHistory: history });
  history.mockResolvedValue([]);
});

describe('GET /api/v1/forecasts/history — validation', () => {
  it('rejects a malformed date with 400', async () => {
    const res = await request(app).get('/api/v1/forecasts/history?from=2026-9-1');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/);
  });

  it('rejects an impossible calendar date with 400', async () => {
    const res = await request(app).get('/api/v1/forecasts/history?from=2026-02-30&to=2026-03-01');
    expect(res.status).toBe(400);
  });

  it('rejects from > to with 400', async () => {
    const res = await request(app).get('/api/v1/forecasts/history?from=2026-09-10&to=2026-09-01');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/from must be <= to/);
  });

  it('rejects windows larger than 90 days with 400', async () => {
    const res = await request(app).get(`/api/v1/forecasts/history?from=${daysAgo(91)}&to=${today()}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/max 90 days/);
  });

  it('rejects an invalid horizon with 400', async () => {
    // '10_days' is an invalid horizon — must be rejected.
    const res = await request(app).get('/api/v1/forecasts/history?horizon=10_days');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid horizon/);
  });

  it('rejects a non-integer district_id with 400', async () => {
    const res = await request(app).get('/api/v1/forecasts/history?district_id=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/district_id/);
  });
});

describe('GET /api/v1/forecasts/history — defaults and pass-through', () => {
  it('defaults to the last 30 days ending today', async () => {
    const res = await request(app).get('/api/v1/forecasts/history');
    expect(res.status).toBe(200);
    expect(history).toHaveBeenCalledWith({
      from: daysAgo(30), to: today(), horizon: null, districtId: null,
    });
    expect(res.body).toMatchObject({
      from: daysAgo(30), to: today(), horizon: null, district_id: null, count: 0,
    });
    expect(Array.isArray(res.body.forecasts)).toBe(true);
    expect(res.body.generated_at).toBeDefined();
  });

  it('passes explicit window, horizon and district_id through to the store', async () => {
    history.mockResolvedValue([row(), row({ district_id: 30 })]);
    const res = await request(app).get('/api/v1/forecasts/history?from=2026-09-01&to=2026-09-07&horizon=7_days&district_id=19');
    expect(res.status).toBe(200);
expect(history).toHaveBeenCalledWith({
       from: '2026-09-01', to: '2026-09-07', horizon: '7_days', districtId: 19,
     });
    expect(res.body.count).toBe(2);
    expect(res.body.horizon).toBe('7_days');
    expect(res.body.district_id).toBe(19);
    expect(res.body.forecasts[0].district_name).toBe('Dhaka');
  });

  it('surfaces store failures as 500', async () => {
    history.mockRejectedValue(new Error('store down'));
    const res = await request(app).get('/api/v1/forecasts/history');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('store down');
  });
});

describe('GET /api/v1/forecasts/history?format=csv — archive export', () => {
  it('emits the ingest-compatible dual-track CSV with attachment headers', async () => {
    history.mockResolvedValue([
      row(),
      row({ district_id: 30, district_name: 'Jashore', physics_severity: undefined, division: undefined, pcode: undefined, admin_level: undefined, adm2_name: undefined, adm2_pcode: undefined }),
    ]);
    const res = await request(app).get('/api/v1/forecasts/history?from=2026-09-01&to=2026-09-07&format=csv');

    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toContain('text/csv');
    expect(String(res.headers['content-disposition'])).toBe(
      'attachment; filename="hazardnet_forecasts_2026-09-01_2026-09-07.csv"'
    );

    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe(
      'district_id,district_name,horizon,hazard_type,severity_score,confidence,target_date,prediction_date,model_severity,physics_severity,division,pcode,admin_level,adm2_name,adm2_pcode'
    );
    expect(lines[1]).toBe('19,Dhaka,7_days,Flood,0.55,0.91,2026-09-19,2026-09-12,0.55,0.48,Dhaka,3019,3,Dhaka,3037');
    // Optional fields export as empty cells when absent.
    expect(lines[2]).toBe('30,Jashore,7_days,Flood,0.55,0.91,2026-09-19,2026-09-12,0.55,,,,,,');
  });

  it('CSV-escapes commas and quotes in values', async () => {
    history.mockResolvedValue([row({ district_name: 'Dhaka, "Metro"' })]);
    const res = await request(app).get('/api/v1/forecasts/history?format=csv');
    const lines = res.text.trim().split('\n');
    expect(lines[1]).toContain('"Dhaka, ""Metro"""');
  });

  it('emits only the header row for an empty window', async () => {
    const res = await request(app).get('/api/v1/forecasts/history?format=csv');
    expect(res.status).toBe(200);
    expect(res.text.trim().split('\n')).toHaveLength(1);
  });
});
