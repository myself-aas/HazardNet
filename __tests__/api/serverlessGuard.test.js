/**
 * @jest-environment node
 *
 * Phase 6 (SEC-07): the serverless-suite guard.
 *
 * Production runs on Vercel functions, where the Express rate limiters never execute —
 * so this suite tests the limiter that actually deploys, plus the invariant that keeps it
 * that way: a static scan asserts every handler under `api/**` applies the guard. A new
 * endpoint added without it fails here rather than in production.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUCKETS, KEYED_MULTIPLIER, clientKey, guardRequest, rateLimitDecision, rateLimitDisabled,
  resetGuardsForTests,
} from '../../backend/middleware/serverlessGuard.js';

const makeRes = () => {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: null,
    setHeader(key, value) { headers[key.toLowerCase()] = value; },
    getHeader(key) { return headers[key.toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end(payload) { this.body = payload; return this; },
  };
};

const makeReq = (over = {}) => ({ method: 'GET', headers: {}, socket: {}, ...over });

beforeEach(() => {
  resetGuardsForTests();
  delete process.env.HAZARDNET_DISABLE_SERVERLESS_RATELIMIT;
});

afterAll(() => {
  resetGuardsForTests();
});

describe('rateLimitDecision', () => {
  const bucket = { limit: 3, windowMs: 60_000 };

  it('opens a fresh window and counts within it', () => {
    const now = 1_000;
    const first = rateLimitDecision(undefined, bucket, now);
    expect(first.allowed).toBe(true);
    expect(first.state).toEqual({ count: 1, resetAt: 61_000 });
    expect(first.remaining).toBe(2);

    const third = rateLimitDecision({ count: 2, resetAt: 61_000 }, bucket, now + 10);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const fourth = rateLimitDecision({ count: 3, resetAt: 61_000 }, bucket, now + 10);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it('starts over once the window has elapsed, even for a saturated entry', () => {
    const decision = rateLimitDecision({ count: 99, resetAt: 5_000 }, bucket, 5_000);
    expect(decision.allowed).toBe(true);
    expect(decision.state.count).toBe(1);
  });
});

describe('clientKey', () => {
  it('uses the first X-Forwarded-For entry — the client as the edge saw it', () => {
    expect(clientKey(makeReq({ headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } })))
      .toBe('203.0.113.7');
  });

  it('falls back to x-real-ip, then the socket, then a single shared bucket', () => {
    expect(clientKey(makeReq({ headers: { 'x-real-ip': '198.51.100.4' } }))).toBe('198.51.100.4');
    expect(clientKey(makeReq({ socket: { remoteAddress: '10.1.2.3' } }))).toBe('10.1.2.3');
    expect(clientKey(makeReq())).toBe('unknown');
  });
});

describe('guardRequest', () => {
  it('sets response headers even when the request is allowed', () => {
    const res = makeRes();
    expect(guardRequest(makeReq(), res, { bucket: 'read' })).toBe(false);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    // No endpoint-declared caching → do not let a proxy cache dynamic JSON.
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['ratelimit-limit']).toBe(String(BUCKETS.read.limit));
  });

  it('does not overwrite a Cache-Control the endpoint sets later', () => {
    const res = makeRes();
    guardRequest(makeReq(), res, { bucket: 'alerts' });
    res.setHeader('Cache-Control', 'public, max-age=60');
    expect(res.getHeader('Cache-Control')).toBe('public, max-age=60');
  });

  it('answers 429 with Retry-After once a bucket is exhausted, and stops the handler', () => {
    const req = makeReq({ headers: { 'x-forwarded-for': '203.0.113.9' } });
    for (let i = 0; i < BUCKETS.read.limit; i += 1) {
      expect(guardRequest(req, makeRes(), { bucket: 'read' })).toBe(false);
    }
    const res = makeRes();
    const rejected = guardRequest(req, res, { bucket: 'read' });
    expect(rejected).toBe(true);
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBe('0');
    expect(res.body.error).toMatch(/too many requests/i);
  });

  it('keys buckets per client, and per bucket', () => {
    const a = makeReq({ headers: { 'x-forwarded-for': '203.0.113.1' } });
    const b = makeReq({ headers: { 'x-forwarded-for': '203.0.113.2' } });
    for (let i = 0; i < BUCKETS.read.limit; i += 1) {
      expect(guardRequest(a, makeRes(), { bucket: 'read' })).toBe(false);
    }
    expect(guardRequest(a, makeRes(), { bucket: 'read' })).toBe(true);
    // A different client, and the same client on a different bucket, are unaffected.
    expect(guardRequest(b, makeRes(), { bucket: 'read' })).toBe(false);
    expect(guardRequest(a, makeRes(), { bucket: 'pipeline' })).toBe(false);
  });

  it('can be switched off for load tests without deleting the guard', () => {
    process.env.HAZARDNET_DISABLE_SERVERLESS_RATELIMIT = '1';
    expect(rateLimitDisabled()).toBe(true);
    const req = makeReq();
    for (let i = 0; i < BUCKETS.read.limit + 10; i += 1) {
      expect(guardRequest(req, makeRes(), { bucket: 'read' })).toBe(false);
    }
  });

  it('gives an admitted pipeline caller room to work, and a prober none', () => {
    delete process.env.BACKEND_API_KEY;
    const anonymous = makeReq({ headers: { 'x-forwarded-for': '203.0.113.30' } });
    for (let i = 0; i < BUCKETS.pipeline.limit; i += 1) {
      expect(guardRequest(anonymous, makeRes(), { bucket: 'pipeline' })).toBe(false);
    }
    expect(guardRequest(anonymous, makeRes(), { bucket: 'pipeline' })).toBe(true);

    // Correct key → the ceiling is the runaway guard, not the anti-probing limit.
    process.env.BACKEND_API_KEY = 'test-key-value';
    const admitted = makeReq({
      headers: { 'x-forwarded-for': '203.0.113.31', authorization: 'Bearer test-key-value' },
    });
    const allowed = BUCKETS.pipeline.limit * KEYED_MULTIPLIER;
    for (let i = 0; i < allowed; i += 1) {
      expect(guardRequest(admitted, makeRes(), { bucket: 'pipeline' })).toBe(false);
    }
    const res = makeRes();
    expect(guardRequest(admitted, res, { bucket: 'pipeline' })).toBe(true);
    expect(res.headers['ratelimit-limit']).toBe(String(allowed));

    // A wrong key is just another anonymous caller.
    const wrong = makeReq({
      headers: { 'x-forwarded-for': '203.0.113.32', authorization: 'Bearer not-the-key' },
    });
    for (let i = 0; i < BUCKETS.pipeline.limit; i += 1) {
      expect(guardRequest(wrong, makeRes(), { bucket: 'pipeline' })).toBe(false);
    }
    expect(guardRequest(wrong, makeRes(), { bucket: 'pipeline' })).toBe(true);
    delete process.env.BACKEND_API_KEY;
  });

  it('unknown buckets fall back to the read budget instead of failing open', () => {
    const res = makeRes();
    guardRequest(makeReq(), res, { bucket: 'not-a-bucket' });
    expect(res.headers['ratelimit-limit']).toBe(String(BUCKETS.read.limit));
  });
});

describe('the deployed handler actually enforces it', () => {
  it('rate-limits /api/v1/alerts/policy through the real handler', async () => {
    const { default: handler } = await import('../../api/v1/alerts/policy.js');
    const req = { method: 'GET', headers: { 'x-forwarded-for': '203.0.113.42' }, query: {} };

    for (let i = 0; i < BUCKETS.alerts.limit; i += 1) {
      const res = makeRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.levels).toBeDefined();
    }

    const blocked = makeRes();
    await handler(req, blocked);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.body.retry_after_seconds).toBeGreaterThan(0);
  }, 30_000);
});

describe('every serverless handler applies the guard', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });

  it('finds no unguarded handler under api/', () => {
    const files = walk(join(process.cwd(), 'api'));
    expect(files.length).toBeGreaterThanOrEqual(13);
    const unguarded = files.filter((file) => !readFileSync(file, 'utf8').includes('guardRequest('));
    expect(unguarded).toEqual([]);
  });
});
