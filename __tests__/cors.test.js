/**
 * @jest-environment node
 */
/**
 * Unit tests — CORS allowlist pure helpers (backend/middleware/cors.js).
 *
 * No Express app is imported: these tests pin the allow/deny matrix,
 * including the production fail-closed rule (SEC-04), without spending API
 * rate-limit quota. End-to-end header behavior is covered by
 * __tests__/api/security.test.js.
 */
const { isOriginAllowed, allowedOrigins, isProductionEnv } = require('../backend/middleware/cors.js');

describe('isProductionEnv', () => {
  test('is true when the runtime says production (NODE_ENV / DEPLOY_ENV / CF_PAGES)', () => {
    expect(isProductionEnv({ NODE_ENV: 'production' })).toBe(true);
    expect(isProductionEnv({ DEPLOY_ENV: 'production' })).toBe(true);
    expect(isProductionEnv({ CF_PAGES: '1' })).toBe(true);
    expect(isProductionEnv({ NODE_ENV: 'test' })).toBe(false);
    expect(isProductionEnv({})).toBe(false);
  });
});

describe('allowedOrigins', () => {
  test('parses comma-separated FRONTEND_ORIGIN and always allows local loopbacks', () => {
    const { configured, always } = allowedOrigins({
      FRONTEND_ORIGIN: 'https://a.example, https://b.example ',
    });
    expect(configured).toEqual(['https://a.example', 'https://b.example']);
    expect(always).toContain('http://localhost:3000');
    expect(always).toContain('http://127.0.0.1:3000');
  });

  test('yields no configured origins when FRONTEND_ORIGIN is unset', () => {
    expect(allowedOrigins({}).configured).toEqual([]);
  });
});

describe('isOriginAllowed', () => {
  test('allows requests without an Origin header (same-origin, curl, server-to-server)', () => {
    expect(isOriginAllowed(undefined, { NODE_ENV: 'production' })).toBe(true);
    expect(isOriginAllowed('', { NODE_ENV: 'production' })).toBe(true);
  });

  test('allows configured origins and local loopbacks', () => {
    const env = { FRONTEND_ORIGIN: 'https://www.hazardnet.live' };
    expect(isOriginAllowed('https://www.hazardnet.live', env)).toBe(true);
    expect(isOriginAllowed('http://localhost:3000', env)).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:3000', env)).toBe(true);
  });

  test('rejects unknown origins when an allowlist is configured', () => {
    const env = { FRONTEND_ORIGIN: 'https://www.hazardnet.live' };
    expect(isOriginAllowed('https://evil.com', env)).toBe(false);
    // Near-miss subdomains must not match by suffix.
    expect(isOriginAllowed('https://www.hazardnet.live.evil.com', env)).toBe(false);
  });

  test('fails CLOSED in production when FRONTEND_ORIGIN is unset', () => {
    for (const env of [{ NODE_ENV: 'production' }, { DEPLOY_ENV: 'production' }, { CF_PAGES: '1' }]) {
      expect(isOriginAllowed('https://anything.com', env)).toBe(false);
    }
  });

  test('stays permissive in local dev without config (legacy behavior)', () => {
    expect(isOriginAllowed('https://anything.com', { NODE_ENV: 'development' })).toBe(true);
    expect(isOriginAllowed('https://anything.com', {})).toBe(true);
  });

  test('loopbacks stay allowed even in unconfigured production', () => {
    expect(isOriginAllowed('http://localhost:3000', { NODE_ENV: 'production' })).toBe(true);
  });
});
