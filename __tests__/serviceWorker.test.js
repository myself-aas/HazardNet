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
    // Vite copies `public/` verbatim, so the built file must equal the source byte for byte.
    if (existsSync(DIST_WORKER_PATH)) {
      expect(readFileSync(DIST_WORKER_PATH, 'utf8')).toBe(WORKER_SOURCE);
    }
  });

  it('has no second, unshipped worker implementation to drift from', () => {
    expect(existsSync(join(ROOT, 'frontend/src/serviceWorker.ts'))).toBe(false);
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
    expect(puts.map((p) => p.name)).toEqual(['hazardnet-offline-v1']);
  });

  it('keeps the alert cache alive across activations', async () => {
    const { caches } = makeCaches();
    const handlers = loadWorker({ caches, fetchImpl: async () => jsonResponse({}) });
    const deleted = [];
    caches.delete = async (name) => { deleted.push(name); return true; };
    caches.keys = async () => ['hazardnet-offline-v1', 'hazardnet-tiles-v1', 'hazardnet-alerts-v1', 'stale-cache'];
    await handlers.activate({ waitUntil: (p) => p });
    expect(deleted).toEqual(['stale-cache']);
  });
});
