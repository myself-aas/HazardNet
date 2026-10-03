#!/usr/bin/env node
/**
 * process_advisory_ingest.mjs — End-to-end Advisory Ingestion Runner
 *
 * Implements the core processing pipeline for TASK-001 per PRD §4 / TRD §2.
 * Validates Kaggle advisory CSV output, maps columns to backend ForecastRow schema,
 * writes to backend/data/forecasts/, updates manifest.json, and rebuilds the static
 * snapshot frontend/public/data/forecasts-latest.json.
 *
 * Usage:
 *   node scripts/process_advisory_ingest.mjs <path-to-advisory-csv> [--allow-stale] [--max-age-hours=36] [--ingest-firestore]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import {
  ADVISORY_CSV_COLUMNS,
  mapAdvisoryRows,
  forecastRowsToCsv,
} from '../backend/utils/advisoryMapper.js';
import { validateAdvisoryCsv, parseCsv } from './validate_advisory_csv.mjs';

const DEFAULT_CSV_PATH = 'backend/data/forecasts/hazardnet_forecasts_latest.csv';
const DEFAULT_MANIFEST_PATH = 'backend/data/forecasts/manifest.json';
const DEFAULT_SNAPSHOT_PATH = 'frontend/public/data/forecasts-latest.json';

/**
 * Resolve the canonical model version from Models/VERSION.json if present.
 * Returns null if missing or invalid.
 *
 * @param {string} [rootDir=process.cwd()]
 * @returns {string|null}
 */
export function resolveCanonicalModelVersion(rootDir = process.cwd()) {
  const versionPath = resolve(rootDir, 'Models', 'VERSION.json');
  if (!existsSync(versionPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(versionPath, 'utf8'));
    return typeof parsed?.version === 'string' && parsed.version.trim()
      ? parsed.version.trim()
      : null;
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const inputCsvPath = args.find((a) => !a.startsWith('--'));

  if (!inputCsvPath) {
    console.error('Usage: node scripts/process_advisory_ingest.mjs <path-to-advisory-csv> [--allow-stale] [--max-age-hours=36] [--ingest-firestore]');
    process.exit(1);
  }

  const resolvedInputPath = resolve(process.cwd(), inputCsvPath);
  if (!existsSync(resolvedInputPath)) {
    console.error(`❌ Input CSV not found at: ${resolvedInputPath}`);
    process.exit(1);
  }

  const allowStale = args.includes('--allow-stale');
  const maxAgeArg = args.find((a) => a.startsWith('--max-age-hours='));
  const maxAgeHours = maxAgeArg ? parseFloat(maxAgeArg.split('=')[1]) : 36;
  const ingestFirestore = args.includes('--ingest-firestore');

  console.log(`[ingest] Starting advisory ingestion for: ${resolvedInputPath}`);

  // 1. Read & Validate raw advisory CSV
  const rawCsvContent = readFileSync(resolvedInputPath, 'utf8');
  const validationResult = validateAdvisoryCsv(rawCsvContent, { allowStale, maxAgeHours });

  if (!validationResult.valid) {
    console.error(`❌ Schema validation failed with ${validationResult.errors.length} error(s):`);
    validationResult.errors.forEach((err) => console.error(`   - ${err}`));
    process.exit(1);
  }

  console.log(`✅ Schema validation passed: ${validationResult.summary.totalRows} rows from 64 districts.`);

  // 2. Parse & Map to ForecastRow schema
  const canonicalModelVersion = resolveCanonicalModelVersion(process.cwd());
  const parsedRecords = parseCsv(rawCsvContent);
  const [headers, ...rows] = parsedRecords;
  const rawRowObjects = rows.map((cells) => {
    return Object.fromEntries(headers.map((h, i) => [h.trim(), cells[i]?.trim()]));
  });

  const mappedForecastRows = mapAdvisoryRows(rawRowObjects, { modelVersion: canonicalModelVersion });
  console.log(`✅ Mapped ${mappedForecastRows.length} forecast records (model_version=${canonicalModelVersion ?? 'null'}).`);

  // 3. Serialize to CSV
  const outputCsv = forecastRowsToCsv(mappedForecastRows);
  const targetCsvPath = resolve(process.cwd(), DEFAULT_CSV_PATH);
  mkdirSync(dirname(targetCsvPath), { recursive: true });
  writeFileSync(targetCsvPath, outputCsv, 'utf8');
  console.log(`✅ Written mapped forecast CSV to: ${targetCsvPath}`);

  // 4. Update manifest.json
  const csvSha256 = createHash('sha256').update(outputCsv).digest('hex');
  // Keep the source hash separately: fetch_kaggle_advisory.mjs uses it to distinguish a
  // changed Kaggle publication with the same generated_at from the already-mapped output.
  const sourceCsvSha256 = createHash('sha256').update(rawCsvContent).digest('hex');
  const predictionDate = mappedForecastRows[0]?.prediction_date || new Date().toISOString().slice(0, 10);
  const manifest = {
    source: 'Kaggle_Daily_Advisory (8-hazardnet-advisory)',
    data_source: 'Kaggle_Daily_Advisory',
    generated_at: validationResult.summary.latestGeneratedAt || new Date().toISOString(),
    prediction_date: predictionDate,
    row_count: mappedForecastRows.length,
    csv_sha256: csvSha256,
    source_csv_sha256: sourceCsvSha256,
    model_version: canonicalModelVersion,
    csv_path: DEFAULT_CSV_PATH,
    json_path: 'backend/data/forecasts/hazardnet_forecasts_latest.json',
  };

  const targetManifestPath = resolve(process.cwd(), DEFAULT_MANIFEST_PATH);
  writeFileSync(targetManifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`✅ Updated manifest at: ${targetManifestPath}`);

  // 5. Rebuild static snapshot (frontend/public/data/forecasts-latest.json)
  const targetSnapshotPath = resolve(process.cwd(), DEFAULT_SNAPSHOT_PATH);
  mkdirSync(dirname(targetSnapshotPath), { recursive: true });
  console.log(`[snapshot] Rebuilding static snapshot via build_forecast_snapshot.mjs...`);

  try {
    execSync(`node scripts/build_forecast_snapshot.mjs "${targetCsvPath}" "${targetSnapshotPath}"`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        SNAPSHOT_SOURCE: 'Kaggle 8-hazardnet-advisory (daily ingestion pipeline)',
      },
    });
    console.log(`✅ Static snapshot built successfully at: ${targetSnapshotPath}`);
  } catch (err) {
    console.error(`❌ Static snapshot build failed: ${err.message}`);
    process.exit(1);
  }

  // 6. Optional Firestore Ingestion
  if (ingestFirestore) {
    console.log(`[firestore] Ingesting into Firebase Firestore...`);
    try {
      execSync(`node scripts/ingest_forecast_csv.mjs "${targetCsvPath}" --mode=replace`, {
        stdio: 'inherit',
      });
      console.log(`✅ Firestore ingestion completed.`);
    } catch (err) {
      console.error(`❌ Firestore ingestion failed: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`🎉 Daily advisory ingest complete!`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(`Fatal error in advisory ingest: ${err.message}`);
    process.exit(1);
  });
}
