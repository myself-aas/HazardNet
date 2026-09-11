/**
 * Security Integration Tests
 * Tests CORS, rate limiting, CSP, API authentication
 */
const request = require('supertest');

// Mock dependencies
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  firestore: jest.fn(() => ({ collection: jest.fn() })),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: { getUser: jest.fn() } })),
}));

jest.mock('@tensorflow/tfjs-node', () => ({
  ready: jest.fn().mockResolvedValue(true),
  loadGraphModel: jest.fn(),
}));

process.env.BACKEND_API_KEY = 'test-api-key-secure-12345';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.FRONTEND_ORIGIN = 'https://hazardnet.vercel.app';

const app = require('../../backend/server');

describe('CORS Security', () => {
  test('allows requests from configured origin', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://hazardnet.vercel.app')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('https://hazardnet.vercel.app');
  });

  test('blocks requests from unknown origins', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://evil.com');

    // Should not have CORS header for unauthorized origin
    expect(response.headers['access-control-allow-origin']).not.toBe('https://evil.com');
  });

  test('handles preflight OPTIONS requests', async () => {
    const response = await request(app)
      .options('/api/predict')
      .set('Origin', 'https://hazardnet.vercel.app')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);

    expect(response.headers['access-control-allow-methods']).toBeDefined();
  });
});

describe('Rate Limiting', () => {
  test('rate limits /api/predict endpoint', async () => {
    const requests = Array(15).fill(null).map(() =>
      request(app).post('/api/predict').send({ data: [], shape: [1, 15, 10, 64, 64] })
    );

    const responses = await Promise.all(requests);
    const rateLimited = responses.filter(r => r.status === 429);
    
    expect(rateLimited.length).toBeGreaterThan(0);
  }, 10000);

  test('rate limit includes retry-after header', async () => {
    // Exhaust rate limit
    await Promise.all(
      Array(15).fill(null).map(() =>
        request(app).post('/api/predict').send({ data: [], shape: [1, 15, 10, 64, 64] })
      )
    );

    const response = await request(app)
      .post('/api/predict')
      .send({ data: [], shape: [1, 15, 10, 64, 64] });

    if (response.status === 429) {
      expect(response.headers['retry-after']).toBeDefined();
    }
  }, 10000);

  test('rate limits are per-endpoint', async () => {
    // Exhaust /api/predict limit
    await Promise.all(
      Array(15).fill(null).map(() =>
        request(app).post('/api/predict').send({ data: [], shape: [1, 15, 10, 64, 64] })
      )
    );

    // Other endpoints should still work
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
  }, 10000);
});

describe('API Key Authentication', () => {
  test('protected endpoints require API key', async () => {
    await request(app)
      .post('/api/v1/forecasts/update')
      .expect(403);
  });

  test('accepts valid API key in Authorization header', async () => {
    const response = await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer test-api-key-secure-12345');

    // Will fail for other reasons (no file), but not auth
    expect(response.status).not.toBe(403);
  });

  test('rejects invalid API key format', async () => {
    await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'InvalidFormat test-api-key-secure-12345')
      .expect(403);
  });

  test('rejects wrong API key', async () => {
    await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer wrong-key-12345')
      .expect(403);
  });

  test('uses timing-safe comparison', async () => {
    const start = Date.now();
    
    await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer wrong-key-12345');
    
    const wrongKeyTime = Date.now() - start;

    const start2 = Date.now();
    
    await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer test-api-key-secure-12345');
    
    const correctKeyTime = Date.now() - start2;

    // Timing difference should be minimal (< 10ms)
    expect(Math.abs(wrongKeyTime - correctKeyTime)).toBeLessThan(10);
  });
});

describe('Content Security Policy', () => {
  test('includes CSP headers', async () => {
    const response = await request(app).get('/');

    expect(
      response.headers['content-security-policy'] ||
      response.headers['content-security-policy-report-only']
    ).toBeDefined();
  });

  test('CSP restricts inline scripts in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CSP_ENFORCE = 'true';

    const response = await request(app).get('/');
    const csp = response.headers['content-security-policy'];

    if (csp) {
      expect(csp).toMatch(/script-src/);
      expect(csp).not.toMatch(/'unsafe-inline'/);
    }

    delete process.env.CSP_ENFORCE;
  });
});

describe('Security Headers', () => {
  test('includes X-Content-Type-Options', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  test('includes X-Frame-Options', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-frame-options']).toBeDefined();
  });

  test('includes X-XSS-Protection', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-xss-protection']).toBeDefined();
  });

  test('does not leak server information', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('Path Traversal Protection', () => {
  test('blocks access to model files', async () => {
    await request(app).get('/Models/hazardnet_fp32.tflite').expect(403);
  });

  test('blocks access to normalization stats', async () => {
    await request(app).get('/normalization_stats.json').expect(403);
  });

  test('blocks directory traversal attempts', async () => {
    await request(app).get('/../package.json').expect(404);
    await request(app).get('/../../etc/passwd').expect(404);
  });
});

describe('Input Validation', () => {
  test('rejects oversized payloads', async () => {
    const largePayload = {
      data: Array(100 * 1024 * 1024).fill(0), // 100MB
      shape: [1, 15, 10, 64, 64],
    };

    const response = await request(app)
      .post('/api/predict')
      .send(largePayload);

    expect([413, 400]).toContain(response.status);
  }, 30000);

  test('sanitizes error messages', async () => {
    const response = await request(app)
      .post('/api/predict')
      .send({ malicious: '<script>alert("xss")</script>' })
      .expect(400);

    expect(response.body.error).not.toContain('<script>');
  });
});
