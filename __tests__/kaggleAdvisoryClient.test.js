/**
 * kaggleAdvisoryClient.test.js
 *
 * Tests for backend/services/kaggleAdvisoryClient.js. No test touches the network:
 * every case injects `fetchImpl`, and every cache lives in a temp directory.
 *
 * Runs via both `node --test` and Jest.
 */

import assert from 'node:assert';
import * as nodeTest from 'node:test';
import { deflateRawSync, crc32 } from 'node:zlib';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const describe = globalThis.describe ?? nodeTest.describe;
const test = globalThis.test ?? nodeTest.test;
const afterEach = globalThis.afterEach ?? nodeTest.afterEach;

import {
  ADVISORY_CSV_COLUMNS,
  DISTRICT_REGISTRY,
} from '../backend/utils/advisoryMapper.js';
import {
  DEFAULT_CSV_FILE,
  DEFAULT_DATASET,
  KaggleClientError,
  datasetDownloadUrl,
  extractZipEntry,
  fetchAdvisoryFile,
  getKaggleAdvisories,
  parseAdvisoryCsv,
  readKaggleConfig,
  resetKaggleCache,
  toIsoUtc,
} from '../backend/services/kaggleAdvisoryClient.js';

const tempDirs = [];
function tempCacheFile() {
  const dir = mkdtempSync(join(tmpdir(), 'kaggle-client-test-'));
  tempDirs.push(dir);
  return join(dir, 'cache.json');
}

afterEach(() => {
  resetKaggleCache();
  while (tempDirs.length) rmSync(tempDirs.pop(), { recursive: true, force: true });
});

/** A valid advisory CSV: every registry district for both horizons, as in advisoryPipeline.test.js. */
function makeCsv(overrides = {}) {
  const lines = [ADVISORY_CSV_COLUMNS.join(',')];
  for (const district of DISTRICT_REGISTRY) {
    for (const horizon of ['7_days', '15_days']) {
      const row = [
        overrides.district || district.district_name,
        district.division,
        district.latitude,
        district.longitude,
        horizon,
        'Flood',
        0.88, 0.72, 0.75, 0.70, overrides.final_severity ?? 0.74,
        'false',
        overrides.advisory_tier || 'WARNING',
        '2026-10-05',
        overrides.generated_at || '2026-10-09 06:00:00',
        32.5, 24.1, 45.2, 18.5,
        0.88, 0.08, 0.04,
      ];
      lines.push(row.join(','));
    }
  }
  return lines.join('\n');
}

/** Build a zip archive in memory. `method` 0 = stored, 8 = deflate. */
function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, text, method = 0 } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.from(text, 'utf8');
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

/** Minimal Response-like object for an injected fetch. */
function response(status, body = Buffer.alloc(0)) {
  return {
    status,
    ok: status >= 200 && status < 300,
    arrayBuffer: async () => body,
    text: async () => Buffer.from(body).toString('utf8'),
  };
}

const CREDS = { KAGGLE_USERNAME: 'sample-user', KAGGLE_KEY: 'sample-key-do-not-leak' };

function configWith(extra = {}) {
  return readKaggleConfig({ ...CREDS, KAGGLE_CACHE_FILE: tempCacheFile(), ...extra });
}

describe('kaggleAdvisoryClient: configuration', () => {
  test('defaults point at the published dataset and file', () => {
    const config = readKaggleConfig({});
    assert.strictEqual(config.dataset, DEFAULT_DATASET);
    assert.strictEqual(config.dataset, 'ashifahmedshuvo/hazardnet-weekly-forecasts');
    assert.strictEqual(config.fileName, DEFAULT_CSV_FILE);
    assert.strictEqual(config.fileName, 'hazardnet_advisories_latest.csv');
    assert.strictEqual(config.apiBase, 'https://www.kaggle.com');
    assert.strictEqual(config.refreshMs, 60 * 60_000);
    assert.strictEqual(config.hasCredentials, false);
  });

  test('reads credentials and overrides from the environment', () => {
    const config = readKaggleConfig({
      KAGGLE_USERNAME: ' u ',
      KAGGLE_KEY: ' k ',
      KAGGLE_REFRESH_MINUTES: '15',
      KAGGLE_API_BASE: 'https://example.test/',
    });
    assert.strictEqual(config.username, 'u');
    assert.strictEqual(config.key, 'k');
    assert.strictEqual(config.hasCredentials, true);
    assert.strictEqual(config.refreshMs, 15 * 60_000);
    assert.strictEqual(config.apiBase, 'https://example.test');
  });

  test('a username without a key is not a credential pair', () => {
    assert.strictEqual(readKaggleConfig({ KAGGLE_USERNAME: 'u' }).hasCredentials, false);
  });

  test('builds the download URL with the file name encoded', () => {
    const url = datasetDownloadUrl(readKaggleConfig({}));
    assert.strictEqual(
      url,
      'https://www.kaggle.com/api/v1/datasets/download/ashifahmedshuvo/hazardnet-weekly-forecasts?file_name=hazardnet_advisories_latest.csv',
    );
  });
});

describe('kaggleAdvisoryClient: requests', () => {
  test('no credentials means no network call', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response(200); };
    await assert.rejects(
      fetchAdvisoryFile(readKaggleConfig({}), { fetchImpl }),
      (err) => err instanceof KaggleClientError && err.code === 'NO_CREDENTIALS',
    );
    assert.strictEqual(calls, 0);
  });

  test('sends HTTP Basic auth built from the username and key', async () => {
    let seen = null;
    const csv = Buffer.from(makeCsv(), 'utf8');
    const fetchImpl = async (url, init) => { seen = { url, init }; return response(200, csv); };
    await fetchAdvisoryFile(configWith(), { fetchImpl });
    assert.strictEqual(seen.init.headers.Authorization, `Basic ${Buffer.from('sample-user:sample-key-do-not-leak').toString('base64')}`);
    assert.ok(seen.url.startsWith('https://www.kaggle.com/api/v1/datasets/download/'));
  });

  test('a 401 is reported as AUTH_FAILED and the key never appears in the message', async () => {
    const fetchImpl = async () => response(401);
    await assert.rejects(fetchAdvisoryFile(configWith(), { fetchImpl }), (err) => {
      assert.strictEqual(err.code, 'AUTH_FAILED');
      assert.strictEqual(err.status, 401);
      assert.ok(!err.message.includes('sample-key-do-not-leak'));
      assert.ok(!err.message.includes('sample-user'));
      return true;
    });
  });

  test('a network failure is reported without leaking the key', async () => {
    const fetchImpl = async () => { throw Object.assign(new Error('getaddrinfo ENOTFOUND sample-key-do-not-leak'), { name: 'TypeError' }); };
    await assert.rejects(fetchAdvisoryFile(configWith(), { fetchImpl }), (err) => {
      assert.strictEqual(err.code, 'NETWORK');
      assert.ok(!err.message.includes('sample-key-do-not-leak'));
      return true;
    });
  });
});

describe('kaggleAdvisoryClient: archive handling', () => {
  test('reads a stored (uncompressed) entry from a zip', () => {
    const csv = makeCsv();
    const zip = makeZip([{ name: 'hazardnet_advisories_latest.csv', text: csv, method: 0 }]);
    assert.strictEqual(extractZipEntry(zip, 'hazardnet_advisories_latest.csv'), csv);
  });

  test('reads a deflated entry and matches a nested path by basename', () => {
    const csv = makeCsv();
    const zip = makeZip([
      { name: 'readme.txt', text: 'hello', method: 0 },
      { name: 'out/hazardnet_advisories_latest.csv', text: csv, method: 8 },
    ]);
    assert.strictEqual(extractZipEntry(zip, 'hazardnet_advisories_latest.csv'), csv);
  });

  test('a missing entry is a typed error', () => {
    const zip = makeZip([{ name: 'other.csv', text: 'x', method: 0 }]);
    assert.throws(() => extractZipEntry(zip, 'hazardnet_advisories_latest.csv'), (err) => err.code === 'ARCHIVE_ENTRY_MISSING');
  });

  test('a non-zip buffer is a typed BAD_ARCHIVE error', () => {
    assert.throws(() => extractZipEntry(Buffer.from('not a zip at all, just text'), 'x.csv'), (err) => err.code === 'BAD_ARCHIVE');
  });

  test('a zip served by fetch is unpacked before parsing', async () => {
    const csv = makeCsv();
    const zip = makeZip([{ name: DEFAULT_CSV_FILE, text: csv, method: 8 }]);
    const file = await fetchAdvisoryFile(configWith(), { fetchImpl: async () => response(200, zip) });
    assert.strictEqual(file.text, csv);
    assert.strictEqual(file.bytes, zip.length);
    assert.strictEqual(file.sha256.length, 64);
  });
});

describe('kaggleAdvisoryClient: CSV parsing', () => {
  test('parses every registry district for both horizons', () => {
    const { rows, rowCount, generatedAt } = parseAdvisoryCsv(makeCsv());
    assert.strictEqual(rowCount, DISTRICT_REGISTRY.length * 2);
    assert.strictEqual(rows.length, DISTRICT_REGISTRY.length * 2);
    assert.strictEqual(generatedAt, '2026-10-09 06:00:00');
    const kurigram = rows.find((r) => r.district_name === 'Kurigram' && r.horizon === '7_days');
    assert.ok(kurigram, 'Kurigram 7_days row present');
    assert.strictEqual(kurigram.final_severity, 0.74);
    assert.strictEqual(kurigram.advisory_tier, 'WARNING');
  });

  test('a missing required column rejects the whole file', () => {
    const header = ADVISORY_CSV_COLUMNS.filter((c) => c !== 'final_severity').join(',');
    const text = makeCsv().split('\n').slice(1).join('\n');
    assert.throws(() => parseAdvisoryCsv([header, text].join('\n')), (err) => err.code === 'SCHEMA_MISMATCH' && err.message.includes('final_severity'));
  });

  test('one invalid row rejects the whole file, not just that row', () => {
    const text = makeCsv({ district: 'Not A Real District' });
    assert.throws(() => parseAdvisoryCsv(text), (err) => err.code === 'INVALID_ROWS');
  });

  test('an empty body is EMPTY_FILE', () => {
    assert.throws(() => parseAdvisoryCsv('   '), (err) => err.code === 'EMPTY_FILE');
  });

  test('a header with no rows is EMPTY_FILE', () => {
    assert.throws(() => parseAdvisoryCsv(ADVISORY_CSV_COLUMNS.join(',')), (err) => err.code === 'EMPTY_FILE');
  });

  test('generated_at is normalised to ISO UTC, as the ingest fetcher does', () => {
    assert.strictEqual(toIsoUtc('2026-10-09 06:00:00'), '2026-10-09T06:00:00.000Z');
    assert.strictEqual(toIsoUtc('2026-10-09T06:00:00+06:00'), '2026-10-09T00:00:00.000Z');
    assert.strictEqual(toIsoUtc(''), null);
    assert.strictEqual(toIsoUtc(undefined), null);
  });
});

describe('kaggleAdvisoryClient: snapshot cache', () => {
  test('a successful fetch is fresh and is served from cache inside the window', async () => {
    let calls = 0;
    const csv = Buffer.from(makeCsv(), 'utf8');
    const fetchImpl = async () => { calls += 1; return response(200, csv); };
    const config = configWith();
    const t0 = Date.parse('2026-10-10T00:00:00Z');

    const first = await getKaggleAdvisories({ config, fetchImpl, now: t0 });
    assert.strictEqual(first.status, 'fresh');
    assert.strictEqual(first.fetchedAt, '2026-10-10T00:00:00.000Z');
    assert.strictEqual(first.generatedAt, '2026-10-09T06:00:00.000Z');
    assert.strictEqual(first.rows.length, DISTRICT_REGISTRY.length * 2);
    assert.strictEqual(calls, 1);

    const second = await getKaggleAdvisories({ config, fetchImpl, now: t0 + 30 * 60_000 });
    assert.strictEqual(second.status, 'fresh');
    assert.strictEqual(calls, 1, 'no second request inside the refresh window');

    const third = await getKaggleAdvisories({ config, fetchImpl, now: t0 + 61 * 60_000 });
    assert.strictEqual(third.status, 'fresh');
    assert.strictEqual(calls, 2, 'a request after the window');
  });

  test('the snapshot is written to the cache file without credentials', async () => {
    const csv = Buffer.from(makeCsv(), 'utf8');
    const config = configWith();
    await getKaggleAdvisories({ config, fetchImpl: async () => response(200, csv), now: Date.now() });
    const onDisk = readFileSync(config.cacheFile, 'utf8');
    assert.ok(onDisk.includes('"rows"'));
    assert.ok(!onDisk.includes('sample-key-do-not-leak'), 'key must not be written to disk');
    assert.ok(!onDisk.includes('sample-user'), 'username must not be written to disk');
    assert.ok(existsSync(config.cacheFile));
  });

  test('a failed refresh after a good fetch is stale, with the last rows and the error', async () => {
    const csv = Buffer.from(makeCsv(), 'utf8');
    const config = configWith();
    const t0 = Date.parse('2026-10-10T00:00:00Z');
    await getKaggleAdvisories({ config, fetchImpl: async () => response(200, csv), now: t0 });

    const later = t0 + 2 * 60 * 60_000;
    const stale = await getKaggleAdvisories({ config, fetchImpl: async () => response(401), now: later });
    assert.strictEqual(stale.status, 'stale');
    assert.strictEqual(stale.fetchedAt, '2026-10-10T00:00:00.000Z', 'shows when the rows were last fetched');
    assert.strictEqual(stale.rows.length, DISTRICT_REGISTRY.length * 2);
    assert.strictEqual(stale.lastError.code, 'AUTH_FAILED');
    assert.ok(!JSON.stringify(stale).includes('sample-key-do-not-leak'));
  });

  test('a failed fetch with no cache is unavailable, with no rows', async () => {
    const config = configWith();
    const result = await getKaggleAdvisories({ config, fetchImpl: async () => response(500), now: Date.now() });
    assert.strictEqual(result.status, 'unavailable');
    assert.deepStrictEqual(result.rows, []);
    assert.strictEqual(result.fetchedAt, null);
    assert.strictEqual(result.lastError.code, 'HTTP_ERROR');
  });

  test('missing credentials with no cache is unavailable and never calls fetch', async () => {
    let calls = 0;
    const config = readKaggleConfig({ KAGGLE_CACHE_FILE: tempCacheFile() });
    const result = await getKaggleAdvisories({ config, fetchImpl: async () => { calls += 1; return response(200); }, now: Date.now() });
    assert.strictEqual(calls, 0);
    assert.strictEqual(result.status, 'unavailable');
    assert.strictEqual(result.lastError.code, 'NO_CREDENTIALS');
  });

  test('a cache written by an earlier process is used as the stale fallback', async () => {
    const csv = Buffer.from(makeCsv(), 'utf8');
    const config = configWith();
    await getKaggleAdvisories({ config, fetchImpl: async () => response(200, csv), now: Date.parse('2026-10-10T00:00:00Z') });
    resetKaggleCache(); // simulate a restart: memory is empty, the file is not
    const result = await getKaggleAdvisories({ config, fetchImpl: async () => response(503), now: Date.parse('2026-10-10T05:00:00Z') });
    assert.strictEqual(result.status, 'stale');
    assert.strictEqual(result.rows.length, DISTRICT_REGISTRY.length * 2);
  });

  test('a cache for a different dataset is not served', async () => {
    const csv = Buffer.from(makeCsv(), 'utf8');
    const cacheFile = tempCacheFile();
    await getKaggleAdvisories({ config: configWith({ KAGGLE_CACHE_FILE: cacheFile }), fetchImpl: async () => response(200, csv), now: Date.now() });
    resetKaggleCache();
    const other = configWith({ KAGGLE_CACHE_FILE: cacheFile, KAGGLE_DATASET: 'someone/else' });
    const result = await getKaggleAdvisories({ config: other, fetchImpl: async () => response(500), now: Date.now() });
    assert.strictEqual(result.status, 'unavailable');
  });

  test('concurrent callers share one network request', async () => {
    let calls = 0;
    const csv = Buffer.from(makeCsv(), 'utf8');
    const fetchImpl = async () => { calls += 1; await new Promise((r) => setTimeout(r, 10)); return response(200, csv); };
    const config = configWith();
    const now = Date.now();
    const [a, b] = await Promise.all([
      getKaggleAdvisories({ config, fetchImpl, now }),
      getKaggleAdvisories({ config, fetchImpl, now }),
    ]);
    assert.strictEqual(calls, 1);
    assert.strictEqual(a.status, 'fresh');
    assert.strictEqual(b.status, 'fresh');
  });
});
