/**
 * @jest-environment node
 */
/**
 * Security Integration Tests.
 *
 * Covers CORS allowlisting, security headers, CSP, model-asset shielding,
 * API-key authentication, input validation, and rate limiting — through the
 * full Express app.
 *
 * QUOTA NOTE: every /api request consumes the shared 120 req/min API bucket
 * and /api/predict requests additionally consume the 60 req/min inference
 * bucket, so the rate-limit tests run LAST and nothing after them may depend
 * on API quota.
 */
const request = require('supertest');

// Heavy modules this suite never touches — keep them out of the worker.
jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }));
jest.mock('../../backend/db.js', () => ({}));

process.env.BACKEND_API_KEY = 'test-api-key-secure-12345';
process.env.FRONTEND_ORIGIN = 'https://hazardnet.vercel.app';

const app = require('../../backend/server').default;

describe('CORS Security', () => {
  test('reflects the configured origin', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://hazardnet.vercel.app')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('https://hazardnet.vercel.app');
  });

  test('does not reflect unknown origins', async () => {
    const response = await request(app).get('/health').set('Origin', 'https://evil.com');

    expect(response.headers['access-control-allow-origin']).not.toBe('https://evil.com');
  });

  test('answers preflight with the allowed methods', async () => {
    const response = await request(app)
      .options('/api/predict')
      .set('Origin', 'https://hazardnet.vercel.app')
      .set('Access-Request-Method', 'POST')
      .expect(204);

    expect(response.headers['access-control-allow-methods']).toBeDefined();
  });
});

describe('Security Headers', () => {
  test('includes X-Content-Type-Options: nosniff', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  test('denies framing via X-Frame-Options and CSP frame-ancestors', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-frame-options']).toBe('DENY');
  });

  test('includes X-XSS-Protection and Referrer-Policy', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-xss-protection']).toBeDefined();
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('does not leak the framework via X-Powered-By', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('Content Security Policy', () => {
  test('ships a CSP header that confines scripts to self', async () => {
    const response = await request(app).get('/');
    const csp =
      response.headers['content-security-policy'] ||
      response.headers['content-security-policy-report-only'];

    expect(csp).toBeDefined();
    const scriptSrc = (csp.match(/script-src[^;]*/) || [''])[0];
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

describe('Model Asset Protection', () => {
  test('never serves model artifacts or preprocessing assets', async () => {
    await request(app).get('/Models/hazardnet_fp32.tflite').expect(404);
    await request(app).get('/models/hazardnet_fp32.tflite').expect(404);
    await request(app).get('/hazardnet_int8.tflite').expect(404);
    await request(app).get('/normalization_stats.json').expect(404);
    await request(app).get('/labels.json').expect(404);
    // Belt-and-braces: the SPA fallback also refuses model extensions anywhere.
    await request(app).get('/assets/sneaky/model.tflite').expect(404);
  });

  test('directory traversal attempts cannot exfiltrate files', async () => {
    // Status depends on whether frontend/dist exists (fresh checkout: 503
    // "building assets"; after a local build: 200 serving the PUBLIC
    // index.html fallback). Either is safe — the invariant is no disclosure.
    const first = await request(app).get('/../package.json');
    expect([200, 404, 503]).toContain(first.status);
    const firstBody = JSON.stringify(first.body) + first.text;
    expect(firstBody).not.toContain('"express"');
    expect(firstBody).not.toContain('dependencies');
    if (first.status === 200) {
      expect(first.headers['content-type']).toContain('text/html');
    }

    const second = await request(app).get('/../../etc/passwd');
    expect([200, 404, 503]).toContain(second.status);
    expect(JSON.stringify(second.body) + second.text).not.toContain('root:');
  });
});

describe('Input Validation', () => {
  test('rejects payloads over the 10MB JSON limit with 413', async () => {
    const response = await request(app)
      .post('/api/predict')
      .send({ tensor: 'x'.repeat(11 * 1024 * 1024) });

    expect(response.status).toBe(413);
  }, 30000);

  test('rejects a missing district with 422 and never echoes input', async () => {
    const response = await request(app)
      .post('/api/predict')
      .send({ malicious: '<script>alert("xss")</script>' })
      .expect(422);

    expect(response.body.error).toBeDefined();
    expect(response.body.error).not.toContain('<script>');
  });
});

describe('API Key Authentication', () => {
  test('protected endpoints require an API key (401)', async () => {
    const response = await request(app).post('/api/v1/forecasts/update').expect(401);
    expect(response.body.error).toBeDefined();
  });

  test('accepts a valid API key (fails later on the missing file, not on auth)', async () => {
    const response = await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer test-api-key-secure-12345');

    expect(response.status).toBe(400); // no file attached — auth passed
  });

  test('rejects malformed and wrong credentials identically (no oracle)', async () => {
    await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'InvalidFormat test-api-key-secure-12345')
      .expect(401);

    await request(app)
      .post('/api/v1/forecasts/update')
      .set('Authorization', 'Bearer wrong-key-12345')
      .expect(401);
  });
});

// Last: exhausts the 60 req/min /api/predict bucket (and spends shared API
// quota), so nothing after this block may depend on either bucket.
describe('Rate Limiting', () => {
  test('rate limits /api/predict with 429 + draft-7 headers', async () => {
    let limited = null;
    for (let i = 0; i < 75 && !limited; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/api/predict').send({});
      if (res.status === 429) limited = res;
    }

    expect(limited).not.toBeNull();
    // express-rate-limit draft-7 headers (Retry-After is a legacy header and
    // intentionally disabled, so the reset time is the retry signal).
    expect(
      limited.headers['ratelimit-reset'] || limited.headers['retry-after']
    ).toBeDefined();
  }, 60000);

  test('limits are per-endpoint: unthrottled routes still work', async () => {
    await request(app).get('/health').expect(200);
  });
});
