#!/usr/bin/env node
/**
 * fetch_kaggle_advisory.mjs — pull the daily advisory CSV out of Kaggle.
 *
 * The Kaggle notebook (`8-hazardnet-advisory`) is scheduled to run daily and publishes
 * `hazardnet_advisories_latest.csv` into the dataset
 * `myself-aas/hazardnet-weekly-forecasts` (the public mirror:
 * https://www.kaggle.com/datasets/ashifahmedshuvo/hazardnet-weekly-forecasts). This script
 * is the download half of `daily_advisory_ingest.yml`; `process_advisory_ingest.mjs` is the
 * ingest half.
 *
 * Why this is a script and not three more lines of workflow bash:
 *
 *  - **Two sources, one of which may be down.** The durable artifact is the Kaggle
 *    dataset at the exact public slug the owner supplied; the kernel output is a cache of
 *    the last run. The workflow only ever tried the kernel, so a renamed slug, an expired
 *    key or a notebook that never completed looked identical. The script tries the dataset
 *    first (HTTP, then the CLI) and the kernel output last, and reports which one answered.
 *  - **"Did the notebook run?" is a different question from "did the download work?"**
 *    A successful download of yesterday's CSV is a *failure of the schedule*, not of the
 *    fetch. Both are common enough that conflating them costs a morning each time. The
 *    script compares the file against the committed manifest and exits **2 (unchanged)**
 *    so the workflow can skip the ingest and say which of the two happened.
 *  - **Retries belong here.** Kaggle's scheduler is not punctual to the minute; a 05:30 UTC
 *    cron can beat the notebook. `--wait-minutes` polls instead of failing.
 *
 * Exit codes:
 *   0  fetched, and the CSV is newer than what is committed → run the ingest
 *   2  fetched, but the CSV is identical or older → skip the ingest, warn (not an error)
 *   1  nothing could be fetched, or the CSV is unusable → fail the job
 *
 * Usage:
 *   node scripts/fetch_kaggle_advisory.mjs --out /tmp/advisory-ingest [--wait-minutes 90]
 *                                          [--attempts 3] [--force] [--quiet]
 *
 * Environment:
 *   KAGGLE_USERNAME / KAGGLE_KEY   credentials (Basic auth on the API; the CLI reads kaggle.json)
 *   KAGGLE_DATASET                 default `myself-aas/hazardnet-weekly-forecasts`
 *   KAGGLE_KERNEL                  default `8-hazardnet-advisory` (legacy fallback)
 *   ADVISORY_CSV_NAME              default `hazardnet_advisories_latest.csv`
 *   KAGGLE_API_BASE                default `https://www.kaggle.com` (point elsewhere to test)
 *
 * Flags mirror the env vars: `--dataset`, `--kernel`, `--api-base`, `--manifest`,
 * `--out`, `--wait-minutes`, `--attempts`, `--max-age-hours`, `--force`, `--quiet`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DEFAULT_MANIFEST = join(ROOT, 'backend', 'data', 'forecasts', 'manifest.json');
const DEFAULT_CSV_NAME = 'hazardnet_advisories_latest.csv';
// Match the exact public URL provided by the owner, not the old, non-existent
// `myself-aas/...` slug that had been inferred from the notebook namespace.
const DEFAULT_DATASET = 'ashifahmedshuvo/hazardnet-weekly-forecasts';
const DEFAULT_API_BASE = 'https://www.kaggle.com';

export const EXIT = { OK: 0, FAILED: 1, UNCHANGED: 2 };

/** Minimal argv reader: `--flag value` or a bare `--flag`. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i += 1; } else { out[key] = true; }
  }
  return out;
}

/**
 * The dataset download URL. `?file_name=` makes Kaggle return a single-file archive instead
 * of the whole dataset bundle.
 *
 * `base` is overridable so the whole fetch path can be exercised against a local server
 * (`KAGGLE_API_BASE`) instead of Kaggle — see
 * `__tests__/fetchKaggleAdvisory.integration.test.js`.
 */
export function datasetDownloadUrl(
  dataset = DEFAULT_DATASET,
  fileName = DEFAULT_CSV_NAME,
  base = DEFAULT_API_BASE,
) {
  const encoded = encodeURIComponent(fileName);
  return `${base.replace(/\/$/, '')}/api/v1/datasets/download/${dataset}?file_name=${encoded}`;
}

/** Read `generated_at` and the row count out of a CSV without a CSV library. */
export function inspectCsv(text) {
  if (typeof text !== 'string' || !text.trim()) return { rows: 0, generatedAt: null, columns: [] };
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return { rows: 0, generatedAt: null, columns: [] };
  const split = (line) => {
    const cells = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"') { if (line[i + 1] === '"') { field += '"'; i += 1; } else quoted = false; }
        else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { cells.push(field); field = ''; }
      else field += ch;
    }
    cells.push(field);
    return cells;
  };
  const columns = split(lines[0]).map((c) => c.trim());
  const rows = lines.slice(1);
  const generatedIndex = columns.indexOf('generated_at');
  let generatedAt = null;
  if (generatedIndex !== -1) {
    for (const line of rows) {
      const value = split(line)[generatedIndex];
      if (value && value.trim()) { generatedAt = value.trim(); break; }
    }
  }
  return { rows: rows.length, generatedAt, columns };
}

/** Kaggle stamps `YYYY-MM-DD HH:MM:SS` (naive UTC) in the CSV. */
export function parseGeneratedAt(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalised = value.trim().replace(' ', 'T');
  const stamp = Date.parse(`${normalised}${/[zZ]|[+-]\d\d:?\d\d$/.test(normalised) ? '' : 'Z'}`);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString() : null;
}

/**
 * Is what we just downloaded worth ingesting?
 *
 * Compares on `generated_at` when both sides have it (the notebook's own clock, which is
 * what staleness is measured against), and falls back to the row count and then the hash.
 * Returns `false` for "the notebook has not run since the last ingest" — a schedule problem
 * that must not be laundered into a fresh ingest of the same rows.
 */
export function isNewerThan({ generatedAt, rows, sha256 }, manifest) {
  if (!manifest || typeof manifest !== 'object') return true;
  const hasBaseline = Boolean(manifest.generated_at || manifest.source_csv_sha256)
    || typeof manifest.row_count === 'number';
  if (!hasBaseline) return true;
  const next = parseGeneratedAt(generatedAt);
  const previous = parseGeneratedAt(manifest.generated_at);
  if (next && previous) {
    const delta = Date.parse(next) - Date.parse(previous);
    if (delta > 0) return true;
    if (delta < 0) return false; // never replace a newer forecast with an older Kaggle run
    // Same notebook timestamp: ingest only if the actual source file changed. This is
    // distinct from `csv_sha256`, which hashes our *mapped* backend CSV, not the source.
    return manifest.source_csv_sha256 && sha256
      ? sha256 !== manifest.source_csv_sha256
      : false;
  }
  if (manifest.source_csv_sha256 && sha256) return sha256 !== manifest.source_csv_sha256;
  if (typeof manifest.row_count === 'number' && typeof rows === 'number') return rows !== manifest.row_count;
  // A legacy manifest without source hash or usable timestamp must not authorize an
  // unbounded re-ingest of the same daily file. The first fetch after deployment will
  // always have either a timestamp or the stored row count.
  return false;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function downloadOverHttp({ url, username, key, destination, attempts = 3, backoffMs = 20_000, log }) {
  const headers = { 'user-agent': 'hazardnet-ci/1.0' };
  if (username && key) {
    headers.authorization = `Basic ${Buffer.from(`${username}:${key}`).toString('base64')}`;
  }
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
      });
      // Kaggle answers 302 to a signed GCS URL; `redirect: follow` handles it. A 401/403
      // here means the key, not the network — no point retrying three times.
      if (response.status === 401 || response.status === 403) {
        const reason = username && key
          ? 'Kaggle rejected the configured credentials or dataset permissions'
          : 'the public Kaggle download requires authentication; configure the optional CLI credentials';
        return { ok: false, fatal: true, error: `${reason} (HTTP ${response.status})` };
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) throw new Error('empty response body');
      writeFileSync(destination, buffer);
      log?.(`[fetch] dataset download ok (${buffer.length} bytes) on attempt ${attempt}`);
      return { ok: true, bytes: buffer.length };
    } catch (error) {
      lastError = error;
      log?.(`[fetch] dataset download attempt ${attempt} failed: ${error.message}`);
      if (attempt < attempts) await sleep(backoffMs);
    }
  }
  return { ok: false, error: lastError?.message ?? 'unknown error' };
}

/**
 * Unzip the single-file archive Kaggle returns. Two tools, no dependencies: `unzip` on the
 * runner, Python's `zipfile` as the fallback (both are preinstalled on ubuntu-latest).
 */
export function extractSingleFile(archivePath, fileName, outDir) {
  mkdirSync(outDir, { recursive: true });
  const target = join(outDir, fileName);
  const downloaded = readFileSync(archivePath);
  const signature = downloaded.subarray(0, 4).toString('hex');
  if (signature !== '504b0304' && signature !== '504b0506' && signature !== '504b0708') {
    // Kaggle's API has served raw CSV bodies as well as zip-wrapped bodies across API
    // versions. Accept only a CSV-looking response; never write an HTML login/error page
    // as the forecast input just because it returned HTTP 200.
    const raw = downloaded.toString('utf8').replace(/^\uFEFF/, '');
    const firstLine = raw.split(/\r?\n/, 1)[0] ?? '';
    if (/^district,/.test(firstLine) && firstLine.includes('generated_at')) {
      writeFileSync(target, raw);
      return { ok: true, bytes: Buffer.byteLength(raw), path: target, format: 'csv' };
    }
    return { ok: false, error: `response is neither a zip archive nor an advisory CSV (header: ${firstLine.slice(0, 100)})` };
  }
  const attempts = [
    () => execFileSync('unzip', ['-o', '-p', archivePath, fileName], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }),
    () => execFileSync('python3', ['-c', 'import sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))', archivePath, fileName], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }),
  ];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const data = attempt();
      if (data && data.length > 0) {
        writeFileSync(target, data);
        return { ok: true, bytes: data.length, path: target, format: 'zip' };
      }
      lastError = new Error('extraction produced no bytes');
    } catch (error) {
      lastError = error;
    }
  }
  return { ok: false, error: lastError?.message ?? 'no zip extractor available' };
}

/** Last resort: the notebook's own output directory, via the Kaggle CLI. */
export function fetchKernelOutput({ kernel, username, outDir, log }) {
  const candidates = kernel.includes('/')
    ? [kernel]
    : [`${username}/${kernel}`, `myself-aas/${kernel}`, kernel];
  for (const slug of [...new Set(candidates)]) {
    try {
      execFileSync('kaggle', ['kernels', 'output', '--path', outDir, slug], { stdio: 'pipe' });
      log?.(`[fetch] kernel output ok via ${slug}`);
      return { ok: true, via: `kernels output ${slug}` };
    } catch (error) {
      log?.(`[fetch] kernel output failed for ${slug}: ${error.stderr?.toString().trim() || error.message}`);
    }
  }
  return { ok: false, error: 'kaggle kernels output failed for every candidate slug' };
}

/** `kaggle datasets download`, for when the HTTP path is blocked but the CLI is installed. */
export function fetchDatasetViaCli({ dataset, fileName, outDir, log }) {
  try {
    execFileSync('kaggle', ['datasets', 'download', '-f', fileName, '-p', outDir, '--unzip', '--force', dataset], { stdio: 'pipe' });
    log?.(`[fetch] dataset download ok via kaggle CLI`);
    return { ok: true, via: `datasets download ${dataset}` };
  } catch (error) {
    log?.(`[fetch] kaggle datasets download failed: ${error.stderr?.toString().trim() || error.message}`);
    return { ok: false, error: error.message };
  }
}

function readManifest(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs();
  const quiet = Boolean(args.quiet);
  const log = quiet ? () => {} : (message) => process.stdout.write(`${message}\n`);
  const outDir = resolve(String(args.out || '/tmp/advisory-ingest'));
  const fileName = process.env.ADVISORY_CSV_NAME || DEFAULT_CSV_NAME;
  const dataset = String(args.dataset || process.env.KAGGLE_DATASET || DEFAULT_DATASET);
  const kernel = String(args.kernel || process.env.KAGGLE_KERNEL || 'myself-aas/8-hazardnet-advisory');
  const apiBase = String(args['api-base'] || process.env.KAGGLE_API_BASE || DEFAULT_API_BASE);
  const manifestPath = args.manifest ? resolve(String(args.manifest)) : DEFAULT_MANIFEST;
  const username = process.env.KAGGLE_USERNAME || '';
  const key = process.env.KAGGLE_KEY || '';
  const waitMinutes = Number(args['wait-minutes'] || 0);
  const attempts = Number(args.attempts || 3);

  mkdirSync(outDir, { recursive: true });
  const csvPath = join(outDir, fileName);
  const manifest = readManifest(manifestPath);

  if (!username || !key) {
    log('[fetch] Kaggle credentials are unset; trying the public dataset URL without authentication.');
    log('[fetch] If Kaggle blocks the public download, add KAGGLE_USERNAME and KAGGLE_KEY for CLI/kernel fallback.');
  }

  const deadline = waitMinutes > 0 ? Date.now() + waitMinutes * 60_000 : 0;
  let round = 0;
  let result = null;

  // A fetch round: dataset (HTTP) → dataset (CLI) → kernel output (CLI).
  const attemptFetch = async () => {
    const archive = join(outDir, 'download.zip');
    const http = await downloadOverHttp({
      url: datasetDownloadUrl(dataset, fileName, apiBase),
      username,
      key,
      destination: archive,
      attempts,
      log,
    });
    if (http.fatal) return { ok: false, fatal: true, error: http.error };
    if (http.ok) {
      const extracted = extractSingleFile(archive, fileName, outDir);
      if (extracted.ok) return { ok: true, via: `dataset download ${dataset} (HTTP)` };
      log?.(`[fetch] extraction failed: ${extracted.error}`);
    }
    if (!username || !key) {
      return { ok: false, error: `${http.error || 'public dataset download failed'}; Kaggle CLI/kernel fallback requires KAGGLE_USERNAME and KAGGLE_KEY` };
    }
    const cli = fetchDatasetViaCli({ dataset, fileName, outDir, log });
    if (cli.ok && existsSync(csvPath)) return { ok: true, via: cli.via };
    const kernelResult = fetchKernelOutput({ kernel, username, outDir, log });
    if (kernelResult.ok && existsSync(csvPath)) return { ok: true, via: kernelResult.via };
    return { ok: false, error: [http.error, cli.error, kernelResult.error].filter(Boolean).join('; ') };
  };

  for (;;) {
    round += 1;
    result = await attemptFetch();
    if (!result.ok) {
      if (result.fatal || !deadline || Date.now() >= deadline) break;
      log?.(`[fetch] round ${round} unavailable: ${result.error}; retrying in 60 seconds while the Kaggle run completes`);
      await sleep(60_000);
      continue;
    }

    const text = readFileSync(csvPath, 'utf8');
    const info = inspectCsv(text);
    const sha256 = createHash('sha256').update(text).digest('hex');
    const state = { ...info, sha256, path: csvPath, bytes: statSync(csvPath).size };

    if (info.rows === 0) {
      result = { ok: false, error: `downloaded ${fileName} has no data rows` };
      break;
    }
    const fresh = args.force ? true : isNewerThan(state, manifest);
    state.newer = fresh;
    state.via = result.via;
    log?.(`[fetch] round ${round}: ${info.rows} rows · generated_at ${info.generatedAt ?? 'unknown'} · sha256 ${sha256.slice(0, 12)}… · via ${result.via}`);
    writeFileSync(join(outDir, 'fetch-report.json'), JSON.stringify(state, null, 2));

    if (fresh || !deadline || Date.now() >= deadline) {
      result = { ok: true, state };
      break;
    }
    log?.(`[fetch] not newer than the committed run (${manifest?.generated_at ?? 'no manifest'}); waiting for the daily notebook…`);
    await sleep(60_000);
  }

  if (!result.ok) {
    process.stderr.write(`❌ Advisory fetch failed: ${result.error}\n`);
    process.stderr.write(`   Tried: dataset ${dataset} (HTTP + CLI) and kernel ${kernel} output.\n`);
    process.exit(EXIT.FAILED);
  }

  if (!result.state.newer) {
    process.stdout.write(`⏭️  Advisory CSV unchanged since ${manifest?.generated_at ?? 'the last ingest'} — skipping ingest.\n`);
    process.stdout.write(`    If the Kaggle notebook is scheduled daily, check its last successful run.\n`);
    process.exit(EXIT.UNCHANGED);
  }

  process.stdout.write(`✅ Fetched ${result.state.rows} advisory rows (generated ${result.state.generatedAt}) via ${result.state.via}\n`);
  process.exit(EXIT.OK);
}

/* Run only as a script. Under Jest this `.mjs` is transpiled to CJS, so `import.meta.url`
   no longer resolves to this file and an entry-point guard would not hold — `main()` would
   run on import and call `process.exit`. JEST_WORKER_ID is the one signal that survives the
   transform. Everything above stays exportable and side-effect free. */
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const ownPath = resolve(fileURLToPath(import.meta.url));
const isDirectExecution = invokedPath === ownPath;
if (process.env.JEST_WORKER_ID === undefined && isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`❌ Advisory fetch crashed: ${error.stack || error.message}\n`);
    process.exit(EXIT.FAILED);
  });
}
