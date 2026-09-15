#!/usr/bin/env node
/**
 * Build the static forecast snapshot that ships inside the website bundle.
 *
 * Two producers refresh backend/data/forecasts/hazardnet_forecasts_latest.csv
 * and then run this script to emit frontend/public/data/forecasts-latest.json:
 *
 *   1. GitHub-native (default since 2026-09-16): `.github/workflows/daily_forecast.yml`
 *      runs scripts/auto_forecast.py on the runner (GEE + Open-Meteo + TFLite)
 *      and promotes its CSV with scripts/publish_forecast_csv.py. No Kaggle.
 *   2. Kaggle (legacy, dispatch-only): forecast-pipeline/hourly/weekly download
 *      the notebook's output (`kaggle kernels output
 *      ashifahmedshuvo/hazardnet-auto-forecast-pipeline`).
 *
 * The provenance stamped into `source`/`producer` therefore follows the
 * caller: set SNAPSHOT_SOURCE (and SNAPSHOT_KERNEL if the slug differs) so a
 * snapshot can never claim to come from a producer that did not make it.
 *
 * Why a static snapshot?
 *  - The committed CSV alone only reaches the API after an ingest into the
 *    forecast store. The snapshot makes the refreshed data part of the
 *    website codebase itself: it is bundled by Vite, served by the backend's
 *    static handler, and redeployed on every push — so the site carries the
 *    latest hourly forecast even if the API/store is unreachable (the
 *    frontend's useForecasts() hook falls back to it, see
 *    frontend/src/lib/forecasts.ts → fetchStaticForecastSnapshot()).
 *  - It is also a cache-busting input: the file is committed hourly whenever
 *    the Kaggle output changed, which triggers a fresh deployment.
 *
 * Usage:
 *   node scripts/build_forecast_snapshot.mjs [csvPath] [outPath]
 * Defaults:
 *   csvPath = backend/data/forecasts/hazardnet_forecasts_latest.csv
 *   outPath = frontend/public/data/forecasts-latest.json
 * Env:
 *   SNAPSHOT_SOURCE = provenance string written to `source`
 *                     (default: "kaggle kernels output <SNAPSHOT_KERNEL>")
 *
 * Zero runtime dependencies (hand-rolled RFC4180 CSV reader) so the pipeline
 * never needs an install step just to refresh the website data.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CSV_PATH = resolve(process.argv[2] || 'backend/data/forecasts/hazardnet_forecasts_latest.csv');
const OUT_PATH = resolve(process.argv[3] || 'frontend/public/data/forecasts-latest.json');
const KERNEL = process.env.SNAPSHOT_KERNEL || 'ashifahmedshuvo/hazardnet-auto-forecast-pipeline';
// Provenance is caller-supplied: the Kaggle workers keep the historical
// string, the GitHub-native producer passes its own (see the header).
const SOURCE = process.env.SNAPSHOT_SOURCE || `kaggle kernels output ${KERNEL}`;

// ─── Minimal RFC4180 CSV parser (handles quotes, escaped quotes, CRLF) ───
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { pushField(); i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { pushRow(); i += 1; continue; }
    field += ch; i += 1;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  // Drop fully-empty trailing rows.
  return rows.filter((cells) => !(cells.length === 1 && cells[0].trim() === ''));
}

const num = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function main() {
  if (!existsSync(CSV_PATH)) {
    console.error(`❌ Forecast CSV not found: ${CSV_PATH}`);
    console.error('   Run scripts/fetch_kaggle_forecast.py first (or the hourly workflow).');
    process.exit(1);
  }

  const [header, ...records] = parseCsv(readFileSync(CSV_PATH, 'utf8'));
  if (!header || records.length === 0) {
    console.error('❌ Forecast CSV is empty.');
    process.exit(1);
  }
  const idx = Object.fromEntries(header.map((name, i) => [name.trim(), i]));
  const get = (cells, name) => (idx[name] !== undefined ? cells[idx[name]]?.trim() : undefined);

  const VALID_HAZARDS = new Set([
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone',
  ]);
  const VALID_HORIZONS = new Set(['7_days', '15_days']);

  const horizons = {};
  let dropped = 0;
  const predictionDates = new Set();

  for (const cells of records) {
    const horizon = get(cells, 'horizon');
    const hazard = get(cells, 'hazard_type');
    if (!VALID_HORIZONS.has(horizon) || !VALID_HAZARDS.has(hazard)) { dropped += 1; continue; }

    // Severity: legacy single-track column or the notebook's dual-track one.
    const severity = num(get(cells, 'severity_score')) ?? num(get(cells, 'model_severity'));
    const confidence = num(get(cells, 'confidence'));
    if (severity === null || confidence === null) { dropped += 1; continue; }

    const districtId = num(get(cells, 'district_id')) ?? num(get(cells, 'location_id'));
    const districtName = get(cells, 'district_name') ?? get(cells, 'location_name');
    if (districtId === null || !districtName) { dropped += 1; continue; }

    const targetDate = get(cells, 'target_date');
    const predictionDate = get(cells, 'prediction_date');
    if (!targetDate || !predictionDate) { dropped += 1; continue; }
    predictionDates.add(predictionDate.slice(0, 10));

    const row = {
      district_id: districtId,
      district_name: districtName,
      horizon,
      hazard_type: hazard,
      severity_score: severity,
      confidence,
      target_date: targetDate,
      prediction_date: predictionDate,
    };
    for (const [out, src] of [
      ['model_severity', 'model_severity'],
      ['physics_severity', 'physics_severity'],
      ['admin_level', 'admin_level'],
    ]) {
      const v = num(get(cells, src));
      if (v !== null) row[out] = v;
    }
    for (const [out, src] of [
      ['division', 'division'],
      ['pcode', 'pcode'],
      ['adm2_name', 'adm2_name'],
      ['adm2_pcode', 'adm2_pcode'],
      ['data_source', 'data_source'],
    ]) {
      const v = get(cells, src);
      if (v) row[out] = v;
    }

    (horizons[horizon] ??= []).push(row);
  }

  const totalCount = Object.values(horizons).reduce((n, rows) => n + rows.length, 0);
  if (totalCount === 0) {
    console.error('❌ No valid forecast rows could be parsed from the CSV.');
    process.exit(1);
  }

  const snapshot = {
    schema: 'hazardnet-forecast-snapshot/v1',
    generated_at: new Date().toISOString(),
    source: SOURCE,
    kernel: KERNEL,
    prediction_date: predictionDates.size > 0 ? [...predictionDates].sort().at(-1) : null,
    horizons,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(snapshot)}\n`, 'utf8');
  console.log(`✅ Snapshot written: ${OUT_PATH}`);
  console.log(`   Rows: ${totalCount} (dropped ${dropped}) across horizons: ${Object.keys(horizons).join(', ')}`);
  console.log(`   Latest prediction_date: ${snapshot.prediction_date ?? 'unknown'}`);
  console.log(`   Source: ${snapshot.source}`);
}

main();
