/**
 * @jest-environment node
 */
/**
 * API Integration Tests - ML Prediction Route (HTTP contract).
 *
 * Covers POST /api/predict at the HTTP layer: tensor validation status
 * codes, response shape, cache-hit flagging, concurrency safety, and rate
 * limiting. The tf/normalization/inference math underneath is mocked here
 * for speed and determinism — the real math is covered by
 * __tests__/inference.test.js (tiny real tensors) and
 * __tests__/normalization.test.js.
 */
const request = require('supertest');

// Mock the tf layer: validation still runs for real (shape checks), but no
// native binding or model math loads in this suite.
jest.mock('../../backend/tfjs.js', () => ({
  getTf: jest.fn(async () => ({
    ready: jest.fn(async () => undefined),
    // Cache keys derive from the payload (like the real tensor): identical
    // payloads collide (cache HIT), distinct payloads miss.
    tensor5d: jest.fn((data) => ({ array: jest.fn(async () => [[data[0]]]) })),
    dispose: jest.fn(),
  })),
}));

jest.mock('../../backend/utils/normalization.js', () => ({
  normalize: jest.fn(async (tensor) => tensor),
}));

jest.mock('../../backend/inference.js', () => ({
  hazardClasses: [
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone',
  ],
  predict: jest.fn(async () => ({
    hazard: 'Flood',
    confidence: 0.9,
    severity_score: 0.8,
    severity_bin: 'High',
    top_3: [
      { hazard: 'Flood', score: 0.9 },
      { hazard: 'Flash Flood', score: 0.05 },
      { hazard: 'Drought', score: 0.02 },
    ],
    class_probabilities: [
      { hazard: 'Cold Wave', score: 0.005 },
      { hazard: 'Drought', score: 0.02 },
      { hazard: 'Fire', score: 0.005 },
      { hazard: 'Flash Flood', score: 0.05 },
      { hazard: 'Flood', score: 0.9 },
      { hazard: 'Heat Wave', score: 0.005 },
      { hazard: 'Severe Local Storm', score: 0.005 },
      { hazard: 'Tropical Cyclone', score: 0.01 },
    ],
    channel_features: {
      ndvi: 0.1, ndwi: 0.2, precip_mean: 0.3, max_temp: 0.4,
      min_temp: 0.5, soil_moisture: 0.6, sar_vv: 0.7,
    },
  })),
}));

// Heavy modules the predict path never touches — keep them out of the suite.
jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }));
jest.mock('../../backend/db.js', () => ({}));

process.env.BACKEND_API_KEY = 'test-api-key';

const app = require('../../backend/server').default;

const TENSOR_SIZE = 1 * 15 * 10 * 64 * 64;
const validPayload = (fill = 0.5) => ({ tensor: new Array(TENSOR_SIZE).fill(fill) });

describe('POST /api/predict', () => {
  test('accepts a correctly shaped tensor and returns the prediction envelope', async () => {
    const response = await request(app)
      .post('/api/predict')
      .send(validPayload(0.5))
      .expect(200);

    expect(response.body).toMatchObject({
      prediction: {
        hazard: 'Flood',
        confidence: 0.9,
        severity_score: 0.8,
        severity_bin: 'High',
      },
      inference: {
        latency_ms: expect.any(Number),
        model_version: expect.stringMatching(/\d+\.\d+\.\d+/),
        timestamp: expect.any(String),
      },
      metadata: {
        input_shape: [1, 15, 10, 64, 64],
        normalization_applied: true,
      },
    });
    expect(response.headers['cache-control']).toContain('no-store');
  });

  test('rejects a wrong-size tensor with 400', async () => {
    const response = await request(app)
      .post('/api/predict')
      .send({ tensor: new Array(100).fill(0.5) })
      .expect(400);

    expect(response.body.error).toMatch(/shape mismatch/i);
  });

  test('rejects a missing tensor with 422 (never fabricates input)', async () => {
    const response = await request(app)
      .post('/api/predict')
      .send({ shape: [1, 15, 10, 64, 64] })
      .expect(422);

    expect(response.body.error).toMatch(/tensor payload required/i);
    expect(response.body).not.toHaveProperty('prediction');
  });

  test('rejects a non-array tensor with 400', async () => {
    const response = await request(app)
      .post('/api/predict')
      .send({ tensor: 'not-an-array' })
      .expect(400);

    expect(response.body.error).toMatch(/must be an array/i);
  });

  test('flags cache hits on identical payloads', async () => {
    const first = await request(app).post('/api/predict').send(validPayload(0.61)).expect(200);
    const second = await request(app).post('/api/predict').send(validPayload(0.61)).expect(200);

    expect(first.body.inference.cached).toBeFalsy();
    expect(second.body.inference.cached).toBe(true);
    expect(second.body.prediction).toEqual(first.body.prediction);
  });

  test('handles concurrent requests safely', async () => {
    const responses = await Promise.all(
      [0.71, 0.72, 0.73, 0.74, 0.75].map((fill) =>
        request(app).post('/api/predict').send(validPayload(fill)),
      ),
    );

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.body.prediction.hazard).toBe('Flood');
    }
  });

  // Last: consumes the 60 req/min predict bucket, so nothing may depend on
  // predict quota after this test.
  test('rate limits excessive requests with 429', async () => {
    const tiny = () => request(app).post('/api/predict').send({ tensor: [1, 2, 3] });
    let saw429 = false;
    for (let i = 0; i < 130 && !saw429; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await tiny();
      if (res.status === 429) saw429 = true;
    }
    expect(saw429).toBe(true);
  }, 60000);
});
