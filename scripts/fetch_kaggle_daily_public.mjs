#!/usr/bin/env node
/**
 * Fetch a pinned, Ready version of the owner's daily advisory dataset.
 * Uses the companion `.run.json` manifest when published by the Kaggle notebook,
 * or derives validated run metadata directly from `hazardnet_advisories_latest.csv`
 * and the pinned Kaggle dataset version when `.run.json` is absent.
 * Raw technical CSV files remain in a private runner temp directory outside Git.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveDailyManifestFromCsv,
  parsePublicDailySnapshot,
  validateDailyManifest,
} from '../backend/utils/dailyAdvisoryPublic.js';
import { readDailyCsv } from './build_public_daily_advisories.mjs';

export const DATASET = 'ashifahmedshuvo/hazardnet-weekly-forecasts';
export const CSV_NAME = 'hazardnet_advisories_latest.csv';
export const RUN_NAME = 'hazardnet_advisories_latest.run.json';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC_ASSET = fileURLToPath(new URL('../frontend/public/data/daily-advisories-v1.json', import.meta.url));
const VERSION_JSON = resolve(ROOT, 'Models/VERSION.json');
const API_BASE = 'https://www.kaggle.com';
const MAX_ARCHIVE_BYTES = 15 * 1024 * 1024;
const MAX_CSV_BYTES = 10 * 1024 * 1024;
const MAX_RUN_BYTES = 64 * 1024;
const MAX_AUDIT_BYTES = 512 * 1024;

function canonicalModelVersion() {
  try {
    const parsed = JSON.parse(readFileSync(VERSION_JSON, 'utf8'));
    if (parsed && typeof parsed.version === 'string' && parsed.version.trim()) {
      return parsed.version.trim();
    }
  } catch {
    // Fallback below
  }
  return '2.1.9+model.0bb5bdaf1789';
}

export function readyDatasetVersion(metadata, dataset = DATASET) {
  if (!metadata || metadata.ref !== dataset || metadata.isPrivate !== false
    || !Number.isSafeInteger(metadata.currentVersionNumber)
    || metadata.currentVersionNumber < 1) {
    throw new Error('Kaggle dataset identity or current version is missing');
  }
  const entry = metadata.versions?.find((version) =>
    version.versionNumber === metadata.currentVersionNumber);
  if (!entry || typeof entry.status !== 'string') {
    throw new Error('Kaggle current version has no verifiable status');
  }
  return entry.status === 'Ready' ? metadata.currentVersionNumber : null;
}

function datasetVersionTimestamp(metadata) {
  const entry = metadata?.versions?.find((v) => v.versionNumber === metadata?.currentVersionNumber);
  return entry?.creationDate || metadata?.lastUpdated || null;
}

export function pinnedDownloadUrl(name, version, { dataset = DATASET, base = API_BASE } = {}) {
  if (![CSV_NAME, RUN_NAME].includes(name) || !Number.isSafeInteger(version) || version < 1) {
    throw new Error('Invalid versioned Kaggle file request');
  }
  return `${base}/api/v1/datasets/download/${dataset}/${encodeURIComponent(name)}?datasetVersionNumber=${version}`;
}

function currentPublicAsset(assetPath) {
  if (!existsSync(assetPath)) return null;
  const stat = lstatSync(assetPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024) {
    throw new Error('Existing public daily asset is not a bounded regular file');
  }
  let raw;
  try { raw = JSON.parse(readFileSync(assetPath, 'utf8')); }
  catch { throw new Error('Existing public daily asset cannot be read'); }
  const parsed = parsePublicDailySnapshot(raw);
  if (!parsed || parsed.coverage.districts !== 64 || parsed.advisories.length === 0) {
    throw new Error('Existing public daily asset is not valid');
  }
  return parsed;
}

function authorizationHeaders(username, key) {
  if (Boolean(username) !== Boolean(key)) throw new Error('Incomplete optional Kaggle credentials');
  return {
    accept: 'application/json, text/csv, application/zip, application/octet-stream',
    ...(username && key ? { authorization: `Basic ${Buffer.from(`${username}:${key}`).toString('base64')}` } : {}),
  };
}

async function boundedRequest(url, { fetchImpl, headers, maxBytes, allowNotFound = false }) {
  let response;
  try { response = await fetchImpl(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(30_000) }); }
  catch { throw new Error('Kaggle request failed; dataset publication could not be confirmed'); }
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) throw new Error(`Kaggle request failed (HTTP ${response.status})`);
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) throw new Error('Kaggle response is too large');
  if (!response.body) throw new Error('Kaggle response is empty');
  let bytes = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) throw new Error('Kaggle response exceeds the byte limit');
    chunks.push(chunk);
  }
  if (bytes === 0) throw new Error('Kaggle response is empty');
  return Buffer.concat(chunks, bytes);
}

const UNZIP_ONE = `import io,sys,zipfile
name=sys.argv[1]; cap=int(sys.argv[2])
try:
    with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as archive:
        hits=[item for item in archive.infolist() if item.filename == name and not item.is_dir()]
        if len(hits)!=1 or not 0 < hits[0].file_size <= cap: sys.exit(2)
        with archive.open(hits[0]) as file: data=file.read(cap+1)
        if len(data)!=hits[0].file_size: sys.exit(2)
        sys.stdout.buffer.write(data)
except Exception: sys.exit(2)
`;

export function decodeKaggleFile(body, name, maxBytes) {
  if (body.subarray(0, 4).toString('hex') !== '504b0304') {
    if (body.length > maxBytes) throw new Error('Kaggle file is too large');
    return body;
  }
  const unpacked = spawnSync('python3', ['-c', UNZIP_ONE, name, String(maxBytes)], {
    input: body, maxBuffer: maxBytes + 1024, timeout: 15_000,
  });
  if (unpacked.status !== 0 || !unpacked.stdout?.length) {
    throw new Error('Kaggle archive does not contain the bounded, named file');
  }
  return unpacked.stdout;
}

export async function fetchReadyDailyDataset({
  outDir, assetPath = PUBLIC_ASSET, dataset = DATASET, base = API_BASE,
  fetchImpl = fetch, now = new Date(), username, key,
} = {}) {
  if (!outDir || !/^[a-z0-9_-]+\/[a-z0-9_-]+$/i.test(dataset)) {
    throw new Error('A private temp directory and an exact dataset reference are required');
  }
  const headers = authorizationHeaders(username, key);
  const viewUrl = `${base}/api/v1/datasets/view/${dataset}`;
  const getMetadata = async () => {
    const raw = await boundedRequest(viewUrl, { fetchImpl, headers, maxBytes: 1024 * 1024 });
    let metadata;
    try { metadata = JSON.parse(raw.toString('utf8')); }
    catch { throw new Error('Kaggle dataset metadata is not JSON'); }
    return { metadata, version: readyDatasetVersion(metadata, dataset) };
  };

  const initial = await getMetadata();
  const { version, metadata } = initial;
  if (version === null) return { status: 'not-ready' };
  const current = currentPublicAsset(assetPath);
  if (current?.run.sourceDatasetVersion > version) {
    throw new Error('Kaggle dataset version is older than the published result');
  }
  if (current?.run.sourceDatasetVersion === version) return { status: 'unchanged', version };

  const [rawCsvBody, rawRunBody] = await Promise.all([
    boundedRequest(pinnedDownloadUrl(CSV_NAME, version, { dataset, base }), {
      fetchImpl, headers, maxBytes: MAX_ARCHIVE_BYTES,
    }),
    boundedRequest(pinnedDownloadUrl(RUN_NAME, version, { dataset, base }), {
      fetchImpl, headers, maxBytes: MAX_ARCHIVE_BYTES, allowNotFound: true,
    }),
  ]);

  const csvBody = decodeKaggleFile(rawCsvBody, CSV_NAME, MAX_CSV_BYTES);
  const sha256 = createHash('sha256').update(csvBody).digest('hex');

  let verified;
  let runJsonBytes;
  if (rawRunBody !== null) {
    const runBody = decodeKaggleFile(rawRunBody, RUN_NAME, MAX_RUN_BYTES);
    let run;
    try { run = JSON.parse(runBody.toString('utf8')); }
    catch { throw new Error('Notebook UTC run record is missing or malformed'); }
    verified = validateDailyManifest(run, { sha256, now });
    runJsonBytes = runBody;
  } else {
    // Companion `.run.json` was not published by the Kaggle notebook; derive
    // run metadata directly from the validated CSV and dataset version metadata.
    const rows = await readDailyCsv(csvBody);
    verified = deriveDailyManifestFromCsv(rows, {
      sha256,
      datasetVersion: version,
      datasetTimestamp: datasetVersionTimestamp(metadata),
      defaultModelVersion: canonicalModelVersion(),
      now,
    });
    runJsonBytes = Buffer.from(`${JSON.stringify(verified, null, 2)}\n`, 'utf8');
  }

  if (current && current.run.inputSha256 === sha256 && current.run.id === verified.run_id) {
    return { status: 'unchanged', version };
  }
  if (current && (Date.parse(verified.data_cutoff) <= Date.parse(current.run.dataCutoff)
    || Date.parse(verified.generated_at) <= Date.parse(current.run.generatedAt))) {
    throw new Error('Kaggle run would roll back the published model time or data cutoff');
  }
  if ((await getMetadata()).version !== version) throw new Error('Kaggle version changed during the fetch');

  const dir = resolve(outDir);
  if (dir === resolve(ROOT) || dir.startsWith(`${resolve(ROOT)}${sep}`)) {
    throw new Error('Technical Kaggle files must stay outside the public repository');
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const realDir = realpathSync(dir);
  if (realDir === resolve(ROOT) || realDir.startsWith(`${resolve(ROOT)}${sep}`)) {
    throw new Error('Technical Kaggle files must stay outside the public repository');
  }
  writeFileSync(resolve(dir, CSV_NAME), csvBody, { flag: 'wx', mode: 0o600 });
  writeFileSync(resolve(dir, RUN_NAME), runJsonBytes, { flag: 'wx', mode: 0o600 });
  if (rawAuditBody !== null) {
    const auditBody = decodeKaggleFile(rawAuditBody, AUDIT_NAME, MAX_AUDIT_BYTES);
    writeFileSync(resolve(dir, AUDIT_NAME), auditBody, { flag: 'wx', mode: 0o600 });
  }
  writeFileSync(resolve(dir, 'dataset-version.txt'), `${version}\n`, { flag: 'wx', mode: 0o600 });
  return { status: 'fetched', version, runId: verified.run_id };
}

async function main(argv) {
  if (argv.length !== 2 || argv[0] !== '--out') {
    throw new Error('Usage: fetch_kaggle_daily_public.mjs --out /private/runner/temp');
  }
  const result = await fetchReadyDailyDataset({
    outDir: argv[1], username: process.env.KAGGLE_USERNAME, key: process.env.KAGGLE_KEY,
  });
  console.log(`[kaggle-daily] ${result.status}${result.version ? ` (Ready dataset version ${result.version})` : ''}.`);
  if (result.status !== 'fetched') process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[kaggle-daily] Publication fetch refused: ${error.message}`);
    process.exitCode = 1;
  });
}
