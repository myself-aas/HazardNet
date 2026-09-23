/** @jest-environment node */
import express from 'express';
import request from 'supertest';
import { createMocks } from 'node-mocks-http';
import routes from '../../backend/routes/predict.js';
import handler from '../../api/predict.js';
import { getForecastStore } from '../../backend/forecastStore.js';

jest.mock('../../backend/forecastStore.js', () => ({ getForecastStore: jest.fn() }));
const row = {
  district_id: 19,
  district_name: 'Dhaka',
  horizon: '7_days',
  prediction_date: '2026-09-20',
  target_date: '2026-09-27',
  hazard_type: 'Flood',
  severity_score: 0.5,
  confidence: 0.7,
};
const app = express();
app.use(express.json());
app.use('/api/predict', routes);
const read = jest.fn();
beforeEach(() => {
  read.mockReset().mockResolvedValue([row]);
  getForecastStore.mockReturnValue({ getLatestForecastsByHorizon: read });
  process.env.HAZARDNET_DISABLE_SERVERLESS_RATELIMIT = '1';
});
const vercel = async (body, method = 'POST') => {
  const { req, res } = createMocks({ method, body });
  await handler(req, res);
  return { status: res.statusCode, body: res._getJSONData(), headers: res._getHeaders() };
};
for (const [name, invoke] of Object.entries({
  express: (body) => request(app).post('/api/predict').send(body),
  vercel,
}))
  describe(`${name} stored prediction`, () => {
    test.each([{ districtId: 'dhaka' }, { district_id: 19 }])(
      'serves an existing row without inventing inference: %p',
      async (body) => {
        const res = await invoke(body);
        expect(res.status).toBe(200);
        expect(res.body.prediction).toMatchObject({
          hazard: 'Flood',
          confidence: 0.7,
          class_probabilities: null,
          top_3: null,
        });
        expect(res.body.inference).toMatchObject({
          served_from: 'stored-forecast',
          latency_ms: null,
          model_version: null,
        });
        expect(res.body.provenance.prediction_date).toBe(row.prediction_date);
        expect(res.headers['cache-control']).toBe('no-store');
      },
    );
    test.each([
      [{}, 422],
      [{ tensor: [1] }, 400],
      [{ districtId: 'dhaka', horizon: '30_days' }, 400],
      [{ districtId: {} }, 422],
      [{ districtId: 'dhaka', rasterName: 'input.tif' }, 400],
    ])('rejects invalid/retired input %p', async (body, status) => {
      expect((await invoke(body)).status).toBe(status);
      expect(read).not.toHaveBeenCalled();
    });
    test('does not fabricate uncovered districts', async () => {
      expect((await invoke({ districtId: 'unknown' })).status).toBe(404);
    });
    test('uses requested horizon and district aliases', async () => {
      read.mockResolvedValue([{ ...row, district_name: 'Jessore', horizon: '15_days' }]);
      expect((await invoke({ districtId: 'jashore', horizon: '15_days' })).status).toBe(200);
      expect(read).toHaveBeenCalledWith('15_days');
    });
    test('returns a safe error on store failure', async () => {
      read.mockRejectedValue(new Error('private database detail'));
      const res = await invoke({ districtId: 'dhaka' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Stored forecast unavailable');
    });
  });
test('Vercel rejects unsupported methods', async () => {
  expect((await vercel({}, 'GET')).status).toBe(405);
});
