// Service Worker for offline mode, Web Push Notifications, and GIS map tiles.

const CACHE_NAME = 'hazardnet-offline-v1';
const TILE_CACHE_NAME = 'hazardnet-tiles-v1';
const MAX_TILE_CACHE_ITEMS = 1200;

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
        .filter((key) => key !== CACHE_NAME && key !== TILE_CACHE_NAME)
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

self.addEventListener('fetch', (event: any) => {
  const request = event.request;
  const url = new URL(request.url);

  // Handle map tile requests with Cache-First & Stale-While-Revalidate fallback strategy
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
