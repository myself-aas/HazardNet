/**
 * Verify-then-write for every in-memory cache in this repository.
 *
 * On 2026-10-27 a batch weather lookup produced `{id, _meta}` points — no `current` block —
 * and wrote them into the shared 15-minute cache. The next `mini` lookup for the same
 * coordinate read that hollow point back and served it as a 200. The mechanism was not the
 * wrong shape alone: it was **a write with no value assertion in front of it**, paired with
 * a read that trusted whatever was in the Map.
 *
 * This module is the guard, used by all three read-through caches:
 *   · `backend/utils/openMeteo.js`        — weather points (Node, serverless, Pages)
 *   · `backend/middleware/markdownNegotiation.js` — markdown documents (and negative hits)
 *   · `backend/utils/ai_fallback_engine.js`       — generated advisories (dedup)
 *
 * Rules, both directions:
 *   1. **Pre-write guard.** `set()` calls the cache's value assertion. A failure does not
 *      write; it returns `{ok:false, missing:[…]}` so the caller can fail loudly.
 *   2. **Post-read guard.** `get()` calls the *same* assertion on the stored value. A
 *      failure deletes the entry and reports a miss, so the caller re-fetches.
 *
 * `seed()` is a deliberately named test seam: it bypasses the pre-write guard so a test can
 * simulate a cache that was poisoned by an older deployment. Production code never calls it.
 *
 * No dependencies (zod is available but unnecessary for these four checks), no node
 * built-ins — this module is bundled into Pages Functions through `openMeteo.js`.
 */

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Is a weather point complete enough to be cached **or served**?
 *
 * A point with `_meta` and no data block is a defect, not a valid envelope — it is exactly
 * the 2026-10-27 payload. We require numeric coordinates, at least one data block, and at
 * least one numeric *reading* inside those blocks (an hourly/daily series counts: its
 * arrays must contain a finite number). `current.time`/`interval` are metadata, not values.
 *
 * @returns {{ok: boolean, missing: string[]}} named missing fields, for a useful error
 */
export function assertComplete(point) {
  const missing = [];
  if (!isObject(point)) return { ok: false, missing: ['point object'] };

  if (!isFiniteNumber(point.latitude)) missing.push('latitude');
  if (!isFiniteNumber(point.longitude)) missing.push('longitude');

  const blocks = ['current', 'hourly', 'daily'].filter((key) => isObject(point[key]));
  if (blocks.length === 0) {
    missing.push('one data block (current/hourly/daily)');
  } else if (!blocks.some((key) => Object.entries(point[key]).some(([field, value]) => {
    if (field === 'time' || field === 'interval') return false;
    if (isFiniteNumber(value)) return true;
    return Array.isArray(value) && value.some(isFiniteNumber);
  }))) {
    missing.push('a numeric reading');
  }

  return { ok: missing.length === 0, missing };
}

/** Markdown cache: a non-empty document, or the explicit `null` negative hit. */
export function assertMarkdownContent(content) {
  if (content === null) return { ok: true, missing: [] };   // documented "known miss"
  if (typeof content === 'string' && content.trim().length > 0) return { ok: true, missing: [] };
  return { ok: false, missing: ['non-empty markdown string or null'] };
}

/** Advisory cache: a generated object, not `undefined`, `null`, a string or an error. */
export function assertAdvisory(entry) {
  const data = entry && entry.data !== undefined ? entry.data : entry;
  if (!isObject(data)) return { ok: false, missing: ['advisory object'] };
  const hasLeaf = Object.entries(data).some(([, value]) =>
    typeof value === 'string' || isFiniteNumber(value) || typeof value === 'boolean');
  if (!hasLeaf) return { ok: false, missing: ['at least one scalar advisory value'] };
  return { ok: true, missing: [] };
}

/**
 * @param {object} options
 * @param {number} options.ttlMs lifetime of an entry; `Infinity` disables expiry
 * @param {(entry: any) => {ok: boolean, missing?: string[]}} options.validate value assertion
 * @param {(entry: any, now: number) => number} [options.age] age of an entry in ms
 * @param {string} [options.label] used in rejection messages
 * @param {(phase: 'read'|'write', key: string, missing: string[]) => void} [options.onReject]
 */
export function createVerifiedCache({ ttlMs, validate, age, label = 'cache', onReject }) {
  if (typeof validate !== 'function') throw new Error('createVerifiedCache requires a validate()');
  const store = new Map();
  const entryAge = age || ((entry, now) => now - (entry?.ts ?? 0));
  const reject = onReject || ((phase, key, missing) => {
    // The log line is the diagnostic: a poisoned cache must not fail silently.
    // eslint-disable-next-line no-console
    console.error(`[${label}] ${phase} guard rejected ${String(key)}: missing ${(missing || []).join(', ')}`);
  });

  return {
    /** Post-read guard. An incomplete or expired entry is a miss and is deleted. */
    get(key, now = Date.now()) {
      if (!store.has(key)) return { hit: false, reason: 'miss' };
      const entry = store.get(key);
      if (Number.isFinite(ttlMs) && entryAge(entry, now) >= ttlMs) {
        store.delete(key);
        return { hit: false, reason: 'expired' };
      }
      const check = validate(entry);
      if (!check.ok) {
        store.delete(key);
        reject('read', key, check.missing);
        return { hit: false, reason: 'incomplete', missing: check.missing };
      }
      return { hit: true, entry };
    },
    /** Pre-write guard. Returns the failure instead of writing when the value is hollow. */
    set(key, entry) {
      const check = validate(entry);
      if (!check.ok) {
        reject('write', key, check.missing);
        return { ok: false, missing: check.missing };
      }
      store.set(key, { ...entry, ts: entry.ts ?? Date.now() });
      return { ok: true };
    },
    /** Test seam — simulate a cache entry written by an older, unguarded deployment. */
    seed(key, entry) { store.set(key, { ...entry, ts: entry.ts ?? Date.now() }); },
    /** Raw read, for assertions about what actually landed in the cache. */
    peek(key) { return store.get(key); },
    delete(key) { return store.delete(key); },
    clear() { store.clear(); },
    size() { return store.size; },
    keys() { return store.keys(); },
    evictOldest() {
      const first = store.keys().next();
      if (!first.done) store.delete(first.value);
    },
  };
}
