import crypto from 'node:crypto';

/**
 * Prediction response cache (P3-7).
 *
 * Full inference costs ~6.7 s of CPU (browser TFJS build) per request, so
 * identical tensor payloads are served from a bounded in-memory cache for a
 * short TTL. Keyed by a hash of the exact tensor payload (plus normalization
 * inputs), NOT by district — two callers posting the same tensor get the same
 * answer, which is semantically correct for a deterministic model.
 *
 * Bounds: maxEntries with oldest-entry eviction; TTL in milliseconds.
 * Pure module — unit-testable without HTTP.
 */
const DEFAULTS = { ttlMs: 5 * 60_000, maxEntries: 128 };

export function createPredictionCache(options = {}) {
  const { ttlMs, maxEntries } = { ...DEFAULTS, ...options };
  const store = new Map(); // insertion-ordered → cheap LRU via re-put

  const keyFor = (tensorArray) =>
    crypto
      .createHash('sha256')
      .update(JSON.stringify(tensorArray))
      .digest('hex');

  return {
    keyFor,

    get(tensorArray) {
      const key = keyFor(tensorArray);
      const hit = store.get(key);
      if (!hit) return null;
      if (Date.now() - hit.time > ttlMs) {
        store.delete(key);
        return null;
      }
      // Refresh insertion order (LRU behavior).
      store.delete(key);
      store.set(key, hit);
      return hit.value;
    },

    set(tensorArray, value) {
      const key = keyFor(tensorArray);
      store.delete(key);
      while (store.size >= maxEntries) {
        const oldest = store.keys().next().value;
        store.delete(oldest);
      }
      store.set(key, { time: Date.now(), value });
    },

    get size() {
      return store.size;
    },

    clear() {
      store.clear();
    },
  };
}
