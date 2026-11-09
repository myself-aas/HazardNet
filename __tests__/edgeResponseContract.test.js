/**
 * @jest-environment node
 *
 * The edge API answers through one module, and a 5xx says nothing about the deployment.
 *
 * Before 2026-11-09 every Pages Function under `functions/api/**` built its own `Response`
 * with its own `function json(...)` — eleven copies — plus its own header literals and its
 * own idea of what a cache policy string was. The copies disagreed:
 *
 *   · `functions/api/v1/forecasts/metadata.ts` sent no `x-content-type-options` at all while
 *     its siblings sent `nosniff`;
 *   · four routes echoed the asset/store error back to the caller as `detail`, which is the
 *     information-disclosure pattern `backend/utils/clientError.js` had already been written
 *     to stop on the Node side (SEC-13);
 *   · "do not cache this" was `'no-store'` in three files and `'no-store, max-age=0'` in four,
 *     so a client could not tell a policy from a typo.
 *
 * `backend/edge/response.ts` is the one implementation. This suite holds the line in both
 * directions: the module behaves, and no route grows a second copy of it.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CACHE, respond, respondError } from '../backend/edge/response';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS = join(ROOT, 'functions');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

const ROUTE_FILES = walk(FUNCTIONS).map((file) => relative(ROOT, file).replace(/\\/g, '/'));

describe('the edge response module', () => {
  test('a JSON response carries the content type, the cache policy and nosniff', async () => {
    const response = respond({ ok: true });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe(CACHE.noStore);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.json()).toEqual({ ok: true });
  });

  test('a named cache policy is applied verbatim, and status/headers are per call', () => {
    const response = respond({}, { status: 429, cache: CACHE.publicFor(60), headers: { 'retry-after': '30' } });
    expect(response.status).toBe(429);
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    expect(response.headers.get('retry-after')).toBe('30');
  });

  test('publicFor() clamps nonsense into a policy rather than emitting nonsense', () => {
    expect(CACHE.publicFor(-5)).toBe('public, max-age=0');
    expect(CACHE.publicFor(Number.NaN)).toBe('public, max-age=0');
    expect(CACHE.publicFor(900.7)).toBe('public, max-age=900');
  });

  test('a 5xx body is generic and the detail reaches the log', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = respondError(new Error('Firestore: getaddrinfo ENOTFOUND 10.0.0.2'), {
        scope: 'api/v1/forecasts/bulk',
        status: 503,
        fallback: 'forecast snapshot is unavailable',
      });
      const body = await response.json();
      expect(response.status).toBe(503);
      expect(body).toEqual({ error: 'forecast snapshot is unavailable' });
      expect(JSON.stringify(body)).not.toContain('ENOTFOUND');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('[api/v1/forecasts/bulk]'));
    } finally {
      spy.mockRestore();
    }
  });

  test('a 4xx keeps the message, because we wrote it', async () => {
    const response = respondError(new Error('Invalid horizon. Use: 7_days, 15_days'), {
      scope: 'api/v1/forecasts/bulk',
      status: 400,
    });
    expect(await response.json()).toEqual({ error: 'Invalid horizon. Use: 7_days, 15_days' });
  });
});

describe('no route builds its own transport', () => {
  test('no Pages Function declares a local json() helper', () => {
    const offenders = ROUTE_FILES.filter((file) => {
      const text = readFileSync(join(ROOT, file), 'utf8');
      return /function\s+json\s*\(|const\s+json\s*=/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  test('no Pages Function sets a cache-control or nosniff header literal', () => {
    // `respond()` is the only place these strings live. A route that retypes them is a route
    // that can disagree with the next one — which is exactly what happened.
    const offenders = ROUTE_FILES.filter((file) => {
      const text = readFileSync(join(ROOT, file), 'utf8');
      // A 204 has no body, so it cannot use `respond()`; it is allowed one header line, and
      // that line must name the shared constant rather than spell the policy out again.
      const headerLines = text.match(/['"](cache-control|x-content-type-options)['"]\s*:\s*[^,}]+/g) || [];
      return headerLines.some((line) => !/CACHE\./.test(line));
    });
    expect(offenders).toEqual([]);
  });

  test('no Pages Function re-declares the response module', () => {
    // A second `backend/edge/response`-shaped module would be the same drift one level up.
    const offenders = ROUTE_FILES.filter((file) => {
      const text = readFileSync(join(ROOT, file), 'utf8');
      return /export (function|const) (respond|json)\b/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  test('every API route reaches the shared module, directly or through its adapter', () => {
    // Two routes are one-line delegations to `backend/utils/dailyAdvisoryEdge.js`, which builds
    // its response through the same module. What matters is that the chain ends there and not
    // in a local `Response`, so the adapters are named rather than excused.
    const ADAPTERS = {
      'functions/api/v1/advisories/index.ts': 'backend/utils/dailyAdvisoryEdge.js',
      'functions/api/v1/advisories/[scope].ts': 'backend/utils/dailyAdvisoryEdge.js',
      // An alias route: it delegates wholesale to the handler it aliases, which is itself held
      // to this rule by its own entry in this loop.
      'functions/api/v1/kaggle/advisories.ts': './index',
    };
    const apiRoutes = ROUTE_FILES.filter((file) => file.startsWith('functions/api/'));
    expect(apiRoutes.length).toBeGreaterThan(8);
    for (const file of apiRoutes) {
      const text = readFileSync(join(ROOT, file), 'utf8');
      const adapter = ADAPTERS[file];
      if (adapter) {
        expect(text).toContain(adapter);
        // Resolve the adapter relative to the route that names it, so the check follows the
        // delegation chain rather than a hard-coded path that can rot.
        const target = adapter.startsWith('.')
          ? join(dirname(join(ROOT, file)), `${adapter}.ts`)
          : join(ROOT, adapter);
        expect(readFileSync(target, 'utf8')).toMatch(/backend\/edge\/response/);
      } else {
        expect(text).toMatch(/backend\/edge\/response/);
      }
    }
  });
});
