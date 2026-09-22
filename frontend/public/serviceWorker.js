// Service Worker for offline mode, Web Push Notifications, and GIS map tiles.
// Implements push notification handlers and prediction queue sync.

// Precache the Vite app shell (HTML, JS, CSS) — workbox injects self.__WB_MANIFEST at build time.
// Uses importScripts (service-worker global) instead of ESM import so the test harness
// (new Function eval without module support) can still evaluate the file.
// vite-plugin-pwa requires exactly one `self.__WB_MANIFEST` occurrence, so we capture it once.
const _wbManifest = self.__WB_MANIFEST;
try {
  if (typeof importScripts === 'function' && typeof workbox === 'undefined') {
    // workbox-sw registers `workbox` on self
    importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');
  }
  if (typeof workbox !== 'undefined' && workbox.precaching && typeof workbox.precaching.precacheAndRoute === 'function') {
    workbox.precaching.precacheAndRoute(_wbManifest || []);
  } else if (typeof precacheAndRoute === 'function') {
    precacheAndRoute(_wbManifest || []);
  }
} catch (_) {
  // Test harness or offline import failure — precaching is optional for alert logic.
}

// Invalidate old app bundles containing the withdrawn research presentation.
const CACHE_NAME = 'hazardnet-offline-v3';
const TILE_CACHE_NAME = 'hazardnet-tiles-v1';
const MAX_TILE_CACHE_ITEMS = 1200;

// Alert payloads get their own cache with a network-first strategy (Phase 5).
//
// Why not let the app-shell cache handle them: that strategy is stale-while-revalidate, so
// an installed PWA would happily keep serving the payload it saw on install day as if it
// were today's forecast. For a hazard list that is the failure mode that matters most, so
// alerts are fetched from the network first (short timeout — 2G users must not wait) and a
// cached copy is only ever served as a *labelled* fallback. The `X-HazardNet-Stale` marker
// is what lets the client relabel the data as "offline copy" instead of "live".
const ALERTS_CACHE_NAME = 'hazardnet-alerts-v1';
const ALERTS_NETWORK_TIMEOUT_MS = 5000;

function isAlertsRequest(url) {
  return url.pathname.startsWith('/api/v1/alerts') || url.pathname === '/data/alerts-latest.json';
}

// May this response be written to Cache Storage? (Phase 6, SEC-09)
//
// A service worker sits below the HTTP cache, so `Cache-Control: no-store` does not protect
// a response from being copied into Cache Storage by `cache.put`. Two classes must never be:
// a **credentialed** request (the alerts API answers a duty officer's `Authorization:
// Bearer <key>` call with unpublished rows and reviewer contact details — caching that
// would leave privileged data on a shared device and replay it to a later unprivileged read
// of the same URL), and a response the server marked `no-store`/`private` or tied to a
// session with `Set-Cookie`.
function isCacheableResponse(request, response) {
  if (!request || !response) return false;
  if (request.method && request.method !== 'GET') return false;
  if (response.status !== 200) return false;

  const requestHeaders = request.headers;
  if (requestHeaders && typeof requestHeaders.has === 'function'
    && (requestHeaders.has('authorization') || requestHeaders.has('x-api-key'))) {
    return false;
  }

  const responseHeaders = response.headers;
  if (!responseHeaders || typeof responseHeaders.get !== 'function') return true;
  const cacheControl = String(responseHeaders.get('cache-control') || '').toLowerCase();
  if (cacheControl.indexOf('no-store') !== -1 || cacheControl.indexOf('private') !== -1) return false;
  if (responseHeaders.get('set-cookie')) return false;
  return true;
}

function fetchWithTimeout(request, timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => { if (controller) controller.abort(); }, timeoutMs);
  const pending = controller ? fetch(request, { signal: controller.signal }) : fetch(request);
  return pending.finally(() => clearTimeout(timer));
}

async function alertsNetworkFirst(request) {
  const cache = await caches.open(ALERTS_CACHE_NAME);
  try {
    const response = await fetchWithTimeout(request, ALERTS_NETWORK_TIMEOUT_MS);
    if (isCacheableResponse(request, response)) {
      const headers = new Headers(response.headers);
      headers.set('X-HazardNet-Cached-At', new Date().toISOString());
      await cache.put(request, new Response(await response.clone().blob(), {
        status: response.status,
        statusText: response.statusText,
        headers,
      }));
    }
    return response;
  } catch (e) {
    const cached = await cache.match(request);
    if (!cached) {
      return new Response(
        JSON.stringify({ error: 'offline and no cached alert payload on this device' }),
        { status: 504, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const headers = new Headers(cached.headers);
    headers.set('X-HazardNet-Stale', '1');
    return new Response(await cached.blob(), {
      status: 200,
      statusText: 'OK (offline copy)',
      headers,
    });
  }
}

// Helper to check if request is a map tile URL
function isMapTileRequest(url) {
  const href = url.href.toLowerCase();
  const path = url.pathname.toLowerCase();
  return (
    href.includes('arcgisonline.com') ||
    href.includes('maptiles.arcgis.com') ||
    href.includes('cartocdn.com') ||
    href.includes('tile.openstreetmap.org') ||
    href.includes('tile.opentopomap.org') ||
    href.includes('stamen-tiles') ||
    href.includes('/mapserver/tile/') ||
    href.includes('/wmts/') ||
    href.includes('/dark_all/') ||
    href.includes('/light_all/') ||
    href.includes('/rastertiles/') ||
    Boolean(path.match(/\/\d+\/\d+\/\d+/))
  );
}

// Trim tile cache to keep storage usage bounded
async function trimTileCache() {
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    const keys = await cache.keys();
    if (keys.length > MAX_TILE_CACHE_ITEMS) {
      const deleteCount = keys.length - MAX_TILE_CACHE_ITEMS;
      for (let i = 0; i < deleteCount; i++) {
        await cache.delete(keys[i]);
      }
    }
  } catch (e) {
    // Ignore cache trim errors
  }
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME && key !== TILE_CACHE_NAME && key !== ALERTS_CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

// Web Push Event Handler
self.addEventListener('push', (event) => {
  let data = {
    title: 'HazardNet Emergency Telemetry Alert',
    body: 'Continuous disaster severity index spike detected.',
    icon: '/hazardnet-logo.svg',
    badge: '/hazardnet-logo.svg',
    data: { url: '/' },
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/hazardnet-logo.svg',
    badge: data.badge || '/hazardnet-logo.svg',
    vibrate: [200, 100, 200, 100, 400],
    tag: 'hazardnet-disaster-alert',
    renotify: true,
    data: data.data || { url: '/' },
    actions: [
      { action: 'open_alert', title: 'View Telemetry Map' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Push Notification Click Event Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Simple queue for offline predictions
async function syncPredictions() {
  if (typeof indexedDB === 'undefined') return;
  try {
    const request = indexedDB.open('hazardnet-db', 1);
    request.onsuccess = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('prediction-queue')) return;
      const tx = db.transaction('prediction-queue', 'readwrite');
      const store = tx.objectStore('prediction-queue');
      const getAll = store.getAll();
      getAll.onsuccess = () => {
        const queue = getAll.result || [];
        for (const item of queue) {
          if (!item.payload?.districtId || item.payload.tensor || item.payload.rasterName) {
            const obsolete = db.transaction('prediction-queue', 'readwrite');
            obsolete.objectStore('prediction-queue').delete(item.id);
            continue;
          }
          fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ districtId: item.payload.districtId, horizon: item.payload.horizon || '7_days' }),
          }).then((response) => {
            if (!response.ok) throw new Error('Stored forecast unavailable');
            const delTx = db.transaction('prediction-queue', 'readwrite');
            delTx.objectStore('prediction-queue').delete(item.id);
          }).catch(() => {});
        }
      };
    };
  } catch {
    // Ignore offline sync errors gracefully
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-predictions') {
    event.waitUntil(syncPredictions());
  }
});

// Helper to query IndexedDB tile store from ServiceWorker
async function getTileFromIndexedDB(tileUrl) {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('hazardnet_tile_cache_db', 1);
      req.onsuccess = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('tiles')) {
          resolve(null);
          return;
        }
        const tx = db.transaction('tiles', 'readonly');
        const store = tx.objectStore('tiles');
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (ev) => {
          const cursor = ev.target.result;
          if (cursor) {
            if (cursor.value && cursor.value.url === tileUrl && cursor.value.blob) {
              resolve(cursor.value.blob);
              return;
            }
            cursor.continue();
          } else {
            resolve(null);
          }
        };
        cursorReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Handle map tile requests with Cache-First & IndexedDB emergency fallback strategy
  if (isMapTileRequest(url)) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);

        // Fetch tile from network to update cache in background when online
        const networkFetch = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
              cache.put(request, networkResponse.clone());
              trimTileCache();
            }
            return networkResponse;
          })
          .catch(() => null);

        // Return cached tile instantly if present (Cache-First)
        if (cachedResponse) {
          return cachedResponse;
        }

        // Check IndexedDB tile store if Cache API misses
        const idbBlob = await getTileFromIndexedDB(request.url);
        if (idbBlob) {
          const idbResponse = new Response(idbBlob, {
            headers: {
              'Content-Type': idbBlob.type || 'image/png',
              'X-Source': 'HazardNet-IndexedDB-Emergency-Cache',
            },
          });
          cache.put(request, idbResponse.clone());
          return idbResponse;
        }

        // Wait for network response if not cached
        const networkResponse = await networkFetch;
        if (networkResponse) {
          return networkResponse;
        }

        // Fallback for offline & uncached tile
        return new Response('', { status: 504, statusText: 'Tile Unavailable Offline' });
      })
    );
    return;
  }

  // Alert payloads: network-first, labelled cache fallback (never a silent stale read).
  if (isAlertsRequest(url)) {
    event.respondWith(alertsNetworkFirst(request));
    return;
  }

  // For API responses, try network first
  if (request.url.includes('/api/predict') || request.url.includes('/api/push')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Never cache HTML / navigations. A stale document shell can keep withdrawn
  // research UI on disk after a deploy that removed it (Phase 7 §14.10).
  const accept = (request.headers && request.headers.get && request.headers.get('Accept')) || '';
  const isDocument =
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    String(accept).indexOf('text/html') !== -1 ||
    url.pathname.endsWith('.html');
  if (isDocument) {
    event.respondWith(fetch(request));
    return;
  }

  // Default: stale-while-revalidate for static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (isCacheableResponse(request, response)) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      }).catch(() => null);
      return cached || network;
    })
  );
});
