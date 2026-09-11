/**
 * API Integration Tests - Forecast Routes
 * Tests CSV upload, validation, and Firestore integration
 */
const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Mock Firebase Admin before importing app
jest.mock('firebase-admin', () => {
  const mockBatch = {
    set: jest.fn().mockReturnThis(),
    commit: jest.fn().mockResolvedValue({}),
  };
  
  return {
    initializeApp: jest.fn(),
    credential: { cert: jest.fn() },
    firestore: jest.fn(() => ({
      collection: jest.fn(() => ({
        doc: jest.fn(),
      })),
      batch: jest.fn(() => mockBatch),
    })),
  };
});

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: jest.fn() },
  })),
}));

// Set required env vars
process.env.BACKEND_API_KEY = 'test-api-key-12345';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

const app = require('../../backend/server');

describe('POST /api/v1/forecasts/update', () => {
  const VALID_CSV = `location_id,location_name,location_type,admin_level,division,pcode,horizon,hazard_type,model_severity,physics_severity,confidence,target_date,prediction_date,data_source
1,Dhaka,District,2,Dhaka,BD01,7_days,Flood,0.75,0.82,0.89,2026-09-18,2026-09-11,HazardNet-CNN
1,Dhaka,District,2,Dhaka,BD01,7_days,Drought,0.15,0.12,0.78,2026-09-18,2026-09-11,HazardNet-CNN`;

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('accepts valid CSV with correct API key', async () => {
    const response = await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer test-api-key-12345')
      .attach('file', Buffer.from(VALID_CSV), 'forecasts.csv')
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      records: expect.any(Number),
    });
  });

  test('rejects request without API key', async () => {
    await request(app)
      .post('/api/v1/forecasts/update')
      .attach('file', Buffer.from(VALID_CSV), 'forecasts.csv')
      .expect(403);
  });

  test('rejects invalid API key', async () => {
    await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer wrong-key')
      .attach('file', Buffer.from(VALID_CSV), 'forecasts.csv')
      .expect(403);
  });

  test('rejects request without file', async () => {
    await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer test-api-key-12345')
      .expect(400);
  });

  test('rejects CSV with invalid horizon', async () => {
    const invalidCSV = VALID_CSV.replace('7_days', 'invalid_horizon');
    
    const response = await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer test-api-key-12345')
      .attach('file', Buffer.from(invalidCSV), 'forecasts.csv')
      .expect(422);

    expect(response.body.errors).toBeDefined();
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  test('rejects CSV with out-of-range confidence', async () => {
    const invalidCSV = VALID_CSV.replace('0.89', '1.5');
    
    const response = await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer test-api-key-12345')
      .attach('file', Buffer.from(invalidCSV), 'forecasts.csv')
      .expect(422);

    expect(response.body.errors).toBeDefined();
  });

  test('rejects CSV with invalid hazard type', async () => {
    const invalidCSV = VALID_CSV.replace('Flood', 'Tsunami');
    
    const response = await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer test-api-key-12345')
      .attach('file', Buffer.from(invalidCSV), 'forecasts.csv')
      .expect(422);

    expect(response.body.errors).toBeDefined();
  });

  test('handles empty CSV gracefully', async () => {
    const emptyCSV = 'location_id,location_name,location_type,admin_level,division,pcode,horizon,hazard_type,model_severity,physics_severity,confidence,target_date,prediction_date,data_source';
    
    const response = await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer test-api-key-12345')
      .attach('file', Buffer.from(emptyCSV), 'forecasts.csv')
      .expect(400);

    expect(response.body.error).toMatch(/empty|no records/i);
  });

  test('rate limits excessive requests', async () => {
    const requests = Array(20).fill(null).map(() =>
      request(app)
        .post('/api/v1/forecasts/update')
        .set('Authorization', 'Bearer test-api-key-12345')
        .attach('file', Buffer.from(VALID_CSV), 'forecasts.csv')
    );

    const responses = await Promise.all(requests);
    const rateLimited = responses.filter(r => r.status === 429);
    
    expect(rateLimited.length).toBeGreaterThan(0);
  });
});

describe('GET /api/v1/forecasts', () => {
  test('returns forecasts for valid district', async () => {
    const response = await request(app)
      .get('/api/v1/forecasts?district_id=1&horizon=7_days')
      .expect(200);

    expect(response.body).toBeInstanceOf(Array);
  });

  test('returns 400 for missing district_id', async () => {
    await request(app)
      .get('/api/v1/forecasts?horizon=7_days')
      .expect(400);
  });

  test('supports filtering by hazard type', async () => {
    const response = await request(app)
      .get('/api/v1/forecasts?district_id=1&hazard_type=Flood')
      .expect(200);

    expect(response.body).toBeInstanceOf(Array);
  });
});
