import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  mapAdvisoryRows,
  forecastRowsToCsv,
} from '../backend/utils/advisoryMapper.js';
import { parseCsv, validateAdvisoryCsv } from './validate_advisory_csv.mjs';
import { persistForecasts, validateServiceAccountEnv } from '../backend/forecastPersistence.js';

export function resolveCanonicalModelVersion(rootDir = process.cwd()) {
  try {
    const versionPath = path.join(rootDir, 'Models', 'VERSION.json');
    if (fs.existsSync(versionPath)) {
      const doc = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
      if (doc?.version) return doc.version;
    }
  } catch (err) {
    console.warn('[process_advisory_ingest] Failed to read Models/VERSION.json:', err.message);
  }
  return '2.1.9+model.0bb5bdaf1789';
}

export async function processAdvisoryIngest(csvPath, options = {}) {
  const root = options.rootDir ? path.resolve(options.rootDir) : process.cwd();
  const {
    allowStale = false,
    ingestFirestore = false,
    strictFirestore = process.env.FIRESTORE_INGEST_STRICT === 'true',
    env = process.env,
    db = undefined,
  } = options;

  console.log(`[process_advisory_ingest] Reading advisory CSV from: ${csvPath}`);
  const csvContent = fs.readFileSync(path.resolve(root, csvPath), 'utf8');

  console.log('[process_advisory_ingest] Validating advisory CSV...');
  const validation = validateAdvisoryCsv(csvContent, { allowStale });
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
  }

  const modelVersion = resolveCanonicalModelVersion(root);
  console.log(`[process_advisory_ingest] Resolved model version: ${modelVersion}`);

  const { rows: rawRows } = parseCsv(csvContent);

  console.log(`[process_advisory_ingest] Mapping ${rawRows.length} advisory rows...`);
  const mapped = mapAdvisoryRows(rawRows, { modelVersion });
  const mappedCsv = forecastRowsToCsv(mapped);

  const outCsvPath = path.resolve(root, 'backend/data/forecasts/hazardnet_forecasts_latest.csv');
  const outJsonPath = path.resolve(root, 'backend/data/forecasts/hazardnet_forecasts_latest.json');
  const pubCsvPath = path.resolve(root, 'frontend/public/data/hazardnet_forecasts_latest.csv');
  fs.mkdirSync(path.dirname(outCsvPath), { recursive: true });
  fs.writeFileSync(outCsvPath, mappedCsv, 'utf8');
  fs.writeFileSync(outJsonPath, JSON.stringify(mapped, null, 2), 'utf8');
  if (fs.existsSync(path.dirname(pubCsvPath))) {
    fs.writeFileSync(pubCsvPath, mappedCsv, 'utf8');
  }

  const csvSha256 = crypto.createHash('sha256').update(mappedCsv).digest('hex');
  const manifest = {
    source: 'Kaggle_Daily_Advisory (8-hazardnet-advisory)',
    data_source: 'Kaggle_Daily_Advisory',
    generated_at: new Date().toISOString(),
    prediction_date: mapped[0].prediction_date,
    row_count: mapped.length,
    csv_sha256: csvSha256,
    model_version: modelVersion,
    csv_path: 'backend/data/forecasts/hazardnet_forecasts_latest.csv',
    json_path: 'backend/data/forecasts/hazardnet_forecasts_latest.json',
  };

  const manifestPath = path.resolve(root, 'backend/data/forecasts/manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`[process_advisory_ingest] Manifest written: prediction_date=${manifest.prediction_date}, rows=${manifest.row_count}`);

  const snapshotScript = path.resolve(process.cwd(), 'scripts/build_forecast_snapshot.mjs');
  const snapshotJsonPath = path.resolve(root, 'frontend/public/data/forecasts-latest.json');
  if (fs.existsSync(snapshotScript)) {
    console.log('[process_advisory_ingest] Building forecast snapshot...');
    execSync(`node "${snapshotScript}" "${outCsvPath}" "${snapshotJsonPath}"`, {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
  }

  let firestore = { status: 'disabled', written: 0 };

  if (ingestFirestore) {
    console.log('[process_advisory_ingest] Evaluating Firestore persistence credentials...');
    if (!db) {
      const preFlight = validateServiceAccountEnv(env);
      if (!preFlight.valid) {
        const msg = `Skipping Firestore persistence: ${preFlight.reason}. Static forecast snapshots were generated successfully.`;
        if (strictFirestore) {
          throw new Error(msg);
        }
        console.warn(`::warning::[process_advisory_ingest] ${msg}`);
        firestore = { status: 'skipped', reason: preFlight.reason, written: 0 };
        return { manifest, rowCount: mapped.length, firestore };
      }
      console.log(
        `[process_advisory_ingest] Verified service account via ${preFlight.source} (project: ${preFlight.projectId})`,
      );
    }

    console.log('[process_advisory_ingest] Ingesting mapped forecasts into Firestore...');
    try {
      const writeResult = await persistForecasts(mapped, manifest.prediction_date, db);
      console.log('[process_advisory_ingest] Firestore persistence completed:', writeResult);
      firestore = { status: 'persisted', written: writeResult.written };
    } catch (err) {
      if (strictFirestore) {
        throw err;
      }
      console.warn(
        `::warning::[process_advisory_ingest] Firestore persistence degraded gracefully: ${err.message}. Static forecast snapshots remain intact.`,
      );
      firestore = { status: 'degraded', error: err.message, written: 0 };
    }
  }

  return { manifest, rowCount: mapped.length, firestore };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => !a.startsWith('--'));
  if (!csvPath) {
    console.error('Usage: node scripts/process_advisory_ingest.mjs <csv_path> [--allow-stale] [--ingest-firestore] [--strict-firestore]');
    process.exit(1);
  }

  const allowStale = args.includes('--allow-stale');
  const ingestFirestore = args.includes('--ingest-firestore');
  const strictFirestore = args.includes('--strict-firestore') || process.env.FIRESTORE_INGEST_STRICT === 'true';

  processAdvisoryIngest(csvPath, { allowStale, ingestFirestore, strictFirestore })
    .then(() => {
      console.log('[process_advisory_ingest] Pipeline step complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[process_advisory_ingest] Error:', err);
      process.exit(1);
    });
}
