/**
 * The API's snapshot-backed read path — envelopes built from the committed artifacts
 * `frontend/public/data/forecasts-latest.json` and `frontend/public/data/daily-advisories-v1.json`.
 *
 * Platform-neutral (no node:* built-ins) so Cloudflare Pages Functions bundle cleanly.
 */

import {
  DAILY_ADVISORY_MAX_AGE_HOURS,
  parsePublicDailySnapshot,
  rollupDailySnapshotToHorizons,
} from './dailyAdvisoryPublic.js';
import { districtKey } from '../../packages/core/src/districtRegistry.js';
import {
  buildForecastIndex,
  effectiveDistrictRows,
  latestRowsByDistrict as latestRows,
} from '../../packages/core/src/forecastIndex.js';
import { VALID_HORIZONS } from './forecastRow.js';
import { predictFromStore } from './predictFromStore.js';

export const FORECAST_SNAPSHOT_PATH = '/data/forecasts-latest.json';
export const DAILY_SNAPSHOT_PATH = '/data/daily-advisories-v1.json';
export const DEFAULT_DATA_SOURCE = 'hazardnet/weekly-forecasts';
export const NOTEBOOK_SOURCE = 'hazardnet/forecast-pipeline';
export const DEFAULT_KAGGLE_DATASET = 'ashifahmedshuvo/hazardnet-weekly-forecasts';
export const DEFAULT_KAGGLE_FILE = 'hazardnet_advisories_latest.csv';

/**
 * District matching for the snapshot-backed read path.
 *
 * The alias table used to be a literal here — one of seven copies in the repository.
 * It now delegates to `packages/core`, which is the only place a GAUL spelling, a
 * post-2015 rename or an apostrophe variant is resolved.
 */
const normalizeDistrictLookup = (value) => districtKey(value);

export function snapshotDataSource(env) {
  const configured = env && typeof env.FORECAST_DATASET === 'string' ? env.FORECAST_DATASET.trim() : '';
  return configured || DEFAULT_DATA_SOURCE;
}

async function fetchJsonAsset(assets, request, path) {
  try {
    const response = await assets.fetch(
      new Request(new URL(path, request.url), {
        headers: { accept: 'application/json' },
      })
    );
    if (!response || !response.ok) {
      return { ok: false, status: response ? response.status : 0 };
    }
    const json = await response.json();
    return { ok: true, json };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : 'unknown error' };
  }
}

/**
 * Read `/data/forecasts-latest.json` through the Pages `ASSETS` binding (single-asset read).
 */
export async function loadForecastSnapshot(env, request) {
  const assets = env && env.ASSETS;
  if (!assets || typeof assets.fetch !== 'function') {
    return { error: 'the ASSETS binding is not available to this Function' };
  }

  let response;
  try {
    response = await assets.fetch(
      new Request(new URL(FORECAST_SNAPSHOT_PATH, request.url), {
        headers: { accept: 'application/json' },
      })
    );
  } catch (error) {
    return { error: `the snapshot asset could not be read (${error && error.message ? error.message : 'unknown error'})` };
  }

  if (!response || !response.ok) {
    return { error: `the snapshot asset answered ${response ? response.status : 'no response'}` };
  }

  let snapshot;
  try {
    snapshot = await response.json();
  } catch (error) {
    return { error: `the snapshot asset is not JSON (${error && error.message ? error.message : 'parse error'})` };
  }

  if (!snapshot || typeof snapshot !== 'object' || !snapshot.horizons || typeof snapshot.horizons !== 'object') {
    return { error: 'the snapshot asset is not a hazardnet-forecast-snapshot' };
  }

  return { snapshot };
}

/**
 * Read `/data/daily-advisories-v1.json` alongside `/data/forecasts-latest.json` so
 * `/api/predict` and `/api/v1/kaggle` prefer a newer 960-row daily Kaggle run when present.
 */
export async function loadForecastOrDailySnapshot(env, request) {
  const assets = env && env.ASSETS;
  if (!assets || typeof assets.fetch !== 'function') {
    return { error: 'the ASSETS binding is not available to this Function' };
  }

  const [forecastRes, dailyRes] = await Promise.all([
    fetchJsonAsset(assets, request, FORECAST_SNAPSHOT_PATH),
    fetchJsonAsset(assets, request, DAILY_SNAPSHOT_PATH),
  ]);

  let dailyRollup = null;
  let dailyMeta = null;
  if (dailyRes.ok) {
    const parsedDaily = parsePublicDailySnapshot(dailyRes.json);
    if (parsedDaily) {
      dailyRollup = rollupDailySnapshotToHorizons(parsedDaily);
      dailyMeta = parsedDaily.run;
    }
  }

  if (forecastRes.ok) {
    const snapshot = forecastRes.json;
    if (snapshot && typeof snapshot === 'object' && snapshot.horizons && typeof snapshot.horizons === 'object') {
      if (dailyRollup && dailyRollup.prediction_date >= (snapshot.prediction_date || '')) {
        return {
          snapshot: {
            ...snapshot,
            generated_at: dailyRollup.generated_at,
            prediction_date: dailyRollup.prediction_date,
            horizons: dailyRollup.horizons,
          },
          dailyMeta,
        };
      }
      return { snapshot, dailyMeta };
    }
    if (!dailyRollup) {
      return { error: 'the snapshot asset is not a hazardnet-forecast-snapshot' };
    }
  }

  if (dailyRollup) {
    return { snapshot: dailyRollup, dailyMeta };
  }

  if (forecastRes.error) {
    return { error: `the snapshot asset is not JSON (${forecastRes.error})` };
  }
  return { error: `the snapshot asset answered ${forecastRes.status || 'no response'}` };
}

export function snapshotRows(snapshot, horizon) {
  const rows = snapshot && snapshot.horizons ? snapshot.horizons[horizon] : undefined;
  return Array.isArray(rows) ? rows : [];
}

/**
 * One row per district for one horizon — the rule `GET /bulk` is named after.
 *
 * "One row per district" was true of the committed snapshot (the builder writes one row per
 * district) and false of every other source: the daily rollup carries up to 15 rows per
 * district (one per forecast day), so an ADM3-shaped or daily-shaped payload ran straight
 * through the edge while the Node handler read a store that had already collapsed it. Three
 * readers therefore each had their own *private* rule — `useForecasts` compared
 * `rows[0].prediction_date`, `storedPrediction` sorted and took the first match,
 * `rollupAdm3ToDistricts` kept the max-severity unit — and a fourth (this envelope) had none.
 *
 * `buildForecastIndex` is the rule, and it is now the only one: roll ADM3 units up to their
 * ADM2 parent, then keep the newest row per district. Two behaviours follow, both deliberate:
 *
 *   · a daily (15-step) payload yields 64 rows here rather than 960, which is what the endpoint
 *     name promises and what the map renders;
 *   · the response carries **promoted rows**, not the committed array. They are the same objects
 *     the snapshot held — the field names, types and values are unchanged — but a test that
 *     asserted array *identity* against the file is now asserting something the endpoint never
 *     promised. `__tests__/pagesForecasts.test.js` compares by content.
 */
export function latestRowsByDistrict(rows) {
  return latestRows(Array.isArray(rows) ? rows : []);
}

export function bulkEnvelopeFromSnapshot(snapshot, horizon, { dataSource, generatedAt } = {}) {
  const rows = latestRowsByDistrict(snapshotRows(snapshot, horizon));
  return {
    horizon,
    count: rows.length,
    generated_at: generatedAt || new Date().toISOString(),
    data_source: dataSource || DEFAULT_DATA_SOURCE,
    forecasts: rows,
  };
}

export function metadataEnvelopeFromSnapshot(snapshot, { dataSource, generatedAt, datasets } = {}) {
  const horizonRows = Object.values(snapshot && snapshot.horizons ? snapshot.horizons : {})
    .filter((rows) => Array.isArray(rows));
  // The headline audit is taken over the raw artifact on purpose: `row_count` states how many
  // rows the deployment holds, while `forecasts` on /bulk states one per district.
  const rowCount = horizonRows.reduce((total, rows) => total + rows.length, 0);

  const newestPredictionDate = horizonRows
    .flat()
    .map((row) => (row && typeof row.prediction_date === 'string' ? row.prediction_date : null))
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  const predictionDate = snapshot && typeof snapshot.prediction_date === 'string'
    ? snapshot.prediction_date
    : newestPredictionDate;

  return {
    prediction_date: predictionDate,
    ingestion_timestamp: snapshot && typeof snapshot.generated_at === 'string' ? snapshot.generated_at : null,
    data_source: dataSource || DEFAULT_DATA_SOURCE,
    row_count: rowCount,
    notebook_source: NOTEBOOK_SOURCE,
    datasets: Array.isArray(datasets) ? datasets : [],
    generated_at: generatedAt || new Date().toISOString(),
  };
}

/**
 * `POST /api/predict` — edge twin of `backend/utils/storedPrediction.js`.
 */
export function storedPredictionFromSnapshot(snapshot, body, { now = new Date(), storeLatencyMs = 0 } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 422, body: { error: 'District payload required' } };
  }
  if ('tensor' in body || 'rasterName' in body) {
    return {
      status: 400,
      body: { error: 'On-demand tensor/raster inference is retired. Supply a district and horizon.' },
    };
  }
  const district = body.district_id ?? body.districtId;
  if (
    !['string', 'number'].includes(typeof district) ||
    !String(district).trim() ||
    String(district).length > 100 ||
    !/^[a-zA-Z0-9 _'-]+$/.test(String(district))
  ) {
    return { status: 422, body: { error: 'A valid district_id or districtId is required' } };
  }
  const horizon = body.horizon ?? '7_days';
  if (!VALID_HORIZONS.includes(horizon)) {
    return { status: 400, body: { error: 'Invalid horizon. Use: 7_days, 15_days' } };
  }

  // Same rule as /bulk: the newest row per district, after the ADM3 rollup. This used to sort
  // every row of the horizon and take the first name match, so a daily payload could answer
  // with an upazila row while /bulk answered with the district's dominant one.
  const numeric = /^\d+$/.test(String(district).trim());
  const targetKey = normalizeDistrictLookup(district);
  const byDistrict = buildForecastIndex(effectiveDistrictRows(snapshotRows(snapshot, horizon)));
  const selected = [...byDistrict.values()].find((row) => {
    if (!row || typeof row !== 'object') return false;
    if (numeric) return String(row.district_id) === String(district).trim();
    return normalizeDistrictLookup(row.district_name || '') === targetKey;
  });

  if (!selected) {
    return { status: 404, body: { error: 'No stored forecast for this district and horizon' } };
  }

  return {
    status: 200,
    body: predictFromStore(selected, { now, storeLatencyMs }),
  };
}

/**
 * `GET /api/v1/kaggle` & `GET /api/v1/kaggle/advisories` — edge twin of `serverless/v1/kaggle.js`.
 * @param {any} snapshot
 * @param {string} horizon
 * @param {{ dailyMeta?: any, now?: Date }} [options]
 */
export function kaggleEnvelopeFromSnapshot(snapshot, horizon, options = {}) {
  const { dailyMeta = null, now = new Date() } = options;
  // The Kaggle mirror publishes the same per-district answer the map reads, not the raw
  // artifact: a consumer comparing it with /bulk must not see 960 rows here and 64 there.
  const rows = latestRowsByDistrict(snapshotRows(snapshot, horizon));
  const generatedAt = (dailyMeta && dailyMeta.generatedAt)
    || (snapshot && typeof snapshot.generated_at === 'string' ? snapshot.generated_at : null);
  const cutoffMs = dailyMeta && dailyMeta.dataCutoff
    ? Date.parse(dailyMeta.dataCutoff)
    : generatedAt
      ? Date.parse(generatedAt)
      : NaN;
  const isStale = !Number.isFinite(cutoffMs)
    || now.getTime() - cutoffMs > DAILY_ADVISORY_MAX_AGE_HOURS * 3_600_000;

  return {
    status: rows.length === 0 ? 'unavailable' : isStale ? 'stale' : 'fresh',
    source: dailyMeta ? 'kaggle-daily-snapshot' : 'forecast-snapshot',
    dataset: DEFAULT_KAGGLE_DATASET,
    file: DEFAULT_KAGGLE_FILE,
    horizon,
    fetchedAt: generatedAt,
    generatedAt,
    sha256: dailyMeta?.inputSha256 ?? null,
    rowCount: rows.length,
    lastError: null,
    data: rows,
  };
}
