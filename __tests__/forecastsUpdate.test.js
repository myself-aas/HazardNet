/**
 * @jest-environment node
 *
 * POST /api/v1/forecasts/update — CSV ingest route integration test.
 *
 * Regression guard for the weekly-pipeline schema break (2026-09-12): the
 * forecast pipeline writes dual-track columns (`model_severity`,
 * `physics_severity`, plus `division` / `pcode`), while the legacy contract
 * used a single `severity_score` column. Both shapes must ingest cleanly.
 * Firestore and the advisory agent are mocked — this tests the HTTP + CSV
 * parsing + validation contract only.
 */
import { persistForecasts } from '../backend/forecastPersistence.js';
jest.mock('../backend/forecastPersistence.js', () => ({ persistForecasts: jest.fn(async (rows) => ({ written: rows.length })) }));
import express from 'express';
import request from 'supertest';
import { Buffer } from 'node:buffer';
import forecastRoutes from '../backend/routes/forecasts.js';

jest.mock('../backend/db.js', () => {
  const writeBatch = jest.fn(() => ({
    delete: jest.fn(),
    set: jest.fn(),
    commit: jest.fn().mockResolvedValue(true),
  }));
  return {
    db: {},
    collection: jest.fn(() => ({})),
    query: jest.fn(() => ({})),
    where: jest.fn(() => ({})),
    orderBy: jest.fn(() => ({})),
    limit: jest.fn(() => ({})),
    getDocs: jest.fn().mockResolvedValue({ forEach: jest.fn() }),
    deleteDoc: jest.fn(),
    doc: jest.fn(() => ({})),
    setDoc: jest.fn(),
    getDoc: jest.fn(),
    addDoc: jest.fn(),
    writeBatch,
  };
});

jest.mock('../backend/services/advisoryAgent.js', () => ({
  generateAdvisory: jest.fn().mockResolvedValue('Advisory text'),
}));

const app = express();
app.use(express.json());
app.use('/api/v1/forecasts', forecastRoutes);

const NOTEBOOK_CSV = [
  'district_id,district_name,division,pcode,admin_level,adm2_name,adm2_pcode,horizon,hazard_type,model_severity,physics_severity,confidence,target_date,prediction_date,data_source',
  '19,Dhaka,Dhaka,3019,3,Dhaka,3037,7_days,Flood,0.55,0.48,0.91,2026-09-19,2026-09-12,Hybrid_Cognitive_Forecast',
  '30,Jashore,Khulna,4030,3,Jashore,4030,7_days,Drought,0.35,0.40,0.78,2026-09-19,2026-09-12,Hybrid_Cognitive_Forecast',
].join('\n');

const LEGACY_CSV = [
  'district_id,district_name,horizon,hazard_type,severity_score,confidence,target_date,prediction_date',
  '19,Dhaka,7_days,Heat Wave,0.7,0.88,2026-09-27,2026-09-12',
].join('\n');

const MIXED_BAD_ROWS_CSV = [
  'district_id,district_name,division,pcode,horizon,hazard_type,model_severity,physics_severity,confidence,target_date,prediction_date',
  '19,Dhaka,Dhaka,3019,10_days,Flood,0.55,0.48,0.91,2026-09-19,2026-09-12',
  '20,Gazipur,Dhaka,3020,15_days,Flood,0.55,0.48,0.91,2026-09-19,2026-09-12',
  '21,Tangail,Dhaka,3021,7_days,Landslide,0.55,0.48,0.91,2026-09-19,2026-09-12',
].join('\n');

describe('POST /api/v1/forecasts/update (CSV ingest)', () => {
  beforeEach(() => {
    process.env.BACKEND_API_KEY = 'test-secret';
  });

  it('ingests the notebook-shaped dual-track CSV (model_severity/physics_severity)', async () => {
    const res = await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer test-secret')
      .attach('file', Buffer.from(NOTEBOOK_CSV), 'hazardnet_forecasts_latest.csv');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.records_updated).toBe(2);
    expect(res.body.records_skipped).toBe(0);
    expect(res.body.prediction_date).toBe('2026-09-12');
    // One advisory per ingested row (mocked agent)
    expect(res.body.advisories).toHaveLength(2);
  });

  it('still ingests the legacy single-track severity_score CSV', async () => {
    const res = await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer test-secret')
      .attach('file', Buffer.from(LEGACY_CSV), 'legacy.csv');

    expect(res.statusCode).toBe(200);
    expect(res.body.records_updated).toBe(1);
    expect(res.body.advisories).toHaveLength(1);
  });

  it('skips invalid rows and reports them, keeping valid ones', async () => {
    const res = await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer test-secret')
      .attach('file', Buffer.from(MIXED_BAD_ROWS_CSV), 'mixed.csv');

    expect(res.statusCode).toBe(200);
    expect(res.body.records_updated).toBe(1);
    expect(res.body.records_skipped).toBe(2);
    expect(res.body.validation_errors).toHaveLength(2);
    expect(res.body.validation_errors[0]).toContain('Invalid horizon');
    expect(res.body.validation_errors[1]).toContain('Invalid hazard');
  });

  it('returns 422 when every row fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer test-secret')
      .attach('file', Buffer.from('district_id,district_name,horizon,hazard_type,severity_score,confidence,target_date,prediction_date\n1,X,10_days,Flood,9,0.5,2026-09-19,2026-09-12'), 'bad.csv');

    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe('No valid rows found in CSV');
  });

  it('rejects unauthenticated ingest with 401', async () => {
    const res = await request(app)
      .post('/api/v1/forecasts/update')
      .attach('file', Buffer.from(NOTEBOOK_CSV), 'forecasts.csv');

    expect(res.statusCode).toBe(401);
  });
});

it('does not acknowledge a failed durable replacement or expose driver details', async () => {
  process.env.BACKEND_API_KEY = 'test-secret';
  persistForecasts.mockRejectedValueOnce(new Error('private driver detail'));
  const res = await request(app).post('/api/v1/forecasts/update')
    .set('Authorization', 'Bearer test-secret')
    .attach('file', Buffer.from(LEGACY_CSV), 'forecast.csv');
  expect(res.status).toBe(503);
  expect(JSON.stringify(res.body)).not.toContain('private driver detail');
  expect(res.body.status).not.toBe('success');
});
