/**
 * @jest-environment node
 *
 * Phase 2 — verify-then-write for every cache, with the hollow point as a permanent fixture.
 *
 * The 2026-10-27 batch defect poisoned 15 minutes of weather cache with `{id, _meta}`.
 * This suite seeds exactly that object into the real module cache (through the named test
 * seam), then proves: the post-read guard rejects it → a re-fetch happens → the pre-write
 * guard writes a complete point → the second read returns that complete point without
 * another upstream call. It also proves a hollow *fresh* response is refused at the write
 * boundary rather than served as a 200.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const UPSTREAM_OBJECT = require('../backend/utils/__tests__/fixtures/openMeteoSingleObject.js');
const UPSTREAM_ARRAY = require('../backend/utils/__tests__/fixtures/openMeteoMultiArray.js');
const {
  assertComplete,
  assertMarkdownContent,
  assertAdvisory,
  createVerifiedCache,
} = require('../backend/utils/cacheContract.js');
const {
  clearCache,
  seedCacheEntry,
  peekCacheEntry,
  fetchCurrentWeather,
  fetchCurrentWeatherBatch,
} = require('../backend/utils/openMeteo.js');

/** The exact payload the broken batch route returned on 2026-10-27. Permanent fixture. */
const HOLLOW_POINT = {
  id: 'dhaka',
  _meta: { source: 'open-meteo', current_vars: 0 },
};

const KEY = '23.81,90.41';           // cacheKey(23.8103, 90.4125)
const COORD = { id: 'dhaka', lat: 23.8103, lng: 90.4125 };

let fetchSpy;
let errorSpy;
let warnSpy;

const respond = (payload) => new Response(JSON.stringify(payload), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

beforeEach(() => {
  clearCache();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const latitude = new URL(String(url)).searchParams.get('latitude') || '';
    return respond(latitude.includes(',') ? UPSTREAM_ARRAY : UPSTREAM_OBJECT);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  clearCache();
});

describe('assertComplete — a _meta without a data block is a defect', () => {
  test('names the missing fields on the exact hollow payload', () => {
    const result = assertComplete(HOLLOW_POINT);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('latitude');
    expect(result.missing).toContain('longitude');
    expect(result.missing).toContain('one data block (current/hourly/daily)');
  });

  test('accepts a real point and rejects one whose current block has no readings', () => {
    expect(assertComplete({
      latitude: 23.796133,
      longitude: 90.38055,
      current: UPSTREAM_OBJECT.current,
      _meta: { source: 'open-meteo' },
    }).ok).toBe(true);
    expect(assertComplete({
      latitude: 23.796133, longitude: 90.38055,
      current: { time: '2026-10-27T22:30', interval: 900 },
      _meta: { current_vars: 0 },
    }).missing).toContain('a numeric reading');
    // An hourly time series counts as a data block, even without `current`.
    expect(assertComplete({
      latitude: 1, longitude: 2,
      hourly: { time: ['2026-10-27T00:00'], temperature_2m: [28.4] },
    }).ok).toBe(true);
  });
});

describe('openMeteo cache — the poisoned-cache regression', () => {
  test('read guard rejects a hollow {id,_meta}, re-fetch writes a complete point, second read is complete', async () => {
    seedCacheEntry(KEY, HOLLOW_POINT);
    expect(peekCacheEntry(KEY).data).toEqual(HOLLOW_POINT);   // the poison is really there

    const first = await fetchCurrentWeather(COORD.lat, COORD.lng);
    expect(fetchSpy).toHaveBeenCalledTimes(1);                // the read was a miss, so re-fetch
    expect(first.current.temperature_2m).toBe(UPSTREAM_OBJECT.current.temperature_2m);
    expect(first.current.wind_direction_10m).toBe(173);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('read guard rejected'));

    const stored = peekCacheEntry(KEY).data;
    expect(assertComplete(stored).ok).toBe(true);
    expect(stored.current.temperature_2m).toBe(31.1);

    const second = await fetchCurrentWeather(COORD.lat, COORD.lng);
    expect(fetchSpy).toHaveBeenCalledTimes(1);                // no second upstream call
    expect(second).toEqual(first);                            // cached object === returned object
  });

  test('the same guard holds for the batch path', async () => {
    seedCacheEntry(KEY, HOLLOW_POINT);
    const points = await fetchCurrentWeatherBatch([COORD]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(points[0].current.temperature_2m).toBe(31.1);
    expect(assertComplete(peekCacheEntry(KEY).data).ok).toBe(true);

    const again = await fetchCurrentWeatherBatch([COORD]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(again[0]._meta.cached_at).toBe(points[0]._meta.cached_at);
  });

  test('a fresh hollow upstream response is refused at the write and returned as a 502', async () => {
    fetchSpy.mockImplementation(async () => respond({
      latitude: 23.796133,
      longitude: 90.38055,
      current: { time: '2026-10-27T22:30' },      // no readings at all
    }));
    await expect(fetchCurrentWeather(COORD.lat, COORD.lng)).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('missing a numeric reading'),
    });
    expect(peekCacheEntry(KEY)).toBeUndefined();              // pre-write guard: no write
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('write guard rejected'));
  });
});

describe('the other two read-through caches', () => {
  test('markdown: empty document is refused on write and treated as a miss on read', () => {
    const cache = createVerifiedCache({
      ttlMs: Infinity,
      label: 'markdown-test',
      validate: (entry) => assertMarkdownContent(entry && entry.data),
      onReject: () => {},
    });
    expect(cache.set('/a.md', { data: '' }).ok).toBe(false);
    expect(cache.peek('/a.md')).toBeUndefined();
    cache.seed('/a.md', { data: '' });                       // simulate an old poisoned entry
    expect(cache.get('/a.md').hit).toBe(false);
    expect(cache.peek('/a.md')).toBeUndefined();
    expect(cache.set('/a.md', { data: '# Dhaka\n' }).ok).toBe(true);
    expect(cache.get('/a.md').entry.data).toBe('# Dhaka\n');
    // `null` is the documented negative hit, not a hollow value.
    expect(cache.set('/missing.md', { data: null }).ok).toBe(true);
    expect(cache.get('/missing.md').entry.data).toBeNull();
  });

  test('advisory: an empty generation is refused and a seeded one is a miss', () => {
    const cache = createVerifiedCache({
      ttlMs: 10 * 60 * 1000,
      label: 'advisory-test',
      validate: (entry) => assertAdvisory(entry && entry.data),
      onReject: () => {},
    });
    expect(assertAdvisory({ data: {} }).ok).toBe(false);
    expect(cache.set('k', { data: {} }).ok).toBe(false);
    cache.seed('k', { data: undefined });
    expect(cache.get('k').hit).toBe(false);
    expect(cache.set('k', { data: { summary: 'WATCH', cached: false } }).ok).toBe(true);
    expect(cache.get('k').entry.data.summary).toBe('WATCH');
  });
});

describe('static invariant — every write site is guarded or dated in the register', () => {
  const register = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/ops/cache-write-register.json'), 'utf8'));
  const roots = ['functions', 'serverless', 'backend'];
  const WRITE_LINE = /(?:\w*[Cc]ache|\bhits|\bsubscriptions|\bmemoryDocs|\bdistrictMap|\btransaction|\btarget)\.set\(|CACHE\.put|KV\.put|\bexpires\b|new Map\(Object\.entries\(routes\)\)/;

  function sourceFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) sourceFiles(full, out);
      else if (/\.(js|ts|mjs|cjs)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  test('register snippets exist, and no unregistered write line exists', () => {
    expect(register.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const site of register.writeSites) {
      const full = path.join(ROOT, site.file);
      expect(fs.existsSync(full)).toBe(true);
      expect(fs.readFileSync(full, 'utf8')).toContain(site.snippet);
      if (site.status === 'guarded') expect(site.guard).toBeTruthy();
      else {
        expect(site.status).toBe('dispositioned');
        expect(site.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(site.reason.length).toBeGreaterThan(30);
      }
    }

    const unregistered = [];
    for (const root of roots) {
      for (const file of sourceFiles(path.join(ROOT, root))) {
        const relative = path.relative(ROOT, file).replace(/\\/g, '/');
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, index) => {
          if (!WRITE_LINE.test(line)) return;
          const covered = register.writeSites.some((site) => site.file === relative && line.includes(site.snippet));
          if (!covered) unregistered.push(`${relative}:${index + 1}: ${line.trim().slice(0, 110)}`);
        });
      }
    }
    expect(unregistered).toEqual([]);
  });
});

describe('static invariant — no unguarded cache write in the three read-through caches', () => {
  const files = [
    'backend/utils/openMeteo.js',
    'backend/middleware/markdownNegotiation.js',
    'backend/utils/ai_fallback_engine.js',
  ];
  test('each cache is created by createVerifiedCache and each write checks its guard', () => {
    for (const file of files) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(source).toContain('createVerifiedCache(');
      expect(source).not.toMatch(/const\s+\w*[Cc]ache\s*=\s*new Map\(\)/);
      // Every `.set(` on a cache is either assigned to `guard` (and checked) or is the
      // negative markdown hit whose value is `null` (validated by the wrapper).
      for (const line of source.split('\n').filter((l) => /\b(?:advisoryCache|cache)\.set\(/.test(l))) {
        expect(line).toMatch(/guard|data: null|console\.warn/);
      }
    }
  });
});
