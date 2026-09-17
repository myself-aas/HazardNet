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
// The Kaggle string is the legacy default, and it is a *claim*: a snapshot rebuilt by hand from
// a CSV that came off the GitHub Actions pipeline was previously stamped "kaggle kernels output
// …" because the caller did not set SNAPSHOT_SOURCE. The workflows do set it (daily_forecast.yml
// passes the Actions string), so this branch only runs for local/manual rebuilds — where the
// honest answer is that nobody declared a producer. `docs/ops/SEO_AND_CONTENT.md` §7 records the
// committed snapshot that still carries the old label; its rows match the committed CSV exactly.
const SOURCE = process.env.SNAPSHOT_SOURCE
  || `unspecified: built outside a workflow (no SNAPSHOT_SOURCE); the Kaggle slug would have been ${KERNEL}`;
const REPORT_PATH = resolve(process.env.SNAPSHOT_RUN_REPORT || 'hazardnet_run_report.json');
// Published alongside the CSV/JSON sidecar by scripts/publish_forecast_csv.py.
// It carries the per-unit and run-level `dataset_version` (PRODUCT_SPEC §5.8);
// without it the snapshot can still be built, but it must say the inputs behind
// the rows are unnamed rather than implying lineage it does not have.
const SCENE_MANIFEST_PATH = resolve(
  process.env.SCENE_MANIFEST || 'backend/data/forecasts/hazardnet_scene_manifest.json'
);
let REPORT = null;
let reportCoverage = null;
let sceneManifest = null;

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

/**
 * How many districts the site itself ships (`frontend/src/data/bangladeshDistricts.ts`).
 *
 * The denominator a coverage statement needs. Read (not imported) so the builder
 * stays dependency-free; returns null when the file is missing, in which case
 * coverage falls back to what the CSV alone can prove.
 *
 * Deliberately a *count*, not a name-to-id mapping: the site keys districts by
 * slug and the pipeline by numeric GAUL id, and their spellings differ for a
 * handful of districts ("Nawabganj" vs "Chapainawabganj"). Guessing that mapping
 * here could assert a district is covered when it is not. The producer's run
 * report carries the authoritative ids and names.
 */
function readExpectedDistrictCount() {
  for (const path of [
    resolve('frontend/src/data/bangladeshDistricts.ts'),
    resolve('../frontend/src/data/bangladeshDistricts.ts'),
  ]) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    // Count only the district array (`ALL_64_DISTRICTS`), never the 8 division
    // entries that follow it in the same file.
    const array = text.split('ALL_64_DISTRICTS')[1]?.split('];')[0] ?? '';
    const entries = (array.match(/\{\s*id:\s*'/g) ?? []).length;
    if (entries > 0) return entries;
  }
  return null;
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

  // Run report (coverage/provenance from scripts/auto_forecast.py). Optional so a
  // bare checkout can still rebuild a snapshot, but its absence is stated.
  if (existsSync(REPORT_PATH)) {
    try {
      REPORT = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
      reportCoverage = REPORT.coverage ?? null;
    } catch (err) {
      console.warn(`[snapshot] ignoring unreadable run report ${REPORT_PATH}: ${err.message}`);
    }
  } else {
    console.warn(`[snapshot] no run report at ${REPORT_PATH} — coverage will be derived from the CSV alone.`);
  }

  // Scene lineage (PRODUCT_SPEC §5.8). Optional file, but its absence is stated:
  // a snapshot whose rows cannot name their inputs must say so.
  if (existsSync(SCENE_MANIFEST_PATH)) {
    try {
      sceneManifest = JSON.parse(readFileSync(SCENE_MANIFEST_PATH, 'utf8'));
    } catch (err) {
      console.warn(`[snapshot] ignoring unreadable scene manifest ${SCENE_MANIFEST_PATH}: ${err.message}`);
    }
  } else {
    console.warn(`[snapshot] no scene manifest at ${SCENE_MANIFEST_PATH} — rows will not carry a dataset_version.`);
  }

  const [header, ...recordsRaw] = parseCsv(readFileSync(CSV_PATH, 'utf8'));
  const records = recordsRaw;
  if (!header || records.length === 0) {
    console.error('❌ Forecast CSV is empty.');
    process.exit(1);
  }
  const idx = Object.fromEntries(header.map((name, i) => [name.trim(), i]));
  const get = (cells, name) => (idx[name] !== undefined ? cells[idx[name]]?.trim() : undefined);

  /** First non-empty value of `field` across the CSV (provenance columns). */
  const firstValue = (field) => {
    for (const cells of records) {
      const value = get(cells, field);
      if (value) return value;
    }
    return null;
  };

  // Mirrored from backend/utils/forecastRow.js VALID_HAZARDS and
  // scripts/physics_severity.py HAZARD_CLASSES; pinned by
  // scripts/tests/test_model_claims.py so the three cannot drift.
  const VALID_HAZARDS = new Set([
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone',
  ]);
  const VALID_HORIZONS = new Set(['7_days', '15_days']);
  const invalidHazards = new Map();
  const HORIZON_DAYS = { '7_days': 7, '15_days': 15 };

  const horizons = {};
  let dropped = 0;
  const predictionDates = new Set();

  for (const cells of records) {
    const horizon = get(cells, 'horizon');
    const hazard = get(cells, 'hazard_type');
    if (hazard && !VALID_HAZARDS.has(hazard)) {
      // Not just a dropped row: an unrecognised hazard label means the generator
      // and the site disagree about the class vocabulary (the shipped snapshot
      // contained bare class ordinals like "6" for exactly this reason). Report
      // it instead of silently shrinking the dataset.
      invalidHazards.set(hazard, (invalidHazards.get(hazard) ?? 0) + 1);
      dropped += 1;
      continue;
    }
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
      // Provenance (audit 2026-09-17): every published row must know which
      // model/tensor/pipeline produced it, so a forecast can be reproduced
      // from its own record. Absent values stay absent — never defaulted.
      ['model_version', 'model_version'],
      ['confidence_kind', 'confidence_kind'],
      ['tensor_build_id', 'tensor_build_id'],
      ['pipeline_version', 'pipeline_version'],
      ['run_id', 'run_id'],
      ['physics_top_hazard', 'physics_top_hazard'],
      ['physics_inputs_missing', 'physics_inputs_missing'],
    ]) {
      const v = get(cells, src);
      if (v) row[out] = v;
    }

    // Independently computed physics scores for ALL eight classes. These are
    // what let a consumer see a hazard the model missed (the shipped pipeline
    // only scored the class the model had already chosen).
    const physicsScores = {};
    for (const hazard of VALID_HAZARDS) {
      const key = 'physics_' + hazard.toLowerCase().replace(/\s+/g, '_');
      const value = num(get(cells, key));
      if (value !== null) physicsScores[key] = value;
    }
    if (Object.keys(physicsScores).length > 0) row.physics_scores = physicsScores;

    // Numeric/bool annotations, kept only when the CSV actually carried them.
    const agreement = get(cells, 'physics_agreement');
    if (agreement === 'True' || agreement === 'true') row.physics_agreement = true;
    else if (agreement === 'False' || agreement === 'false') row.physics_agreement = false;
    const divergence = num(get(cells, 'track_divergence'));
    if (divergence !== null) row.track_divergence = divergence;
    const topSeverity = num(get(cells, 'physics_top_severity'));
    if (topSeverity !== null) row.physics_top_severity = topSeverity;
    const soilFabricated = get(cells, 'soil_channels_fabricated');
    if (soilFabricated === 'True' || soilFabricated === 'true') row.soil_channels_fabricated = true;
    // Content hash over the inputs behind this prediction unit. Passed through
    // verbatim (the site never recomputes it), and dropped when it does not look
    // like a version — a bad value must not be published as if it were lineage.
    const datasetVersion = get(cells, 'dataset_version');
    if (datasetVersion && /^ds1\.[0-9a-f]{16}$/.test(datasetVersion)) {
      row.dataset_version = datasetVersion;
    }

    (horizons[horizon] ??= []).push(row);
  }

  const totalCount = Object.values(horizons).reduce((n, rows) => n + rows.length, 0);
  if (totalCount === 0) {
    console.error('❌ No valid forecast rows could be parsed from the CSV.');
    process.exit(1);
  }

  // Coverage is derived from the CSV, not assumed. A district present at one
  // horizon but not the other is a gap the site must label as "no current
  // forecast" rather than rendering static baseline numbers for it as if they
  // were today's (audit 2026-09-17, PRODUCT_SPEC §5.1).
  //
  // `requested_*` and `missing_district_ids` can only come from the producer's
  // run report — the CSV alone cannot say how many districts were *asked for*.
  // When the report is absent those fields stay null, which is the honest answer;
  // the committed district list is then used to say which of the 64 districts the
  // snapshot does not cover.
  const districtsByHorizon = {};
  const unitsByHorizon = {};
  for (const [name, rows] of Object.entries(horizons)) {
    districtsByHorizon[name] = [...new Set(rows.map((r) => Number(r.district_id)))].sort((a, b) => a - b);
    unitsByHorizon[name] = rows.length;
  }
  const covered = new Set(Object.values(districtsByHorizon).flat());
  const expectedDistricts = readExpectedDistrictCount();

  const coverage = {
    requested_units: reportCoverage?.requested_units ?? null,
    produced_units: totalCount,
    units_per_horizon: unitsByHorizon,
    districts_per_horizon: Object.fromEntries(
      Object.entries(districtsByHorizon).map(([name, ids]) => [name, ids.length])
    ),
    districts_covered: covered.size,
    districts_expected: expectedDistricts,
    // `null` means "not recorded", not "none missing": a CSV alone cannot say
    // which districts were asked for and failed. Only the producer's run report
    // can, which is why the daily job passes it here.
    missing_district_ids: reportCoverage?.missing_district_ids ?? null,
    missing_district_names: reportCoverage?.missing_district_names ?? null,
    horizons: reportCoverage?.horizons ?? Object.keys(horizons),
    skipped: reportCoverage?.skipped ?? [],
    status:
      reportCoverage?.status ??
      (expectedDistricts !== null && covered.size >= expectedDistricts ? 'complete' : 'partial'),
  };

  const provenance = {
    model_version: firstValue('model_version'),
    tensor_build_id: firstValue('tensor_build_id'),
    pipeline_version: firstValue('pipeline_version'),
    run_id: firstValue('run_id'),
  };

  // Lineage: the run-level version comes from the scene manifest; the count of
  // versioned rows is derived from the rows themselves, so a manifest claiming
  // more units than the CSV holds cannot inflate this.
  const versionedRows = Object.values(horizons).flat().filter((r) => r.dataset_version).length;
  const lineage = {
    dataset_version: sceneManifest?.dataset_version ?? null,
    scene_manifest_path: sceneManifest ? SCENE_MANIFEST_PATH : null,
    units_in_manifest: sceneManifest?.units?.length ?? null,
    rows_with_version: versionedRows,
    rows_total: totalCount,
    scenes_enumerated: sceneManifest?.scenes_enumerated ?? null,
    status: versionedRows === totalCount && totalCount > 0 ? 'complete' : 'partial',
  };
  if (lineage.status !== 'complete') {
    console.warn(`[snapshot] dataset_version present on ${versionedRows}/${totalCount} rows — the rest cannot name their inputs.`);
  }

  const snapshot = {
    schema: 'hazardnet-forecast-snapshot/v2',
    generated_at: new Date().toISOString(),
    source: SOURCE,
    kernel: KERNEL,
    prediction_date: predictionDates.size > 0 ? [...predictionDates].sort().at(-1) : null,
    provenance,
    coverage,
    lineage,
    dataset_version: lineage.dataset_version,
    soil_channels_fabricated: REPORT?.soil_channels_fabricated ?? null,
    horizons,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(snapshot)}\n`, 'utf8');
  console.log(`✅ Snapshot written: ${OUT_PATH}`);
  console.log(`   Rows: ${totalCount} (dropped ${dropped}) across horizons: ${Object.keys(horizons).join(', ')}`);
  console.log(`   Latest prediction_date: ${snapshot.prediction_date ?? 'unknown'}`);
  console.log(`   Source: ${snapshot.source}`);
  console.log(`   Coverage: ${coverage.produced_units} units, ${coverage.districts_covered} districts, status=${coverage.status}`);
  console.log(`   Lineage: dataset_version=${lineage.dataset_version ?? 'none'} (${lineage.rows_with_version}/${lineage.rows_total} rows versioned, ${lineage.status})`);
  if (provenance.model_version) console.log(`   Model: ${provenance.model_version} (tensor ${provenance.tensor_build_id ?? 'unknown'})`);
  if (snapshot.soil_channels_fabricated) console.log('   ⚠ soil channels fabricated (training means) — rows are stamped soil_channels_fabricated=true');
  if (invalidHazards.size > 0) {
    console.error(`❌ Unrecognised hazard labels dropped from the CSV: ${[...invalidHazards.entries()].map(([h, n]) => `${h}×${n}`).join(', ')}`);
    console.error('   The generator and the site disagree about the class vocabulary (e.g. bare class ordinals). Fix the producer before shipping this snapshot.');
    process.exitCode = 1;
  }
}

main();
