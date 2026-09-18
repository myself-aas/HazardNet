#!/usr/bin/env node
/**
 * Build the static forecast snapshot that ships inside the website bundle.
 *
 * The producer is `.github/workflows/daily_forecast.yml` (and nothing else
 * since 2026-09-17, when the Kaggle-backed workflows were removed): it runs
 * scripts/auto_forecast.py on the runner (GEE + Open-Meteo + TFLite), promotes
 * the CSV with scripts/publish_forecast_csv.py, and then runs this script to
 * emit frontend/public/data/forecasts-latest.json.
 *
 * The provenance stamped into `source`/`producer` therefore follows the
 * caller: set SNAPSHOT_SOURCE so a snapshot can never claim to come from a
 * producer that did not make it.
 *
 * Why a static snapshot?
 *  - The committed CSV alone only reaches the API after an ingest into the
 *    forecast store. The snapshot makes the refreshed data part of the
 *    website codebase itself: it is bundled by Vite, served by the backend's
 *    static handler, and redeployed on every push — so the site carries the
 *    latest forecast even if the API/store is unreachable (the
 *    frontend's useForecasts() hook falls back to it, see
 *    frontend/src/lib/forecasts.ts → fetchStaticForecastSnapshot()).
 *  - It is also a cache-busting input: the file is committed whenever the
 *    forecast data changed, which triggers a fresh deployment.
 *
 * Usage:
 *   node scripts/build_forecast_snapshot.mjs [csvPath] [outPath]
 * Defaults:
 *   csvPath = backend/data/forecasts/hazardnet_forecasts_latest.csv
 *   outPath = frontend/public/data/forecasts-latest.json
 * Env:
 *   SNAPSHOT_SOURCE = provenance string written to `source`
 *                     (default: the daily workflow's SNAPSHOT_SOURCE string)
 *
 * Zero runtime dependencies (hand-rolled RFC4180 CSV reader) so the pipeline
 * never needs an install step just to refresh the website data.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CSV_PATH = resolve(process.argv[2] || 'backend/data/forecasts/hazardnet_forecasts_latest.csv');
const OUT_PATH = resolve(process.argv[3] || 'frontend/public/data/forecasts-latest.json');
// Provenance is caller-supplied: daily_forecast.yml passes its own string
// (same as this default — SNAPSHOT_SOURCE in the workflow's env: block).
const SOURCE = process.env.SNAPSHOT_SOURCE
  || 'github-actions: scripts/auto_forecast.py (GEE + Open-Meteo + TFLite)';

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
    console.error('   Run scripts/auto_forecast.py first (or the daily_forecast workflow).');
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
  const HORIZON_DAYS = { '7_days': 7, '15_days': 15 };

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

    // Meteorological (Open-Meteo) fields — the District Detail page's CSV
    // table renders Temp (Min/Max) / Precip. / Wind Max from these, and until
    // 2026-09-16 the snapshot silently dropped them, so the site showed "—"
    // for every weather column whenever it ran off the committed snapshot.
    // Canonical column names win; the legacy om_* aliases are converted with
    // EXACTLY the same rules as the ingest boundary (backend/utils/
    // forecastRow.js): om_temp_2m_k/om_max_temp_k/om_min_temp_k/om_dewpoint_k
    // hold °C despite the suffix, om_precip_m is metres over the horizon,
    // om_wind_max_ms is m/s, om_solar_rad_j is kJ/m² over the horizon and
    // om_et_sum_m is mm over the horizon (both converted to per-day values).
    const days = HORIZON_DAYS[horizon];
    const round4 = (v) => (v === null ? null : Math.round(v * 10000) / 10000);
    const legacy = (name, transform = (v) => v) => {
      const v = num(get(cells, name));
      return v === null ? null : transform(v);
    };
    const meteorological = {
      temperature_mean: num(get(cells, 'temperature_mean')) ?? legacy('om_temp_2m_k'),
      temperature_max: num(get(cells, 'temperature_max')) ?? legacy('om_max_temp_k'),
      temperature_min: num(get(cells, 'temperature_min')) ?? legacy('om_min_temp_k'),
      precipitation_mm: num(get(cells, 'precipitation_mm')) ?? legacy('om_precip_m', (v) => v * 1000),
      wind_max_kmh: num(get(cells, 'wind_max_kmh')) ?? legacy('om_wind_max_ms', (v) => v * 3.6),
      dewpoint_mean: num(get(cells, 'dewpoint_mean')) ?? legacy('om_dewpoint_k'),
      solar_radiation_mj_m2: num(get(cells, 'solar_radiation_mj_m2'))
        ?? legacy('om_solar_rad_j', (v) => (v / 1000) / days),
      evapotranspiration_mm: num(get(cells, 'evapotranspiration_mm'))
        ?? legacy('om_et_sum_m', (v) => v / days),
    };
    for (const [field, value] of Object.entries(meteorological)) {
      if (value !== null && Number.isFinite(value)) row[field] = round4(value);
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
