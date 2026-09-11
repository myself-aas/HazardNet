/**
 * @jest-environment node
 */
import { createMocks } from 'node-mocks-http';
import handler from '../api/ingest.js';
import { writeBatch } from '../backend/db.js';

jest.mock('../backend/db.js', () => ({
  db: {},
  collection: jest.fn(),
  doc: jest.fn(),
  writeBatch: jest.fn(() => ({
    set: jest.fn(),
    commit: jest.fn().mockResolvedValue(true),
  })),
}));

describe('Ingest API Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_API_KEY = 'secret';
  });

  describe('Method Validation', () => {
    it('should reject non-POST requests with 405 status code', async () => {
      const { req, res } = createMocks({ method: 'GET' });
      await handler(req, res);
      expect(res.statusCode).toBe(405);
    });
  });

  describe('Authentication', () => {
    it('should return 401 unauthorized when no token is provided', async () => {
      const { req, res } = createMocks({ method: 'POST', body: '{}' });
      await handler(req, res);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Payload Ingestion', () => {
    it('should successfully ingest chunk and return 200 with count', async () => {
      // horizon must be the domain enum ('10_days' | '20_days' | '30_days') —
      // matches the CSV path and the public.forecasts CHECK constraint.
      const chunk = [{ district_id: '1', district_name: 'A', horizon: '10_days', hazard_type: 'fire', confidence: 0.9, severity_score: 0.5, target_date: '2024-01-01', prediction_date: '2024-01-01' }];
      const { req, res } = createMocks({
        method: 'POST',
        headers: { authorization: 'Bearer secret' },
        body: JSON.stringify({ chunk }),
      });
      await handler(req, res);
      expect(writeBatch).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      
      const data = JSON.parse(res._getData());
      expect(data.count).toBe(1);
    });
  });
});

