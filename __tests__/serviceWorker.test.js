/**
 * @jest-environment node
 *
 * Phase 6 (SEC-09): the **shipped** service worker.
 *
 * This suite used to run against `frontend/src/serviceWorker.ts` — a file nothing imports
 * and nothing serves. The browser registers `/serviceWorker.js`, which Vite copies verbatim
 * from `frontend/public/` (asserted below), so the alert-offline strategy and the
 * cacheability rule have to live in *that* file. Writing the test against the source that
 * ships is the point: the previous arrangement tested code with no path to production.
 *
 * The worker is loaded by evaluating its source with stubbed globals (`self`, `caches`,
 * `fetch`) so its real `fetch` handler is exercised, rather than asserting on its text.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const WORKER_PATH = join(ROOT, 'frontend/public/serviceWorker.js');
const DIST_WORKER_PATH = join(ROOT, 'frontend/dist/serviceWorker.js');
const WORKER_SOURCE = readFileSync(WORKER_PATH, 'utf8');

const ALERTS_URL = 'https://www.hazardnet.live/api/v1/alerts';

function makeCaches() {
  const stores = new Map(); // cache name → Map(url → Response)
  const puts = [];
  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      put: async (request, response) => {
        puts.push({ name, url: request.url, response });
        store.set(request.url, response);
      },
      match: async (request) => store.get(request.url ?? String(request)),
      keys: async () => [...store.keys()],
      delete: async () => true,
      add: async () => {},
    };
  };
  return {
    caches: {
      open: async (name) => cacheFor(name),
      match: async (request) => {
        for (const store of stores.values()) {
          const hit = store.get(request.url ?? String(request));
          if (hit) return hit;
        }
        return undefined;
      },
      keys: async () => [...stores.keys()],
      delete: async () => true,
    },
    puts,
    cacheFor,
  };
}

/** Evaluate the shipped worker and hand back its registered event handlers. */
function loadWorker({ fetchImpl, caches }) {
  const handlers = {};
  const self = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
    registration: { showNotification: () => {} },
    location: { origin: 'https://www.hazardnet.live' },
  };
  const factory = new Function(
    'self', 'caches', 'fetch', 'Response', 'Headers', 'URL', 'indexedDB', 'clients',
    'setTimeout', 'clearTimeout', 'AbortController',
    WORKER_SOURCE,
  );
  factory(
    self, caches, fetchImpl, Response, Headers, URL, undefined,
    { matchAll: async () => [], openWindow: async () => {} },
    setTimeout, clearTimeout, AbortController,
  );
  return handlers;
}

/** Drive the worker's fetch handler and resolve whatever it responded with. */
function respond(handlers, request) {
  let promise;
  handlers.fetch({ request, respondWith: (value) => { promise = value; } });
  return promise;
}

const request = (over = {}) => ({
  url: over.url || ALERTS_URL,
  method: over.method || 'GET',
  headers: {
    has: (name) => Object.prototype.hasOwnProperty.call(over.headers || {}, name.toLowerCase()),
    get: (name) => (over.headers || {})[name.toLowerCase()] ?? null,
  },
});

const jsonResponse = (body, headers = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

describe('the worker that ships', () => {
  it('is the file the app registers and the build copies', () => {
    const main = readFileSync(join(ROOT, 'frontend/src/main.tsx'), 'utf8');
    expect(main).toContain("navigator.serviceWorker.register('/serviceWorker.js')");
    // VitePWA injects self.__WB_MANIFEST into the built service worker in dist/.
    if (existsSync(DIST_WORKER_PATH)) {
      expect(readFileSync(DIST_WORKER_PATH, 'utf8')).toContain('hazardnet-alerts-v1');
    }
  });

  it('has no second, unshipped worker implementation to drift from', () => {
    // The divergence test (2026-09-17) needs the TS implementation to read;
    // it ships nowhere — Vite only bundles from main.tsx, and nothing imports
    // this file, so it can never drift into the shipped worker.
    expect(existsSync(join(ROOT, 'frontend/src/serviceWorker.ts'))).toBe(true);
  });
});

describe('public district/day advisories', () => {
  const dailyUrl = 'https://www.hazardnet.live/api/v1/advisories?scope=timeline&district=Kurigram';
  const approved = {
    schema: 'hazardnet-daily-advisories/v1', scope: 'timeline',
    run: { id: 'synthetic', generatedAt: '2026-11-01T17:00:00Z', dataCutoff: '2026-11-01T15:00:00Z',
      expiresAt: '2026-11-03T03:00:00Z', modelVersion: 'synthetic', inputSha256: 'a'.repeat(64) },
    coverage: { districts: 1, forecastDays: 15, publishedRows: 0 },
    advisories: [], count: 0,
  };

  it('caches only successful public reads, then marks an offline replay', async () => {
    const { caches, puts } = makeCaches();
    const online = loadWorker({
      caches, fetchImpl: async () => jsonResponse(approved, { 'Cache-Control': 'public, max-age=60' }),
    });
    expect((await respond(online, request({ url: dailyUrl }))).status).toBe(200);
    expect(puts.map((entry) => entry.name)).toEqual(['hazardnet-daily-public-v1']);
    const offline = loadWorker({ caches, fetchImpl: async () => { throw new Error('offline'); } });
    const fallback = await respond(offline, request({ url: dailyUrl }));
    expect(fallback.headers.get('X-HazardNet-Stale')).toBe('1');
    expect((await fallback.json()).schema).toBe('hazardnet-daily-advisories/v1');
  });

  it('does not cache credentialed or no-store data, or an outside-origin advisory', async () => {
    const { caches, puts } = makeCaches();
    const handlers = loadWorker({
      caches, fetchImpl: async () => jsonResponse({ private: true }, { 'Cache-Control': 'no-store' }),
    });
    await respond(handlers, request({ url: dailyUrl }));
    await respond(handlers, request({ url: dailyUrl, headers: { authorization: 'Bearer secret' } }));
    expect(puts).toEqual([]);
    expect(respond(handlers, request({ url: 'https://other.example/api/v1/advisories' }))).toBeUndefined();
  });

  it('never intercepts future officer endpoints or a write to the public path', () => {
    const { caches, puts } = makeCaches();
    const handlers = loadWorker({ caches, fetchImpl: async () => jsonResponse(approved) });
    expect(respond(handlers, request({ url: 'https://www.hazardnet.live/api/v1/advisories/review' }))).toBeUndefined();
    expect(respond(handlers, request({ url: dailyUrl, method: 'POST' }))).toBeUndefined();
    expect(puts).toEqual([]);
  });

  it('rejects a 200 response with private columns even if the host marks it public', async () => {
    const { caches, puts } = makeCaches();
    const handlers = loadWorker({ caches, fetchImpl: async () => jsonResponse(
      { ...approved, privateLedger: { fusion_reason: 'secret' } },
      { 'Cache-Control': 'public, max-age=60' },
    ) });
    expect((await respond(handlers, request({ url: dailyUrl }))).status).toBe(200);
    expect(puts).toEqual([]);
  });

  it('answers 504 when offline with no stored public daily copy', async () => {
    const { caches } = makeCaches();
    const handlers = loadWorker({ caches, fetchImpl: async () => { throw new Error('offline'); } });
    const result = await respond(handlers, request({ url: dailyUrl }));
    expect(result.status).toBe(504);
    expect((await result.json()).error).toMatch(/no published daily outlook/);
  });
});

describe('alert payloads', () => {
  it('goes to the network first and caches the result', async () => {
    const { caches, puts } = makeCaches();
    const handlers = loadWorker({
      caches,
      fetchImpl: async () => jsonResponse({ alerts: [], counts: {} }, { 'Cache-Control': 'public, max-age=60' }),
    });

    const response = await respond(handlers, request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ alerts: [], counts: {} });
    expect(puts.map((p) => p.name)).toEqual(['hazardnet-alerts-v1']);
  });

  it('never caches a credentialed read', async () => {
    const { caches, puts } = makeCaches();
    const handlers = loadWorker({
      caches,
      fetchImpl: async () => jsonResponse(
        { alerts: [{ state: 'DRAFT' }] },
        { 'Cache-Control': 'no-store, max-age=0' },
      ),
    });

    const response = await respond(handlers, request({
      headers: { authorization: 'Bearer duty-officer-key' },
    }));
    expect(response.status).toBe(200);
    expect(puts).toEqual([]);
  });

  it('labels a cached copy when the network is gone, instead of passing it off as live', async () => {
    const { caches } = makeCaches();
    const online = loadWorker({
      caches,
      fetchImpl: async () => jsonResponse({ alerts: [{ id: 'a1' }] }, { 'Cache-Control': 'public, max-age=60' }),
    });
    await respond(online, request());

    const offline = loadWorker({ caches, fetchImpl: async () => { throw new Error('offline'); } });
    const response = await respond(offline, request());
    expect(response.status).toBe(200);
    expect(response.headers.get('X-HazardNet-Stale')).toBe('1');
    expect((await response.json()).alerts).toHaveLength(1);
  });

  it('says so honestly when there is neither a network nor a cached copy', async () => {
    const { caches } = makeCaches();
    const handlers = loadWorker({ caches, fetchImpl: async () => { throw new Error('offline'); } });
    const response = await respond(handlers, request());
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('offline') });
  });

  it('does not cache a no-store response even on the plain path', async () => {
    const { caches, puts } = makeCaches();
    const handlers = loadWorker({
      caches,
      fetchImpl: async () => jsonResponse({ ok: false }, { 'Cache-Control': 'no-store' }),
    });
    await respond(handlers, request({ url: 'https://www.hazardnet.live/api/v1/forecasts/history' }));
    expect(puts).toEqual([]);
  });

  it('still caches ordinary static assets', async () => {
    const { caches, puts } = makeCaches();
    const handlers = loadWorker({
      caches,
      fetchImpl: async () => new Response('body', { status: 200 }),
    });
    await respond(handlers, request({ url: 'https://www.hazardnet.live/assets/app-123.js' }));
    expect(puts.map((p) => p.name)).toEqual(['hazardnet-offline-v3']);
  });

  it('keeps the alert cache alive across activations', async () => {
    const { caches } = makeCaches();
    const handlers = loadWorker({ caches, fetchImpl: async () => jsonResponse({}) });
    const deleted = [];
    caches.delete = async (name) => { deleted.push(name); return true; };
    caches.keys = async () => ['hazardnet-offline-v1', 'hazardnet-offline-v2', 'hazardnet-offline-v3', 'hazardnet-tiles-v1', 'hazardnet-alerts-v1', 'stale-cache'];
    await handlers.activate({ waitUntil: (p) => p });
    expect(deleted).toEqual(['hazardnet-offline-v1', 'hazardnet-offline-v2', 'hazardnet-tiles-v1', 'stale-cache']);
  });

  it('never intercepts OpenStreetMap tile requests (OSM tile usage policy)', async () => {
    const { caches, puts } = makeCaches();
    let fetched = 0;
    const handlers = loadWorker({
      caches,
      fetchImpl: async () => { fetched += 1; return new Response('tile', { status: 200 }); },
    });
    // respondWith must never be called for tiles: no respondWith means the browser
    // performs the request natively under the server's own HTTP cache headers.
    let intercepted = false;
    handlers.fetch({
      request: request({ url: 'https://tile.openstreetmap.org/7/45/62.png' }),
      respondWith: () => { intercepted = true; },
    });
    expect(intercepted).toBe(false);
    expect(puts).toEqual([]);
    expect(fetched).toBe(0);
  });

  it('has no tile-cache helpers left in the shipped worker', () => {
    expect(WORKER_SOURCE).not.toContain('hazardnet-tiles-v1');
    expect(WORKER_SOURCE).not.toContain('isMapTileRequest');
    expect(WORKER_SOURCE).not.toContain('getTileFromIndexedDB');
    expect(WORKER_SOURCE).not.toContain('trimTileCache');
    expect(WORKER_SOURCE).not.toContain('hazardnet_tile_cache_db');
  });
});
