/**
 * Phase 6 (SEC-09): what the service worker is allowed to cache.
 *
 * The service worker sits below the HTTP cache, so `Cache-Control: no-store` does not
 * stop `cache.put` from copying a response into Cache Storage. The alerts API answers a
 * duty officer's credentialed request with unpublished rows and reviewer contact details,
 * so "cache everything that returned 200" is a data-leak bug, not a performance choice.
 *
 * These tests exist because the rule is invisible in the UI: without them, deleting the
 * guard would break nothing that any other suite can see.
 */

// The worker lives at src/serviceWorker.ts (Vite copies the built file to /serviceWorker.js).
import { isCacheableResponse } from '../../serviceWorker';

const req = (over: { headers?: Record<string, string>; method?: string } = {}) => ({
  method: over.method || 'GET',
  headers: {
    has: (name: string) => Object.prototype.hasOwnProperty.call(over.headers || {}, name.toLowerCase()),
    get: (name: string) => (over.headers || {})[name.toLowerCase()] ?? null,
  },
}) as unknown as Request;

const res = (headers: Record<string, string> = {}, status = 200) => ({
  status,
  headers: new Headers(headers),
}) as unknown as Response;

describe('isCacheableResponse', () => {
  it('allows an ordinary public payload', () => {
    expect(isCacheableResponse(req(), res({ 'cache-control': 'public, max-age=60' }))).toBe(true);
    expect(isCacheableResponse(req(), res({}))).toBe(true);
  });

  it('refuses a credentialed request, whatever the response says', () => {
    expect(isCacheableResponse(req({ headers: { authorization: 'Bearer key' } }), res())).toBe(false);
    expect(isCacheableResponse(req({ headers: { 'x-api-key': 'key' } }), res())).toBe(false);
  });

  it('refuses a response the server marked no-store or private', () => {
    expect(isCacheableResponse(req(), res({ 'cache-control': 'no-store, max-age=0' }))).toBe(false);
    expect(isCacheableResponse(req(), res({ 'cache-control': 'private, max-age=60' }))).toBe(false);
    expect(isCacheableResponse(req(), res({ 'cache-control': 'PRIVATE' }))).toBe(false);
  });

  it('refuses a response tied to a session', () => {
    expect(isCacheableResponse(req(), res({ 'set-cookie': 'session=abc' }))).toBe(false);
  });

  it('refuses non-GET and non-200 responses', () => {
    expect(isCacheableResponse(req({ method: 'POST' }), res())).toBe(false);
    expect(isCacheableResponse(req(), res({}, 404))).toBe(false);
    expect(isCacheableResponse(req(), null)).toBe(false);
  });

  it('is wired into both network-response cache paths in the service worker', () => {
    // A source-level assertion, deliberately: the failure mode is "someone adds a
    // `cache.put` that skips the guard", which no behavioural test of the helper sees.
    const source = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'frontend/src/serviceWorker.ts'), 'utf8',
    ) as string;

    // Both response-caching sites (alerts cache, shell cache) are guarded…
    expect(source.split('if (isCacheableResponse(request, response))').length - 1).toBe(2);
    // …and the old unguarded shape is gone.
    expect(source).not.toMatch(/if \(response && response\.status === 200\)\s*\{/);

    // The tile cache is deliberately separate: map imagery carries no credentials or
    // user data, and it has its own item-count eviction (MAX_TILE_CACHE_ITEMS), so it
    // is not routed through the response rule.
    expect(source).toContain('MAX_TILE_CACHE_ITEMS');
  });
});
