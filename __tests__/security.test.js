/**
 * @jest-environment node
 */
import request from 'supertest';

const app = require('../backend/server').default;
import { verifyApiKey } from '../backend/utils/apiKeyAuth.js';

// Route-level test: exercise validation & rate limiting, not the RAG/AI
// internals of the backend services.

describe('API key verification', () => {
  it('fails closed with 503 when BACKEND_API_KEY is unset', () => {
    delete process.env.BACKEND_API_KEY;
    const result = verifyApiKey({ headers: { authorization: 'Bearer whatever' } });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
  });

  it('returns 401 for a missing token', () => {
    process.env.BACKEND_API_KEY = 'secret-key';
    const result = verifyApiKey({ headers: {} });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('returns 401 for a wrong token', () => {
    process.env.BACKEND_API_KEY = 'secret-key';
    const result = verifyApiKey({ headers: { authorization: 'Bearer wrong' } });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('accepts the correct token and handles unequal lengths safely', () => {
    process.env.BACKEND_API_KEY = 'secret-key';
    expect(verifyApiKey({ headers: { authorization: 'Bearer secret-key' } }).ok).toBe(true);
    // timingSafeEqual requires equal lengths — must not throw on short/long inputs
    expect(verifyApiKey({ headers: { authorization: 'Bearer x' } }).ok).toBe(false);
    expect(verifyApiKey({ headers: { authorization: `Bearer ${'x'.repeat(500)}` } }).ok).toBe(false);
  });
});

describe('chat route input bounds & AI rate limit (SEC-01)', () => {
  it('rejects an empty query with 400 before any AI call', async () => {
    const res = await request(app).post('/api/chat/query').send({ query: '' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a missing query with 400', async () => {
    const res = await request(app).post('/api/chat/query').send({});
    expect(res.statusCode).toBe(400);
  });

  it('rate-limits the AI route after the configured budget', async () => {
    // aiLimiter allows 20/min; fire 25 and expect at least one 429.
    const codes = [];
    for (let i = 0; i < 25; i++) {
      const res = await request(app).post('/api/chat/query').send({ query: `test query ${i}` });
      codes.push(res.statusCode);
    }
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
    expect(codes.filter((c) => c === 429 || c === 400 || c === 200 || c === 500).length).toBe(25);
  }, 60_000);
});
