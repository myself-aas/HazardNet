// Service Worker for offline mode, Web Push Notifications, and GIS map tiles.

const CACHE_NAME = 'hazardnet-offline-v1';
const TILE_CACHE_NAME = 'hazardnet-tiles-v1';
const MAX_TILE_CACHE_ITEMS = 1200;

// Alert payloads get their own cache with a network-first strategy (Phase 5).
//
// Why not let the generic shell cache handle them: the shell strategy is
// cache-first, so an installed PWA would keep serving the payload it saw on
// install day as if it were today's forecast. For a hazard list that is the
// failure mode that matters most, so alerts are fetched from the network first
// (short timeout — 2G users must not wait) and the cached copy is only ever
// served as a *labelled* fallback. The `X-HazardNet-Stale` marker is what
// lets the client relabel the data as "offline copy" instead of "live".
const ALERTS_CACHE_NAME = 'hazardnet-alerts-v1';
const ALERTS_NETWORK_TIMEOUT_MS = 5000;

function isAlertsRequest(url: URL): boolean {
  return url.pathname.startsWith('/api/v1/alerts') || url.pathname === '/data/alerts-latest.json';
}

async function fetchWithTimeout(request: Request, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function alertsNetworkFirst(request: Request): Promise<Response> {
  const cache = await caches.open(ALERTS_CACHE_NAME);
  try {
    const response = await fetchWithTimeout(request, ALERTS_NETWORK_TIMEOUT_MS);
    if (response && response.status === 200 && request.method === 'GET') {
      const headers = new Headers(response.headers);
      headers.set('X-HazardNet-Cached-At', new Date().toISOString());
      await cache.put(request, new Response(await response.clone().blob(), {
        status: response.status,
        statusText: response.statusText,
        headers,
      }));
    }
    return response;
  } catch {
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
function isMapTileRequest(url: URL): boolean {
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
  (self as any).skipWaiting();
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME && key !== TILE_CACHE_NAME && key !== ALERTS_CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => (self as any).clients.claim())
  );
});

// Web Push Event Handler
self.addEventListener('push', (event: any) => {
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
    (self as any).registration.showNotification(data.title, options)
  );
});

// Push Notification Click Handler
self.addEventListener('notificationclick', (event: any) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (self as any).clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients: any[]) => {
      for (const client of windowClients) {
        if (client.url.includes((self as any).location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if ((self as any).clients.openWindow) {
        return (self as any).clients.openWindow(targetUrl);
      }
    })
  );
});

// Simple queue for offline predictions
async function syncPredictions() {
  if (typeof indexedDB === 'undefined') return;
  try {
    const request = indexedDB.open('hazardnet-db', 1);
    request.onsuccess = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('prediction-queue')) return;
      const tx = db.transaction('prediction-queue', 'readwrite');
      const store = tx.objectStore('prediction-queue');
      const getAll = store.getAll();
      getAll.onsuccess = () => {
        const queue = getAll.result || [];
        for (const item of queue) {
          fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload),
          }).then(() => {
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

self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-predictions') {
    event.waitUntil(syncPredictions());
  }
});

// Helper to query IndexedDB tile store from ServiceWorker
async function getTileFromIndexedDB(tileUrl: string): Promise<Blob | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('hazardnet_tile_cache_db', 1);
      req.onsuccess = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('tiles')) {
          resolve(null);
          return;
        }
        const tx = db.transaction('tiles', 'readonly');
        const store = tx.objectStore('tiles');
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (ev: any) => {
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

self.addEventListener('fetch', (event: any) => {
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

  if (request.url.includes('/api/predict') || request.url.includes('/api/push')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      }).catch(() => null);
      return cached || (network as any);
    })
  );
});
