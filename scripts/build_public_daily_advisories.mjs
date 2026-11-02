#!/usr/bin/env node
/**
 * Produce a whitelisted public snapshot from the Kaggle 960-row daily advisory CSV.
 * Supports companion `.run.json` manifests when present and derives validated run
 * metadata directly from the CSV / pinned Kaggle dataset version when `.run.json`
 * is absent. Never copies raw private CSV inputs into frontend/public or Git.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import csv from 'csv-parser';
import {
  buildPublicDailySnapshot,
  deriveDailyManifestFromCsv,
  parsePublicDailySnapshot,
  validateDailyManifest,
  validatePublishableDailyManifest,
} from '../backend/utils/dailyAdvisoryPublic.js';
import { validateReleasableDailySnapshot } from './check_public_daily_asset.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC_OUTPUT = resolve(ROOT, 'frontend/public/data/daily-advisories-v1.json');
const COPY_SOURCE = resolve(ROOT, 'frontend/src/lib/i18n.ts');
const VERSION_JSON = resolve(ROOT, 'Models/VERSION.json');

function canonicalModelVersion() {
  try {
    const parsed = JSON.parse(readFileSync(VERSION_JSON, 'utf8'));
    if (parsed && typeof parsed.version === 'string' && parsed.version.trim()) {
      return parsed.version.trim();
    }
  } catch {
    // Fallback below if VERSION.json is unreadable in an isolated test environment
  }
  return '2.1.9+model.0bb5bdaf1789';
}

function hasRequiredDailyHeaders(headers) {
  if (!headers || headers.length !== new Set(headers).size) return false;
  const set = new Set(headers);
  return (set.has('district') || set.has('district_name'))
    && set.has('forecast_day')
    && set.has('target_date')
    && (set.has('hazard') || set.has('hazard_type'))
    && set.has('advisory_tier')
    && (set.has('severity_score') || set.has('final_severity'));
}

/** A strict CSV reader: duplicate headers and ragged records never enter the projection. */
export async function readDailyCsv(content) {
  if (!content || content.length > 10 * 1024 * 1024) {
    throw new Error('CSV is empty or too large');
  }
  const parser = csv({
    strict: true,
    maxRowBytes: 16 * 1024,
    mapHeaders: ({ header }) => String(header).replace(/^\uFEFF/, '').trim(),
  });
  let headers = null;
  parser.on('headers', (list) => { headers = list; });
  const rows = [];
  for await (const row of Readable.from([content]).pipe(parser)) {
    if (rows.length >= 64 * 15) throw new Error('CSV has more than 960 rows');
    rows.push(row);
  }
  if (!hasRequiredDailyHeaders(headers)) {
    throw new Error('CSV headers are missing, repeated or incompatible with the daily contract');
  }
  return rows;
}

export function optionsFromArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (['--publish', '--preview', '--automated-publish'].includes(arg)) {
      values[arg.slice(2)] = true;
      continue;
    }
    if (!['--input', '--manifest', '--output', '--expected-districts', '--dataset-version', '--dataset-timestamp'].includes(arg)
      || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error(`Unknown or incomplete option: ${arg}`);
    }
    values[arg.slice(2)] = args[++index];
  }
  const manualPublish = Boolean(values.publish && !values['automated-publish']);
  if (!values.input || !values.output
    || (manualPublish && !values.manifest)
    || ['publish', 'preview', 'automated-publish'].filter((key) => values[key]).length !== 1
    || Boolean(values['automated-publish']) !== Boolean(values['dataset-version'])) {
    throw new Error('Usage: build_public_daily_advisories.mjs --input PRIVATE_CSV [--manifest UTC_RUN_JSON] --output PUBLIC_JSON (--publish --manifest RECEIPT_JSON | --preview | --automated-publish --dataset-version N)');
  }
  return values;
}

function ensurePrivateRunnerPath(file) {
  const path = resolve(file);
  const inside = (candidate) => candidate === resolve(ROOT) || candidate.startsWith(`${resolve(ROOT)}${sep}`);
  if (inside(path) || (existsSync(path) && inside(realpathSync(path)))) {
    throw new Error('Automated Kaggle inputs must be outside the public repository');
  }
}

/** Read-only projection shared by the public-file builder and the manual mirror. */
export async function projectDailyInput({
  input, manifest, publish = false, automated = false, datasetVersion, datasetTimestamp,
  allowStale = false, expectedDistricts = 64, now = new Date(),
}) {
  if (publish && expectedDistricts !== 64) throw new Error('Production requires 64 districts');
  if (automated && (!publish || !Number.isSafeInteger(datasetVersion)
    || datasetVersion < 1 || datasetVersion > 1_000_000_000)) {
    throw new Error('Automated publication requires a pinned Ready Kaggle dataset version');
  }
  if (!automated && datasetVersion !== undefined) {
    throw new Error('Only automated publication may stamp a Kaggle dataset version');
  }
  if (automated) {
    ensurePrivateRunnerPath(input);
    if (manifest) ensurePrivateRunnerPath(manifest);
  }
  let content;
  try {
    content = readFileSync(resolve(input));
  } catch {
    throw new Error('Input CSV could not be read');
  }
  const checksum = createHash('sha256').update(content).digest('hex');
  const rows = await readDailyCsv(content);
  const dates = rows.map((row) => String(row.target_date || '').trim()).sort();

  let rawManifest = null;
  const manifestPath = manifest ? resolve(manifest) : null;
  if (manifestPath && existsSync(manifestPath)) {
    try {
      rawManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      throw new Error('Run manifest is missing or is not valid JSON');
    }
  } else if (!automated && publish) {
    throw new Error('Run manifest is missing or is not valid JSON');
  }

  let copySha256;
  if ((!automated && publish) || rawManifest?.manifest_version) {
    try {
      copySha256 = createHash('sha256').update(readFileSync(COPY_SOURCE)).digest('hex');
    } catch {
      throw new Error('Bangla copy revision could not be verified');
    }
  }

  let runManifest;
  if ((!automated && publish) || rawManifest?.manifest_version) {
    runManifest = validatePublishableDailyManifest(rawManifest, {
      sha256: checksum, copySha256, filename: basename(resolve(input)), sizeBytes: content.length,
      rows: rows.length, columns: Object.keys(rows[0] || {}).length,
      districts: new Set(rows.map((row) => row.district || row.district_name)).size,
      firstDate: dates[0], lastDate: dates[dates.length - 1], now, allowStale,
    });
  } else if (rawManifest) {
    runManifest = validateDailyManifest(rawManifest, { sha256: checksum, now, allowStale });
  } else {
    runManifest = deriveDailyManifestFromCsv(rows, {
      sha256: checksum,
      datasetVersion,
      datasetTimestamp,
      defaultModelVersion: canonicalModelVersion(),
      now,
      allowStale,
    });
  }

  return buildPublicDailySnapshot(rows, runManifest, {
    expectedDistricts, sourceDatasetVersion: automated ? datasetVersion : undefined,
  });
}

export function assertNewerPublicDaily(previousRaw, next) {
  const previous = parsePublicDailySnapshot(previousRaw);
  if (!previous || previous.coverage.districts !== 64 || previous.advisories.length === 0) {
    throw new Error('Existing public daily asset is invalid; refusing an unchecked replacement');
  }
  if (previous.run.id === next.run.id
    || Date.parse(previous.run.dataCutoff) >= Date.parse(next.run.dataCutoff)
    || (previous.run.sourceDatasetVersion !== undefined
      && next.run.sourceDatasetVersion !== undefined
      && previous.run.sourceDatasetVersion >= next.run.sourceDatasetVersion)) {
    throw new Error('Refusing a repeated run, older data cutoff or rolled-back dataset version');
  }
}

export async function buildPublicDailyFile({
  input, manifest, output, publish = false, automated = false, datasetVersion, datasetTimestamp,
  preview = false, expectedDistricts = 64, now = new Date(),
}) {
  const outputPath = resolve(output);
  if (publish === preview || (publish && outputPath !== PUBLIC_OUTPUT)
    || (preview && (outputPath === PUBLIC_OUTPUT || outputPath.startsWith(resolve(ROOT, 'frontend/public') + sep)))) {
    throw new Error('Publishing requires the canonical public path; previews may not write to frontend/public');
  }
  const count = Number(expectedDistricts);
  if (!Number.isInteger(count) || count < 1 || count > 64 || (publish && count !== 64)) {
    throw new Error('Production requires 64 districts; only previews may use a smaller test set');
  }
  const snapshot = await projectDailyInput({
    input, manifest, publish, automated, datasetVersion, datasetTimestamp,
    allowStale: preview, expectedDistricts: count, now,
  });
  if (publish) {
    validateReleasableDailySnapshot(snapshot, { now });
    if (existsSync(outputPath)) {
      let previous;
      try { previous = JSON.parse(readFileSync(outputPath, 'utf8')); }
      catch { throw new Error('Existing public daily asset cannot be read; refusing replacement'); }
      assertNewerPublicDaily(previous, snapshot);
    }
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  const tmp = `${outputPath}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(snapshot)}\n`, { encoding: 'utf8', flag: 'wx' });
    renameSync(tmp, outputPath);
  } catch (error) {
    const { rmSync } = await import('node:fs');
    rmSync(tmp, { force: true });
    throw error;
  }
  return { output: outputPath, count: snapshot.advisories.length, districts: snapshot.coverage.districts };
}

async function main(args) {
  try {
    const options = optionsFromArgs(args);
    const automated = Boolean(options['automated-publish']);
    const result = await buildPublicDailyFile({
      input: options.input,
      manifest: options.manifest,
      output: options.output,
      publish: Boolean(options.publish || automated),
      automated,
      datasetVersion: automated ? Number(options['dataset-version']) : undefined,
      datasetTimestamp: options['dataset-timestamp'],
      preview: Boolean(options.preview),
      expectedDistricts: options['expected-districts'] ?? 64,
    });
    console.log(`[daily-advisories] Public snapshot: ${result.count} rows, ${result.districts} districts -> ${result.output}`);
  } catch (error) {
    console.error(`[daily-advisories] Publication refused: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
