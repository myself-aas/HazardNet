// Service Worker for offline mode and Web Push Notifications.
// Unshipped reference copy (the browser loads public/serviceWorker.js). Map
// tiles are deliberately not intercepted anywhere: persisting OpenStreetMap
// tiles violates the volunteer-run tile servers' usage policy
// (osm.wiki/Tile_usage_policy).

// Invalidate old app bundles containing the withdrawn research presentation.
const CACHE_NAME = 'hazardnet-offline-v3';

self.addEventListener('install', () => {
  (self as any).skipWaiting();
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => (self as any).clients.claim())
  );
});

// Web Push Event Handler
self.addEventListener('push', (event: any) => {
  let data = {
    title: 'HazardNet Emergency Telemetry Alert',
    body: 'Continuous disaster severity index spike detected.',
    icon: '/hazardnet-mark.svg',
    badge: '/hazardnet-mark.svg',
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
    icon: data.icon || '/hazardnet-mark.svg',
    badge: data.badge || '/hazardnet-mark.svg',
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

self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-predictions') {
    event.waitUntil(syncPredictions());
  }
});

self.addEventListener('fetch', (event: any) => {
  const request = event.request;
  const url = new URL(request.url);

  // Cross-origin map tiles: never intercept, never cache (osm.wiki/Tile_usage_policy).
  const tilePathLike = /\/\d+\/\d+\/\d+/.test(url.pathname);
  if (
    url.origin !== (self as any).location.origin &&
    (url.hostname.includes('openstreetmap') || tilePathLike)
  ) {
    return;
  }

  if (request.url.includes('/api/predict') || request.url.includes('/api/push')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Never cache HTML / navigations. A stale document shell can keep withdrawn
  // research UI on disk after a deploy that removed it (Phase 7 §14.10).
  const accept = request.headers.get('Accept') || '';
  const isDocument =
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    accept.includes('text/html') ||
    url.pathname.endsWith('.html');
  if (isDocument) {
    event.respondWith(fetch(request));
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
