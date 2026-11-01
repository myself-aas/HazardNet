#!/usr/bin/env node
/**
 * Produce a whitelisted public snapshot from a separately controlled advisory export.
 * Never copy the input CSV or its private audit reports to frontend/public, CI or Git.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import csv from 'csv-parser';
import {
  buildPublicDailySnapshot, parsePublicDailySnapshot,
  validateDailyManifest, validatePublishableDailyManifest,
} from '../backend/utils/dailyAdvisoryPublic.js';
import { validateReleasableDailySnapshot } from './check_public_daily_asset.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC_OUTPUT = resolve(ROOT, 'frontend/public/data/daily-advisories-v1.json');
const COPY_SOURCE = resolve(ROOT, 'frontend/src/lib/i18n.ts');
const REQUIRED = [
  'district', 'forecast_day', 'target_date', 'hazard', 'advisory_tier',
  'severity_score', 'is_peak_day', 'bmd_stale', 'physics_degraded',
];

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
  if (!headers || headers.length !== new Set(headers).size || REQUIRED.some((key) => !headers.includes(key))) {
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
    if (!['--input', '--manifest', '--output', '--expected-districts', '--dataset-version'].includes(arg)
      || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error(`Unknown or incomplete option: ${arg}`);
    }
    values[arg.slice(2)] = args[++index];
  }
  if (!values.input || !values.manifest || !values.output
    || ['publish', 'preview', 'automated-publish'].filter((key) => values[key]).length !== 1
    || Boolean(values['automated-publish']) !== Boolean(values['dataset-version'])) {
    throw new Error('Usage: build_public_daily_advisories.mjs --input PRIVATE_CSV --manifest UTC_RUN_JSON --output PUBLIC_JSON (--publish | --preview | --automated-publish --dataset-version N)');
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
  input, manifest, publish = false, automated = false, datasetVersion,
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
    // Source authentication is performed by the preceding version-pinned
    // fetch, not by this CLI flag; keep its ephemeral inputs out of the repo.
    ensurePrivateRunnerPath(input);
    ensurePrivateRunnerPath(manifest);
  }
  let content;
  try {
    content = readFileSync(resolve(input));
  } catch {
    throw new Error('Input CSV could not be read');
  }
  const checksum = createHash('sha256').update(content).digest('hex');
  let rawManifest;
  try {
    rawManifest = JSON.parse(readFileSync(resolve(manifest), 'utf8'));
  } catch {
    throw new Error('Run manifest is missing or is not valid JSON');
  }
  const rows = await readDailyCsv(content);
  const dates = rows.map((row) => row.target_date).sort();
  // The owner-issued release route keeps its copy-bound approval receipt. The
  // separate scheduled route uses the notebook's own strict UTC run facts and
  // a pinned, Ready dataset version; it never invents a reviewer or copy signoff.
  let copySha256;
  if ((!automated && publish) || rawManifest?.manifest_version) {
    try {
      copySha256 = createHash('sha256').update(readFileSync(COPY_SOURCE)).digest('hex');
    } catch {
      throw new Error('Bangla copy revision could not be verified');
    }
  }
  const runManifest = (!automated && publish) || rawManifest?.manifest_version
    ? validatePublishableDailyManifest(rawManifest, {
      sha256: checksum, copySha256, filename: basename(resolve(input)), sizeBytes: content.length,
      rows: rows.length, columns: Object.keys(rows[0] || {}).length,
      districts: new Set(rows.map((row) => row.district)).size,
      firstDate: dates[0], lastDate: dates[dates.length - 1], now, allowStale,
    })
    : validateDailyManifest(rawManifest, { sha256: checksum, now, allowStale });
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
  input, manifest, output, publish = false, automated = false, datasetVersion,
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
    input, manifest, publish, automated, datasetVersion,
    allowStale: preview, expectedDistricts: count, now,
  });
  // Do not even create a temporary public file for an empty, incomplete, or
  // unusable run. Preview mode remains limited to paths outside public assets.
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
      input: options.input, manifest: options.manifest, output: options.output,
      publish: Boolean(options.publish || automated), automated,
      datasetVersion: automated ? Number(options['dataset-version']) : undefined,
      preview: Boolean(options.preview), expectedDistricts: options['expected-districts'] ?? 64,
    });
    console.log(`[daily-advisories] Public-only snapshot: ${result.count} rows, ${result.districts} districts -> ${result.output}`);
  } catch (error) {
    console.error(`[daily-advisories] Publication refused: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
