import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

export const DEFAULT_MAX_AGE_HOURS = 36;

export function datasetDownloadUrl(
  datasetSlug = 'ashifahmedshuvo/hazardnet-weekly-forecasts',
  fileName = 'hazardnet_advisories_latest.csv'
) {
  return `https://www.kaggle.com/api/v1/datasets/download/${datasetSlug}?file_name=${encodeURIComponent(fileName)}`;
}

export function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

export function inspectCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') {
    return { rows: 0, generatedAt: null, columns: [], sha256: null };
  }
  const lines = csvText.trim().split('\n').filter((l) => l.trim().length > 0);
  if (lines.length <= 1) {
    return { rows: 0, generatedAt: null, columns: lines.length === 1 ? parseCsvLine(lines[0]) : [], sha256: null };
  }

  const columns = parseCsvLine(lines[0]);
  const genAtIndex = columns.indexOf('generated_at');
  const dataLines = lines.slice(1);
  const firstRow = parseCsvLine(dataLines[0]);
  const generatedAt = genAtIndex !== -1 ? firstRow[genAtIndex] : null;
  const sha256 = crypto.createHash('sha256').update(csvText).digest('hex');

  return {
    rows: dataLines.length,
    generatedAt: generatedAt || null,
    columns,
    sha256,
  };
}

export function parseGeneratedAt(str) {
  if (!str || typeof str !== 'string' || str === 'not a date' || str.trim() === '') {
    return null;
  }
  const normalized = str.includes('T') ? str : str.replace(' ', 'T') + (str.endsWith('Z') ? '' : 'Z');
  const dt = new Date(normalized);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

export function isNewerThan(current, previousManifest) {
  if (!previousManifest || Object.keys(previousManifest).length === 0) return true;
  if (previousManifest.generated_at === 'unknown' && !current.generatedAt) return false;

  const currentStamp = parseGeneratedAt(current.generatedAt);
  const prevStamp = parseGeneratedAt(previousManifest.generated_at);

  if (currentStamp && prevStamp) {
    const curTime = new Date(currentStamp).getTime();
    const prevTime = new Date(prevStamp).getTime();
    if (curTime > prevTime) return true;
    if (curTime === prevTime) {
      const prevSha = previousManifest.source_csv_sha256 || previousManifest.csv_sha256;
      if (current.sha256 && prevSha) {
        return current.sha256 !== prevSha;
      }
      return false;
    }
    return false;
  }

  if (!currentStamp && current.sha256) {
    const prevSha = previousManifest.source_csv_sha256 || previousManifest.csv_sha256;
    if (prevSha) {
      return current.sha256 !== prevSha;
    }
  }

  return false;
}

export function publicationAge(generatedAt, now = Date.now()) {
  if (!generatedAt) return null;
  const parsed = parseGeneratedAt(generatedAt);
  if (!parsed) return null;
  const dt = new Date(parsed);
  if (isNaN(dt.getTime())) return null;
  const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
  const diffMs = nowMs - dt.getTime();
  return diffMs / (1000 * 60 * 60);
}

export function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

/* ── main() — the pipeline entry point ─────────────────────────────────────────────
 *
 * The daily job fetches the advisory CSV from the Kaggle Dataset API. Failure modes this
 * must distinguish, because the workflow branches on the exit code:
 *
 *   0  a genuinely newer, in-gate CSV was downloaded (proceed to ingest)
 *   1  fatal: bad credentials, empty archive, unrecoverable network error
 *   2  the fetch succeeded but says "do not re-ingest": the CSV is unchanged since the
 *      manifest (the Kaggle notebook missed its daily schedule — the bug this script was
 *      written to catch), or the file is newer than the manifest but past the
 *      age gate (STALE_DATA: re-publishing it would launder an old run into a fresh
 *      artifact commit)
 *
 * Fetching anonymously works for public datasets; a failed anonymous fetch explains the
 * CLI/kernel fallback and the credentials it needs instead of pretending the committed
 * snapshot is today's data. `__tests__/fetchKaggleAdvisory.integration.test.js` drives all
 * of this against a local HTTP stub via KAGGLE_API_BASE.
 */

const CSV_NAME = 'hazardnet_advisories_latest.csv';
const DEFAULT_DATASET = 'ashifahmedshuvo/hazardnet-weekly-forecasts';
const DEFAULT_ATTEMPTS = 3;

/** Extract `memberName` from a zip archive (stored or deflated), without dependencies. */
export function unzipMember(buffer, memberName) {
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break; // end of local headers
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    if (name === memberName) {
      if (method === 0) return data.toString('utf8');
      if (method === 8) return zlib.inflateRawSync(data).toString('utf8');
      throw new Error(`zip member ${memberName} uses unsupported method ${method}`);
    }
    offset = dataStart + compressedSize;
  }
  throw new Error(`${memberName} not present in the archive`);
}

async function downloadCsv({ url, username, apiKey }) {
  const headers = { 'user-agent': 'hazardnet-fetch-advisory/1.0' };
  if (username && apiKey) {
    headers.authorization = `Basic ${Buffer.from(`${username}:${apiKey}`).toString('base64')}`;
  }
  const response = await fetch(url, { headers, redirect: 'follow' });
  if (response.status === 401 || response.status === 403) {
    const error = new Error(`Kaggle rejected the configured credentials (HTTP ${response.status})`);
    error.fatal = true;
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    throw new Error(`dataset download failed (HTTP ${response.status})`);
  }
  const contentType = String(response.headers.get('content-type') || '');
  const body = Buffer.from(await response.arrayBuffer());
  if (contentType.includes('zip')) {
    return unzipMember(body, CSV_NAME);
  }
  return body.toString('utf8');
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const outDir = typeof args.out === 'string' ? args.out : '/tmp/advisory-ingest';
  const maxAgeHours = typeof args['max-age-hours'] === 'string'
    ? parseFloat(args['max-age-hours'])
    : DEFAULT_MAX_AGE_HOURS;
  const attempts = Math.max(1, Number.isFinite(Number(args.attempts)) ? parseInt(args.attempts, 10) : DEFAULT_ATTEMPTS);
  const dataset = typeof args.dataset === 'string' ? args.dataset : DEFAULT_DATASET;
  const apiBase = (process.env.KAGGLE_API_BASE || 'https://www.kaggle.com').replace(/\/+$/, '');
  const username = process.env.KAGGLE_USERNAME;
  const apiKey = process.env.KAGGLE_KEY;
  const url = `${apiBase}/api/v1/datasets/download/${dataset}?file_name=${encodeURIComponent(CSV_NAME)}`;

  fs.mkdirSync(outDir, { recursive: true });
  const targetCsv = path.join(outDir, CSV_NAME);
  const reportPath = path.join(outDir, 'fetch-report.json');
  const manifestPath = typeof args.manifest === 'string'
    ? path.resolve(process.cwd(), args.manifest)
    : path.resolve(process.cwd(), 'backend/data/forecasts/manifest.json');

  let csvContent = null;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      csvContent = await downloadCsv({ url, username, apiKey });
      break;
    } catch (error) {
      lastError = error;
      if (error.fatal) {
        console.error(`[fetch] ${error.message}`);
        process.exit(1);
      }
      if (attempt < attempts) {
        console.warn(`[fetch] attempt ${attempt}/${attempts} failed (${error.message}); retrying…`);
        await new Promise((resolve) => setTimeout(resolve, 20_000));
      }
    }
  }
  if (csvContent === null) {
    const cause = lastError ? lastError.message : 'unknown';
    if (!username || !apiKey) {
      console.error(`[fetch] anonymous dataset download failed (${cause}); the Kaggle CLI/kernel ` +
        'fallback requires KAGGLE_USERNAME and KAGGLE_KEY');
    } else {
      console.error(`[fetch] dataset download failed after ${attempts} attempt(s): ${cause}`);
    }
    process.exit(1);
  }

  const info = inspectCsv(csvContent);
  if (info.rows === 0) {
    console.error(`[fetch] ${CSV_NAME} has no data rows (header only or unparseable)`);
    process.exit(1);
  }

  fs.writeFileSync(targetCsv, csvContent, 'utf8');

  let prevManifest = null;
  if (fs.existsSync(manifestPath)) {
    try {
      prevManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {}
  }

  const age = publicationAge(info.generatedAt);
  const stale = age !== null && age > maxAgeHours;
  // "newer" means newer AND ingestible: a past-gate CSV is reported as not newer, because
  // that is the decision the workflow asks about (the 2026-10-04 incident called a stale
  // fetch "fresh", the ingest then rejected it, and everything downstream silently skipped).
  const newer = !stale && isNewerThan(info, prevManifest);
  const report = {
    rows: info.rows,
    generatedAt: info.generatedAt ?? null,
    sha256: info.sha256,
    age_hours: age !== null ? Number(age.toFixed(2)) : null,
    newer,
    stale,
    via: `Kaggle API dataset download (${dataset})`,
    dataset,
    fetched_at: new Date().toISOString(),
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  if (stale && !args.force) {
    // The workflow reads the reason from stdout (it is attached to the job summary).
    console.log(
      `[fetch] STALE_DATA: downloaded CSV is ${age.toFixed(2)} h old — past the ` +
      `${maxAgeHours} h ingest gate; Kaggle may have published an older file. ` +
      'Re-run with --force to override (or widen with --max-age-hours).',
    );
    process.exit(2);
  }
  if (!newer && !args.force) {
    console.log(
      `[fetch] CSV unchanged since ${prevManifest?.generated_at || 'no manifest'} — ` +
      'the Kaggle notebook is scheduled daily; a healthy download of the same file means ' +
      'the schedule slipped, not that this ingest succeeded.',
    );
    process.exit(2);
  }

  console.log(`✅ Fetched ${info.rows} advisory rows (dataset download, ${dataset})`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && !process.env.JEST_WORKER_ID) {
  main().catch((error) => {
    console.error('[fetch] fatal:', error);
    process.exit(1);
  });
}
