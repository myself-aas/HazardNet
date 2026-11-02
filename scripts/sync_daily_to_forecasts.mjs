#!/usr/bin/env node
/**
 * Synchronize the canonical 960-row daily Kaggle dataset (or committed forecast CSV)
 * across all website forecast artifacts:
 *   - backend/data/forecasts/hazardnet_forecasts_latest.{csv,json}
 *   - backend/data/forecasts/manifest.json
 *   - frontend/public/data/forecasts-latest.json
 *   - frontend/src/data/backendForecasts.json
 *   - frontend/public/data/hazardnet_forecasts_latest.json
 *   - frontend/public/data/climatic_hazards_summary.json
 *   - frontend/public/data/freshness.json
 *   - frontend/src/content/generated-routes.json
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parsePublicDailySnapshot,
  rollupDailySnapshotToHorizons,
} from '../backend/utils/dailyAdvisoryPublic.js';
import { forecastRowsToCsv, mapAdvisoryRows } from '../backend/utils/advisoryMapper.js';
import { rehearseAlertEngine } from './rehearse_alert_engine.mjs';
import { parseCsv } from './validate_advisory_csv.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function toCamelCaseRecord(row) {
  const meanTemp = row.temperature_mean !== undefined
    ? row.temperature_mean
    : row.temperature_max !== undefined && row.temperature_min !== undefined
      ? Math.round(((row.temperature_max + row.temperature_min) / 2) * 100) / 100
      : row.temperature_max ?? 0;

  return {
    districtId: row.district_id,
    districtName: row.district_name,
    division: row.division || '',
    pcode: row.pcode || '',
    horizon: row.horizon,
    hazardType: row.hazard_type,
    rawHazardType: row.hazard_type,
    modelSeverity: row.model_severity ?? row.severity_score,
    physicsSeverity: row.physics_severity ?? row.severity_score,
    severityScore: row.final_severity ?? row.severity_score,
    advisoryTier: row.advisory_tier ?? 'NORMAL',
    confidence: row.confidence,
    targetDate: row.target_date,
    predictionDate: row.prediction_date,
    dataSource: row.data_source || 'Kaggle_Daily_Advisory',
    temperatureMean: meanTemp,
    precipitationMm: row.precipitation_mm ?? 0,
    temperatureMax: row.temperature_max ?? meanTemp,
    temperatureMin: row.temperature_min ?? meanTemp,
    dewpointMean: row.dewpoint_mean ?? 0,
    solarRadiationMjM2: row.solar_radiation_mj_m2 ?? 0,
    windMaxKmh: row.wind_max_kmh ?? 0,
    evapotranspirationMm: row.evapotranspiration_mm ?? 0,
  };
}

export async function refreshAlertSnapshotFromForecasts({
  snapshotPath,
  alertsOutPath,
  horizon = '15_days',
  now = new Date(),
  rehearseFn = rehearseAlertEngine,
} = {}) {
  const report = await rehearseFn({ snapshotPath, horizon, now });
  if (!report || !Number.isFinite(report.assessed) || report.assessed <= 0) {
    throw new Error('Alert rehearsal assessed 0 rows; refusing to overwrite alerts-latest.json');
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'hn-alert-sync-'));
  try {
    const tmpRunPath = join(tmpDir, 'alert-run.json');
    writeFileSync(tmpRunPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    mkdirSync(dirname(alertsOutPath), { recursive: true });
    execFileSync(
      process.execPath,
      [
        resolve(ROOT, 'scripts/build_alert_snapshot.mjs'),
        '--in',
        tmpRunPath,
        '--out',
        alertsOutPath,
        '--allow-empty',
      ],
      { cwd: ROOT, stdio: 'pipe' },
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  return alertsOutPath;
}

export async function syncDailyToForecastArtifacts({
  root = ROOT,
  dailyJsonPath = null,
  dailyCsvPath = null,
  syncExisting = false,
  runDerivedBuilders = true,
  syncAlerts = true,
  now = new Date(),
} = {}) {
  const csvOutPath = resolve(root, 'backend/data/forecasts/hazardnet_forecasts_latest.csv');
  const jsonOutPath = resolve(root, 'backend/data/forecasts/hazardnet_forecasts_latest.json');
  const manifestOutPath = resolve(root, 'backend/data/forecasts/manifest.json');
  const snapshotOutPath = resolve(root, 'frontend/public/data/forecasts-latest.json');
  const alertsOutPath = resolve(root, 'frontend/public/data/alerts-latest.json');
  const backendFallbackPath = resolve(root, 'frontend/src/data/backendForecasts.json');
  const publicLegacyJsonPath = resolve(root, 'frontend/public/data/hazardnet_forecasts_latest.json');

  if (!dailyJsonPath && !dailyCsvPath && !syncExisting) {
    throw new Error('Specify --from-daily-json <path>, --from-daily-csv <path>, or --sync-existing');
  }

  if (dailyJsonPath) {
    const raw = JSON.parse(readFileSync(resolve(dailyJsonPath), 'utf8'));
    const snapshot = parsePublicDailySnapshot(raw);
    if (!snapshot) throw new Error('Invalid daily-advisories-v1.json snapshot');
    const rolled = rollupDailySnapshotToHorizons(snapshot);
    const combined = [];
    const byDistrict15 = new Map(rolled.horizons['15_days'].map((r) => [r.district_id, r]));
    const sortedNames = [...rolled.horizons['7_days']].sort((a, b) => a.district_name.localeCompare(b.district_name));
    for (const d7 of sortedNames) {
      combined.push(d7);
      const d15 = byDistrict15.get(d7.district_id);
      if (d15) combined.push(d15);
    }
    const csvContent = `${forecastRowsToCsv(combined)}\n`;
    mkdirSync(dirname(csvOutPath), { recursive: true });
    writeFileSync(csvOutPath, csvContent, 'utf8');
    const csvSha256 = createHash('sha256').update(csvContent).digest('hex');
    const manifest = {
      source: 'Kaggle_Daily_Advisory (hazardnet_advisories_latest.csv)',
      data_source: 'Kaggle_Daily_Advisory',
      generated_at: snapshot.run.generatedAt,
      prediction_date: snapshot.run.generatedAt.slice(0, 10),
      row_count: combined.length,
      csv_sha256: csvSha256,
      source_csv_sha256: snapshot.run.inputSha256,
      model_version: snapshot.run.modelVersion,
      run_id: snapshot.run.id,
      ...(snapshot.run.sourceDatasetVersion !== undefined ? { dataset_version: snapshot.run.sourceDatasetVersion } : {}),
      csv_path: 'backend/data/forecasts/hazardnet_forecasts_latest.csv',
      json_path: 'backend/data/forecasts/hazardnet_forecasts_latest.json',
    };
    writeFileSync(manifestOutPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  } else if (dailyCsvPath) {
    const rawCsvBytes = readFileSync(resolve(dailyCsvPath));
    const rawCsv = rawCsvBytes.toString('utf8');
    const { rows: rawRows } = parseCsv(rawCsv);
    const sourceSha = createHash('sha256').update(rawCsvBytes).digest('hex');
    const mapped = mapAdvisoryRows(rawRows, { sha256: sourceSha });
    mapped.sort((a, b) => a.district_name.localeCompare(b.district_name) || a.horizon.localeCompare(b.horizon));
    const csvContent = `${forecastRowsToCsv(mapped)}\n`;
    mkdirSync(dirname(csvOutPath), { recursive: true });
    writeFileSync(csvOutPath, csvContent, 'utf8');
    const csvSha256 = createHash('sha256').update(csvContent).digest('hex');
    const generatedAt = mapped[0]?.created_at || new Date().toISOString();
    const manifest = {
      source: 'Kaggle_Daily_Advisory (hazardnet_advisories_latest.csv)',
      data_source: 'Kaggle_Daily_Advisory',
      generated_at: generatedAt,
      prediction_date: mapped[0]?.prediction_date || generatedAt.slice(0, 10),
      row_count: mapped.length,
      csv_sha256: csvSha256,
      source_csv_sha256: sourceSha,
      model_version: mapped[0]?.model_version || '2.1.9+model.0bb5bdaf1789',
      csv_path: 'backend/data/forecasts/hazardnet_forecasts_latest.csv',
      json_path: 'backend/data/forecasts/hazardnet_forecasts_latest.json',
    };
    writeFileSync(manifestOutPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  if (!existsSync(csvOutPath)) {
    throw new Error(`Forecast CSV not found at ${csvOutPath}`);
  }

  execFileSync(process.execPath, [
    resolve(ROOT, 'scripts/build_forecast_snapshot.mjs'),
    csvOutPath,
    snapshotOutPath,
  ], { cwd: root, stdio: 'pipe' });

  const builtSnapshot = JSON.parse(readFileSync(snapshotOutPath, 'utf8'));
  const flatRows = [
    ...(builtSnapshot.horizons?.['7_days'] || []),
    ...(builtSnapshot.horizons?.['15_days'] || []),
  ].sort((a, b) => a.district_name.localeCompare(b.district_name) || a.horizon.localeCompare(b.horizon));

  mkdirSync(dirname(jsonOutPath), { recursive: true });
  writeFileSync(jsonOutPath, `${JSON.stringify(flatRows, null, 2)}\n`, 'utf8');

  mkdirSync(dirname(backendFallbackPath), { recursive: true });
  writeFileSync(backendFallbackPath, `${JSON.stringify(flatRows, null, 2)}\n`, 'utf8');

  const camelRows = flatRows.map(toCamelCaseRecord);
  mkdirSync(dirname(publicLegacyJsonPath), { recursive: true });
  writeFileSync(publicLegacyJsonPath, `${JSON.stringify(camelRows, null, 2)}\n`, 'utf8');

  let writtenAlertsPath = null;
  if (syncAlerts) {
    writtenAlertsPath = await refreshAlertSnapshotFromForecasts({
      snapshotPath: snapshotOutPath,
      alertsOutPath,
      now,
    });
  }

  if (runDerivedBuilders && root === ROOT) {
    execFileSync(process.execPath, [resolve(ROOT, 'scripts/build_climatic_hazards_summary.mjs')], {
      cwd: root,
      stdio: 'pipe',
    });
    execFileSync(process.execPath, [resolve(ROOT, 'scripts/build_freshness_artifact.mjs')], {
      cwd: root,
      stdio: 'pipe',
    });
    execFileSync(process.execPath, [resolve(ROOT, 'scripts/build_content_engine.mjs')], {
      cwd: root,
      stdio: 'pipe',
    });
  }

  return {
    rows: flatRows.length,
    predictionDate: builtSnapshot.prediction_date,
    snapshotOutPath,
    alertsOutPath: writtenAlertsPath,
  };
}

export const syncDailyToForecasts = syncDailyToForecastArtifacts;

async function main(argv) {
  let dailyJsonPath = null;
  let dailyCsvPath = null;
  let syncExisting = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--sync-existing') {
      syncExisting = true;
    } else if (arg === '--from-daily-json' && argv[i + 1]) {
      dailyJsonPath = argv[++i];
    } else if (arg === '--from-daily-csv' && argv[i + 1]) {
      dailyCsvPath = argv[++i];
    } else {
      throw new Error(`Unknown or incomplete option: ${arg}`);
    }
  }

  const res = await syncDailyToForecastArtifacts({ dailyJsonPath, dailyCsvPath, syncExisting });
  console.log(`[sync-daily-forecasts] Synchronized ${res.rows} rows (prediction_date=${res.predictionDate}) -> ${res.snapshotOutPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`[sync-daily-forecasts] Failed: ${err.message}`);
    process.exitCode = 1;
  });
}
