/**
 * Live client for the Kaggle Dataset API (advisory forecasts).
 *
 * Why this exists: the daily GitHub workflow ingests the advisory CSV into the committed
 * snapshot, which lags by up to a day. The Advisories page needs the value Kaggle serves
 * now, so the backend asks the Kaggle Dataset API itself and caches the answer.
 *
 * Credentials are read from the server environment only:
 *   KAGGLE_USERNAME, KAGGLE_KEY        (Kaggle legacy API credentials, sent as HTTP Basic)
 * They are never sent to the browser, never logged, and never written to disk or to a
 * response body. Optional overrides: KAGGLE_DATASET, KAGGLE_CSV_FILE, KAGGLE_API_BASE,
 * KAGGLE_REFRESH_MINUTES, KAGGLE_CACHE_FILE.
 *
 * Failure policy (fail closed, never fall back to a static baseline):
 *   - fresh fetch succeeds      -> status "fresh"
 *   - fetch fails, cache exists -> status "stale", with the last successfully fetched rows
 *                                  and the error that stopped the refresh
 *   - fetch fails, no cache     -> status "unavailable", no rows
 */

import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { ADVISORY_CSV_COLUMNS, mapAdvisoryRows } from '../utils/advisoryMapper.js';

export const DEFAULT_DATASET = 'ashifahmedshuvo/hazardnet-weekly-forecasts';
export const DEFAULT_CSV_FILE = 'hazardnet_advisories_latest.csv';
export const DEFAULT_API_BASE = 'https://www.kaggle.com';
export const DEFAULT_REFRESH_MINUTES = 60;
const FETCH_TIMEOUT_MS = 30_000;

export class KaggleClientError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = 'KaggleClientError';
    this.code = code;
    this.status = status;
  }
}

/** Read configuration from the environment. Pure: pass `env` in tests. */
export function readKaggleConfig(env = process.env) {
  const username = (env.KAGGLE_USERNAME || '').trim();
  const key = (env.KAGGLE_KEY || '').trim();
  const refreshMinutes = Number.parseFloat(env.KAGGLE_REFRESH_MINUTES || '');
  return {
    username,
    key,
    hasCredentials: Boolean(username && key),
    dataset: (env.KAGGLE_DATASET || '').trim() || DEFAULT_DATASET,
    fileName: (env.KAGGLE_CSV_FILE || '').trim() || DEFAULT_CSV_FILE,
    apiBase: ((env.KAGGLE_API_BASE || '').trim() || DEFAULT_API_BASE).replace(/\/$/, ''),
    refreshMs: (Number.isFinite(refreshMinutes) && refreshMinutes > 0 ? refreshMinutes : DEFAULT_REFRESH_MINUTES) * 60_000,
    cacheFile: (env.KAGGLE_CACHE_FILE || '').trim() || join(tmpdir(), 'hazardnet-kaggle-advisory.json'),
  };
}

/** Kaggle Dataset API download URL for one file of a dataset. */
export function datasetDownloadUrl(config) {
  return `${config.apiBase}/api/v1/datasets/download/${config.dataset}?file_name=${encodeURIComponent(config.fileName)}`;
}

/**
 * Read one entry out of a zip archive using only node:zlib (stored or deflate).
 * Reads the central directory, so it works without a zip library. Zip64 is not supported.
 */
export function extractZipEntry(buffer, fileName) {
  const EOCD = 0x06054b50;
  const CEN = 0x02014b50;
  const LOC = 0x04034b50;
  const bad = (why) => new KaggleClientError('BAD_ARCHIVE', `Kaggle archive is unreadable: ${why}`);

  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65_557); i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw bad('no end-of-central-directory record');

  const count = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  const wanted = fileName.toLowerCase();
  for (let n = 0; n < count; n += 1) {
    if (buffer.readUInt32LE(p) !== CEN) throw bad('broken central directory');
    const method = buffer.readUInt16LE(p + 10);
    const compSize = buffer.readUInt32LE(p + 20);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const localOffset = buffer.readUInt32LE(p + 42);
    const entryName = buffer.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    const base = entryName.split('/').pop().toLowerCase();
    if (entryName.toLowerCase() === wanted || base === wanted) {
      if (buffer.readUInt32LE(localOffset) !== LOC) throw bad('broken local header');
      const localName = buffer.readUInt16LE(localOffset + 26);
      const localExtra = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localName + localExtra;
      const data = buffer.subarray(start, start + compSize);
      if (method === 0) return data.toString('utf8');
      if (method === 8) return inflateRawSync(data).toString('utf8');
      throw bad(`unsupported compression method ${method}`);
    }
  }
  throw new KaggleClientError('ARCHIVE_ENTRY_MISSING', `"${fileName}" is not in the Kaggle archive`);
}

/** `generated_at` is naive UTC in the CSV. Normalise it the same way the ingest fetcher does. */
export function toIsoUtc(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalised = value.trim().replace(' ', 'T');
  const stamp = Date.parse(`${normalised}${/[zZ]|[+-]\d\d:?\d\d$/.test(normalised) ? '' : 'Z'}`);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString() : null;
}

/** Split one CSV line, honouring double-quoted fields and "" escapes. */
function splitCsvLine(line) {
  const cells = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(field); field = ''; }
    else field += ch;
  }
  cells.push(field);
  return cells;
}

/**
 * Parse the advisory CSV into validated forecast rows.
 * Throws if a required column is missing or any row fails the mapper. A partly valid file
 * is rejected whole, so a bad publication cannot silently replace good data.
 */
export function parseAdvisoryCsv(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new KaggleClientError('EMPTY_FILE', 'Kaggle returned an empty advisory file');
  }
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const header = splitCsvLine(lines[0]).map((c) => c.trim());
  const missing = ADVISORY_CSV_COLUMNS.filter((col) => !header.includes(col));
  if (missing.length > 0) {
    throw new KaggleClientError('SCHEMA_MISMATCH', `Advisory file is missing columns: ${missing.join(', ')}`);
  }
  const rawRows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(header.map((col, idx) => [col, cells[idx] ?? '']));
  });
  if (rawRows.length === 0) {
    throw new KaggleClientError('EMPTY_FILE', 'Advisory file has a header but no rows');
  }
  let rows;
  try {
    rows = mapAdvisoryRows(rawRows);
  } catch (err) {
    throw new KaggleClientError('INVALID_ROWS', `Advisory file failed validation: ${err.message}`);
  }
  const generatedAt = rawRows.map((r) => r.generated_at).find((v) => v && v.trim()) || null;
  return { rows, generatedAt, rowCount: rows.length };
}

/** One HTTPS request to the Kaggle Dataset API. Never includes the key in an error. */
export async function fetchAdvisoryFile(config, { fetchImpl = globalThis.fetch } = {}) {
  if (!config.hasCredentials) {
    throw new KaggleClientError('NO_CREDENTIALS', 'KAGGLE_USERNAME and KAGGLE_KEY are not set on the server');
  }
  const auth = Buffer.from(`${config.username}:${config.key}`).toString('base64');
  let res;
  try {
    res = await fetchImpl(datasetDownloadUrl(config), {
      headers: { Authorization: `Basic ${auth}`, Accept: '*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new KaggleClientError('NETWORK', `Could not reach the Kaggle Dataset API (${err.name || 'error'})`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new KaggleClientError('AUTH_FAILED', 'Kaggle rejected the server credentials', res.status);
  }
  if (res.status === 404) {
    throw new KaggleClientError('NOT_FOUND', `Kaggle dataset or file not found: ${config.dataset} / ${config.fileName}`, 404);
  }
  if (!res.ok) {
    throw new KaggleClientError('HTTP_ERROR', `Kaggle Dataset API responded ${res.status}`, res.status);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const isZip = buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50;
  const text = isZip ? extractZipEntry(buffer, config.fileName) : buffer.toString('utf8');
  return {
    text,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    bytes: buffer.length,
  };
}

/** Fetch, parse and validate one snapshot. Pure apart from the network call. */
export async function fetchAdvisorySnapshot(config, options = {}) {
  const file = await fetchAdvisoryFile(config, options);
  const parsed = parseAdvisoryCsv(file.text);
  return {
    source: 'kaggle',
    dataset: config.dataset,
    file: config.fileName,
    fetchedAt: new Date((options.now ?? Date.now())).toISOString(),
    generatedAt: toIsoUtc(parsed.generatedAt),
    sha256: file.sha256,
    bytes: file.bytes,
    rowCount: parsed.rowCount,
    rows: parsed.rows,
  };
}

// ---- cache -----------------------------------------------------------------------------

const memory = { last: null, lastError: null, inFlight: null, loadedFrom: null };

function loadCache(cacheFile) {
  if (memory.loadedFrom === cacheFile) return;
  memory.loadedFrom = cacheFile;
  try {
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
    if (cached && Array.isArray(cached.rows) && cached.fetchedAt) memory.last = cached;
  } catch {
    // No cache yet, or unreadable. Both mean "no last good value".
  }
}

function saveCache(cacheFile, snapshot) {
  try {
    mkdirSync(dirname(cacheFile), { recursive: true });
    const tmp = `${cacheFile}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(snapshot));
    renameSync(tmp, cacheFile);
  } catch {
    // Persisting is best effort. The in-memory copy still serves this process.
  }
}

/** Reset the in-memory cache. Used by tests. */
export function resetKaggleCache() {
  memory.last = null;
  memory.lastError = null;
  memory.inFlight = null;
  memory.loadedFrom = null;
}

/**
 * Current advisory snapshot, served from cache inside the refresh window.
 * Returns { status: 'fresh' | 'stale' | 'unavailable', ... } and never throws.
 */
export async function getKaggleAdvisories({
  config = readKaggleConfig(),
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  force = false,
} = {}) {
  loadCache(config.cacheFile);

  const last = memory.last;
  const age = last ? now - Date.parse(last.fetchedAt) : Infinity;
  if (!force && last && age < config.refreshMs && last.dataset === config.dataset && last.file === config.fileName) {
    return { ...last, status: 'fresh', lastError: memory.lastError };
  }

  if (!memory.inFlight) {
    memory.inFlight = (async () => {
      try {
        const snapshot = await fetchAdvisorySnapshot(config, { fetchImpl, now });
        memory.last = snapshot;
        memory.lastError = null;
        saveCache(config.cacheFile, snapshot);
        return { ...snapshot, status: 'fresh', lastError: null };
      } catch (err) {
        const lastError = {
          code: err.code || 'UNKNOWN',
          message: err.message || 'Kaggle refresh failed',
          at: new Date(now).toISOString(),
        };
        memory.lastError = lastError;
        if (memory.last && memory.last.dataset === config.dataset && memory.last.file === config.fileName) {
          return { ...memory.last, status: 'stale', lastError };
        }
        return { status: 'unavailable', source: 'kaggle', dataset: config.dataset, file: config.fileName, fetchedAt: null, generatedAt: null, rowCount: 0, rows: [], lastError };
      } finally {
        memory.inFlight = null;
      }
    })();
  }
  return memory.inFlight;
}
