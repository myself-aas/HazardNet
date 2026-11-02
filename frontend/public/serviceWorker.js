// Service Worker for offline mode and Web Push Notifications.
// Implements push notification handlers and prediction queue sync.
//
// Map tiles are deliberately NOT intercepted here (2026-10-05). The previous
// cache-first tile strategy persisted OpenStreetMap tiles in Cache Storage and
// IndexedDB, which is exactly the bulk-storage the volunteer-run tile servers'
// usage policy prohibits (osm.wiki/Tile_usage_policy, the abuse named at
// osm.wiki/blocked). Tile requests now fall through untouched so the browser
// treats them as ordinary image loads governed only by the servers' own HTTP
// cache headers.

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

// Alert payloads get their own cache with a network-first strategy (Phase 5).
//
// Why not let the app-shell cache handle them: that strategy is stale-while-revalidate, so
// an installed PWA would happily keep serving the payload it saw on install day as if it
// were today's forecast. For a hazard list that is the failure mode that matters most, so
// alerts are fetched from the network first (short timeout — 2G users must not wait) and a
// cached copy is only ever served as a *labelled* fallback. The `X-HazardNet-Stale` marker
// is what lets the client relabel the data as "offline copy" instead of "live".
const ALERTS_CACHE_NAME = 'hazardnet-alerts-v1';
// Only approved public daily snapshots are stored here; no private CSV or officer API.
const DAILY_PUBLIC_CACHE_NAME = 'hazardnet-daily-public-v1';
const DAILY_PUBLIC_CACHE_LIMIT = 80;
const ALERTS_NETWORK_TIMEOUT_MS = 5000;

function isAlertsRequest(url) {
  return url.pathname.startsWith('/api/v1/alerts') || url.pathname === '/data/alerts-latest.json';
}

function isDailyPublicRequest(url) {
  return url.origin === self.location.origin && (
    url.pathname === '/api/v1/advisories'
    || /^\/api\/v1\/advisories\/(?:latest|timeline|peak|summary)$/.test(url.pathname)
    || url.pathname === '/data/daily-advisories-v1.json'
  );
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
// The worker cannot trust a 200 from a misconfigured host. Only the public
// envelope and whitelisted row keys may enter the offline daily cache.
function isApprovedDailyPayload(value) {
  if (!value || typeof value !== 'object' || value.schema !== 'hazardnet-daily-advisories/v1'
    || !value.run || typeof value.run !== 'object'
    || !value.coverage || typeof value.coverage !== 'object'
    || !Array.isArray(value.advisories) || value.advisories.length > 960) return false;
  const top = ['schema', 'run', 'coverage', 'advisories', 'scope', 'status', 'asOf', 'selectedDate', 'count'];
  const requiredRunKeys = ['id', 'generatedAt', 'dataCutoff', 'expiresAt', 'modelVersion', 'inputSha256'];
  const allowedRunKeys = [...requiredRunKeys, 'sourceDatasetVersion'];
  const rowKeys = ['advisoryId', 'districtId', 'district', 'division', 'forecastDay', 'targetDate',
    'hazard', 'tier', 'severityScore', 'requiresReview', 'reasonCode', 'actionIds', 'peak',
    'qualityNotes', 'weather', 'metrics'];
  const tiers = ['NORMAL', 'WATCH', 'WARNING', 'SEVERE', 'EXTREME'];
  const reviewTiers = ['WARNING', 'SEVERE', 'EXTREME'];
  const hazards = ['Cold Wave', 'Drought', 'Fire', 'Flash Flood', 'Flood', 'Heat Wave',
    'Severe Local Storm', 'Tropical Cyclone'];
  const actions = ['cover_seedlings', 'shelter_animals', 'save_irrigation', 'mulch_soil',
    'avoid_burning', 'clear_dry_debris', 'check_drains', 'keep_feed_dry', 'work_cool_hours',
    'shade_animals', 'avoid_open_fields', 'secure_loose_items', 'store_drinking_water',
    'check_official_updates', 'continue_safely'];
  const weatherKeys = ['precipitationMm', 'temperatureMaxC', 'temperatureMinC', 'temperatureMeanC',
    'windKmh', 'humidityPct', 'dewpointC', 'solarRadiationMjM2', 'evapotranspirationMm'];
  const metricNumKeys = ['confidence', 'confidenceRaw', 'modelSeverity', 'modelSeverityRaw',
    'physicsSeverity', 'finalSeverity', 'physicsTopSeverity', 'trackDivergence',
    'probTop1', 'probTop2', 'probTop3'];
  const metricHazardKeys = ['physicsTopHazard', 'top2Hazard', 'top3Hazard'];
  const metricKeys = [...metricNumKeys, ...metricHazardKeys, 'physicsOverride'];
  if (value.scope !== undefined && value.scope !== 'timeline') return false;
  const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
  const cutoff = Date.parse(value.run.dataCutoff);
  if (Object.keys(value).some((key) => !top.includes(key))
    || Object.keys(value.run).some((key) => !allowedRunKeys.includes(key))
    || requiredRunKeys.some((key) => typeof value.run[key] !== 'string' || !value.run[key])
    || (value.run.sourceDatasetVersion !== undefined && (!Number.isSafeInteger(value.run.sourceDatasetVersion)
      || value.run.sourceDatasetVersion < 1 || value.run.sourceDatasetVersion > 1_000_000_000))
    || !/^[a-zA-Z0-9._-]{1,100}$/.test(value.run.id)
    || !/^[a-f0-9]{64}$/.test(value.run.inputSha256)
    || !['generatedAt', 'dataCutoff', 'expiresAt'].every((key) => utc.test(value.run[key]))
    || !Number.isFinite(cutoff) || Date.parse(value.run.generatedAt) < cutoff
    || Date.parse(value.run.expiresAt) !== cutoff + 36 * 3_600_000
    || Object.keys(value.coverage).some((key) => !['districts', 'forecastDays', 'publishedRows'].includes(key))
    || value.coverage.forecastDays !== 15
    || !Number.isInteger(value.coverage.districts) || value.coverage.districts < 1 || value.coverage.districts > 64
    || !Number.isInteger(value.coverage.publishedRows)
    || value.coverage.publishedRows < 0 || value.coverage.publishedRows > 960
    || value.advisories.length !== (value.scope ? value.count : value.coverage.publishedRows)) return false;
  return value.advisories.every((row) => row && typeof row === 'object'
    && Object.keys(row).every((key) => rowKeys.includes(key))
    && typeof row.advisoryId === 'string' && /^\d{1,2}-\d{4}-\d{2}-\d{2}-[a-z-]+$/.test(row.advisoryId)
    && Number.isInteger(row.districtId) && row.districtId > 0 && row.districtId <= 64
    && typeof row.district === 'string' && row.district.length > 0 && row.district.length < 100
    && typeof row.division === 'string' && row.division.length > 0 && row.division.length < 100
    && Number.isInteger(row.forecastDay) && row.forecastDay > 0 && row.forecastDay <= 15
    && /^\d{4}-\d{2}-\d{2}$/.test(row.targetDate)
    && tiers.includes(row.tier)
    && typeof row.severityScore === 'number' && Number.isFinite(row.severityScore)
    && row.severityScore >= 0 && row.severityScore <= 1
    && typeof row.requiresReview === 'boolean' && row.requiresReview === reviewTiers.includes(row.tier)
    && row.reasonCode === (row.tier === 'NORMAL' ? 'no_major_risk' : 'district_outlook')
    && ['unique', 'tied', 'unknown', 'none'].includes(row.peak)
    && hazards.includes(row.hazard)
    && Array.isArray(row.actionIds) && row.actionIds.length >= 2 && row.actionIds.length <= 4
    && row.actionIds.every((id) => actions.includes(id))
    && Array.isArray(row.qualityNotes)
    && row.qualityNotes.every((note) => ['official_update_unverified', 'limited_forecast_detail'].includes(note))
    && row.weather && typeof row.weather === 'object' && !Array.isArray(row.weather)
    && Object.keys(row.weather).every((key) => weatherKeys.includes(key))
    && Object.values(row.weather).every((n) => typeof n === 'number' && Number.isFinite(n))
    && (row.metrics === undefined || (row.metrics && typeof row.metrics === 'object' && !Array.isArray(row.metrics)
      && Object.keys(row.metrics).every((key) => metricKeys.includes(key))
      && Object.entries(row.metrics).every(([key, v]) => {
        if (key === 'physicsOverride') return typeof v === 'boolean';
        if (metricHazardKeys.includes(key)) return hazards.includes(v);
        return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
      }))));
}

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

async function alertsNetworkFirst(request, cacheName = ALERTS_CACHE_NAME) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetchWithTimeout(request, ALERTS_NETWORK_TIMEOUT_MS);
    let approved = isCacheableResponse(request, response);
    if (approved && cacheName === DAILY_PUBLIC_CACHE_NAME) {
      try { approved = isApprovedDailyPayload(await response.clone().json()); }
      catch (_) { approved = false; }
    }
    if (approved) {
      const headers = new Headers(response.headers);
      headers.set('X-HazardNet-Cached-At', new Date().toISOString());
      await cache.put(request, new Response(await response.clone().blob(), {
        status: response.status,
        statusText: response.statusText,
        headers,
      }));
      if (cacheName === DAILY_PUBLIC_CACHE_NAME && typeof cache.keys === 'function') {
        const keys = await cache.keys();
        await Promise.all(keys.slice(0, Math.max(0, keys.length - DAILY_PUBLIC_CACHE_LIMIT))
          .map((key) => cache.delete(key)));
      }
    }
    return response;
  } catch (e) {
    const cached = await cache.match(request);
    if (!cached) {
      return new Response(
        JSON.stringify({ error: cacheName === DAILY_PUBLIC_CACHE_NAME
          ? 'offline and no published daily outlook is stored on this device'
          : 'offline and no cached alert payload on this device' }),
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

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME && key !== ALERTS_CACHE_NAME && key !== DAILY_PUBLIC_CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

// Web Push Event Handler
self.addEventListener('push', (event) => {
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

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Cross-origin map tiles: never intercept, never cache. See the policy note at
  // the top of this file. Returning without calling event.respondWith() lets the
  // browser perform the request natively.
  const tilePathLike = /\/\d+\/\d+\/\d+/.test(url.pathname);
  if (
    url.origin !== self.location.origin &&
    (url.hostname.includes('openstreetmap') || tilePathLike)
  ) {
    return;
  }

  // Never cache an advisory-like path on another origin. Only this deployment's
  // approved public asset belongs in the daily cache.
  if (url.origin !== self.location.origin
    && (url.pathname.startsWith('/api/v1/advisories') || url.pathname === '/data/daily-advisories-v1.json')) return;

  // Alert payloads: network-first, labelled cache fallback (never a silent stale read).
  if (isAlertsRequest(url)) {
    event.respondWith(alertsNetworkFirst(request));
    return;
  }
  // A separate bounded cache for strictly public day-by-day results. The offline
  // marker overrides any 'fresh' status captured in an old API response.
  if (isDailyPublicRequest(url) && request.method === 'GET') {
    event.respondWith(alertsNetworkFirst(request, DAILY_PUBLIC_CACHE_NAME));
    return;
  }
  // A future officer/review endpoint under this prefix must NEVER fall through
  // to the generic static-asset cache (which can replay responses to a new user).
  if (url.pathname.startsWith('/api/v1/advisories')) return;

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
