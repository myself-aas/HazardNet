#!/usr/bin/env node
/**
 * ingest_forecast_csv.mjs
 *
 * Reads the mapped forecast CSV (default: backend/data/forecasts/hazardnet_forecasts_latest.csv),
 * validates calibration/schema fields, checks Firebase service account credentials via
 * validateServiceAccountEnv(), and persists the batch into Firestore atomically.
 *
 * By default in CI pipelines, missing or unreachable Firestore credentials degrade
 * gracefully with a structured warning unless `--strict` or `FIRESTORE_INGEST_STRICT=true`
 * is specified.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './validate_advisory_csv.mjs';
import { persistForecasts, validateServiceAccountEnv } from '../backend/forecastPersistence.js';

const NUMERIC_FIELDS = [
  'district_id',
  'latitude',
  'longitude',
  'severity_score',
  'final_severity',
  'model_severity',
  'model_severity_raw',
  'physics_severity',
  'confidence',
  'confidence_raw',
  'confidence_calibrated',
  'temperature_max',
  'temperature_min',
  'precipitation_mm',
  'wind_max_kmh',
  'prob_top1',
  'prob_top2',
  'prob_top3',
];

export function coerceForecastCsvRow(rawRow) {
  const row = { ...rawRow };
  for (const field of NUMERIC_FIELDS) {
    if (row[field] !== undefined && row[field] !== '') {
      const parsed = Number(row[field]);
      if (Number.isFinite(parsed)) {
        row[field] = parsed;
      }
    } else {
      delete row[field];
    }
  }
  if (row.physics_override !== undefined) {
    row.physics_override =
      row.physics_override === true ||
      row.physics_override === 'true' ||
      row.physics_override === 'True' ||
      row.physics_override === '1';
  }
  return row;
}

export async function ingestForecastCsv(
  csvPath = 'backend/data/forecasts/hazardnet_forecasts_latest.csv',
  options = {},
) {
  const {
    allowUncalibrated = true,
    strict = process.env.FIRESTORE_INGEST_STRICT === 'true',
    env = process.env,
    db = undefined,
  } = options;

  const resolvedPath = path.resolve(process.cwd(), csvPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Forecast CSV not found at ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, 'utf8');
  const { rows: rawRows } = parseCsv(content);
  if (rawRows.length === 0) {
    throw new Error(`Forecast CSV is empty: ${resolvedPath}`);
  }

  const rows = rawRows.map(coerceForecastCsvRow);
  if (!allowUncalibrated) {
    const uncalibrated = rows.filter(
      (r) => r.confidence_calibrated === undefined && r.confidence === undefined,
    );
    if (uncalibrated.length > 0) {
      throw new Error(`Refusing to ingest ${uncalibrated.length} rows without calibrated confidence`);
    }
  }

  const predictionDate = rows[0]?.prediction_date || null;

  if (!db) {
    const preFlight = validateServiceAccountEnv(env);
    if (!preFlight.valid) {
      const msg = `Skipping Firestore persistence: ${preFlight.reason}`;
      if (strict) {
        throw new Error(msg);
      }
      console.warn(`::warning::[ingest_forecast_csv] ${msg}`);
      return { status: 'skipped', reason: preFlight.reason, written: 0, predictionDate };
    }
  }

  try {
    const result = await persistForecasts(rows, predictionDate, db);
    console.log(
      `[ingest_forecast_csv] Persisted ${result.written} forecast rows for prediction_date=${predictionDate}`,
    );
    return { status: 'persisted', written: result.written, predictionDate };
  } catch (err) {
    if (strict) {
      throw err;
    }
    console.warn(
      `::warning::[ingest_forecast_csv] Firestore write degraded gracefully (${err.message}). Static snapshots remain authoritative.`,
    );
    return { status: 'degraded', error: err.message, written: 0, predictionDate };
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const csvArg = args.find((a) => !a.startsWith('--'));
  const allowUncalibrated = args.includes('--allow-uncalibrated');
  const strict = args.includes('--strict') || process.env.FIRESTORE_INGEST_STRICT === 'true';

  ingestForecastCsv(csvArg, { allowUncalibrated, strict })
    .then((res) => {
      console.log('[ingest_forecast_csv] Result:', JSON.stringify(res));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[ingest_forecast_csv] Fatal error:', err.message);
      process.exit(1);
    });
}
