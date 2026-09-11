/**
 * API Integration Tests - ML Prediction Route
 * Tests tensor validation, normalization, inference, and caching
 */
const request = require('supertest');

// Mock TensorFlow.js
jest.mock('@tensorflow/tfjs-node', () => {
  const mockTensor = {
    shape: [1, 15, 10, 64, 64],
    dispose: jest.fn(),
    transpose: jest.fn(() => mockTensor),
    mean: jest.fn(() => mockTensor),
    arraySync: jest.fn(() => [[[0.5]]]),
  };

  return {
    ready: jest.fn().mockResolvedValue(true),
    loadGraphModel: jest.fn().mockResolvedValue({
      predict: jest.fn(() => mockTensor),
      dispose: jest.fn(),
    }),
    tensor: jest.fn(() => mockTensor),
    dispose: jest.fn(),
  };
});

// Mock Firebase and Supabase
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  firestore: jest.fn(() => ({ collection: jest.fn() })),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: { getUser: jest.fn() } })),
}));

process.env.BACKEND_API_KEY = 'test-api-key';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

const app = require('../../backend/server');

describe('POST /api/predict', () => {
  const VALID_TENSOR = {
    data: Array(15 * 10 * 64 * 64).fill(0.5),
    shape: [1, 15, 10, 64, 64],
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('accepts valid tensor and returns prediction', async () => {
    const response = await request(app)
      .post('/api/predict')
      .send(VALID_TENSOR)
      .expect(200);

    expect(response.body).toMatchObject({
      prediction: expect.any(Array),
      inference: {
        latency_ms: expect.any(Number),
        model_version: expect.any(String),
        timestamp: expect.any(String),
        cached: expect.any(Boolean),
      },
      metadata: {
        input_shape: expect.any(Array),
        normalization_applied: expect.any(Boolean),
      },
    });

    expect(response.body.prediction.length).toBeGreaterThan(0);
    expect(response.body.prediction[0]).toMatchObject({
      hazard: expect.any(String),
      score: expect.any(Number),
      severity: expect.stringMatching(/Low|Moderate|High/),
    });
  });

  test('rejects tensor with wrong shape', async () => {
    const invalidTensor = {
      data: Array(100).fill(0.5),
      shape: [1, 10, 10], // Wrong shape
    };

    const response = await request(app)
      .post('/api/predict')
      .send(invalidTensor)
      .expect(400);

    expect(response.body.error).toMatch(/shape|dimension/i);
  });

  test('rejects tensor with missing data', async () => {
    const response = await request(app)
      .post('/api/predict')
      .send({ shape: [1, 15, 10, 64, 64] })
      .expect(400);

    expect(response.body.error).toMatch(/data|required/i);
  });

  test('rejects tensor with NaN values', async () => {
    const invalidTensor = {
      data: Array(15 * 10 * 64 * 64).fill(NaN),
      shape: [1, 15, 10, 64, 64],
    };

    const response = await request(app)
      .post('/api/predict')
      .send(invalidTensor)
      .expect(400);

    expect(response.body.error).toMatch(/NaN|invalid/i);
  });

  test('caches identical predictions', async () => {
    const response1 = await request(app)
      .post('/api/predict')
      .send(VALID_TENSOR)
      .expect(200);

    const response2 = await request(app)
      .post('/api/predict')
      .send(VALID_TENSOR)
      .expect(200);

    expect(response1.body.inference.cached).toBe(false);
    expect(response2.body.inference.cached).toBe(true);
  });

  test('rate limits excessive requests', async () => {
    const requests = Array(15).fill(null).map(() =>
      request(app)
        .post('/api/predict')
        .send(VALID_TENSOR)
    );

    const responses = await Promise.all(requests);
    const rateLimited = responses.filter(r => r.status === 429);
    
    expect(rateLimited.length).toBeGreaterThan(0);
  }, 15000);

  test('handles concurrent requests safely', async () => {
    const requests = Array(5).fill(null).map((_, i) => {
      const tensor = { ...VALID_TENSOR, data: [...VALID_TENSOR.data].map(v => v + i * 0.01) };
      return request(app).post('/api/predict').send(tensor);
    });

    const responses = await Promise.all(requests);
    
    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body.prediction).toBeDefined();
    });
  });

  test('returns inference metadata', async () => {
    const response = await request(app)
      .post('/api/predict')
      .send(VALID_TENSOR)
      .expect(200);

    expect(response.body.inference.latency_ms).toBeGreaterThan(0);
    expect(response.body.inference.model_version).toMatch(/v\d+\.\d+\.\d+/);
    expect(response.body.metadata.input_shape).toEqual(VALID_TENSOR.shape);
  });
});

describe('Prediction Quality', () => {
  test('returns scores in valid range [0, 1]', async () => {
    const response = await request(app)
      .post('/api/predict')
      .send({
        data: Array(15 * 10 * 64 * 64).fill(0.5),
        shape: [1, 15, 10, 64, 64],
      })
      .expect(200);

    response.body.prediction.forEach(pred => {
      expect(pred.score).toBeGreaterThanOrEqual(0);
      expect(pred.score).toBeLessThanOrEqual(1);
    });
  });

  test('returns predictions sorted by score', async () => {
    const response = await request(app)
      .post('/api/predict')
      .send({
        data: Array(15 * 10 * 64 * 64).fill(0.5),
        shape: [1, 15, 10, 64, 64],
      })
      .expect(200);

    const scores = response.body.prediction.map(p => p.score);
    const sortedScores = [...scores].sort((a, b) => b - a);
    
    expect(scores).toEqual(sortedScores);
  });
});
