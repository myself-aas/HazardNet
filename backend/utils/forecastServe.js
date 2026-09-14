/**
 * Shared forecast-serving helpers — the single implementation behind BOTH the
 * Express routes (backend/routes/forecasts.js, self-hosted/Docker) and the
 * Vercel serverless handlers (api/v1/forecasts/*.js). Keeping query parsing,
 * history windowing, and CSV export here guarantees byte-identical API
 * behavior across runtimes (the API-parity gap that left production without
 * GET /bulk is closed by construction).
 */

import { VALID_HORIZONS } from './forecastRow.js';

export const HISTORY_MAX_WINDOW_DAYS = 90;
export const HISTORY_DEFAULT_WINDOW_DAYS = 30;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const CSV_COLUMNS = [
  'district_id', 'district_name', 'horizon', 'hazard_type', 'severity_score',
  'confidence', 'target_date', 'prediction_date', 'model_severity',
  'physics_severity', 'division', 'pcode', 'admin_level', 'adm2_name', 'adm2_pcode',
];

/** Kaggle provenance block served by GET /metadata (both runtimes). */
export function metadataDatasets() {
  return [
    {
      id: '7b9ed0ca41d930114260efabb71a7fbf616cb68456d30823ecfc2ac45732fe3c',
      name: 'hazardnet-weekly-forecasts',
      url: 'https://www.kaggle.com/datasets/ashifahmedshuvo/hazardnet-weekly-forecasts/',
      update_frequency: 'every 3 hours',
    },
    {
      id: 'auto-forecast-pipeline',
      name: 'hazardnet-auto-forecast-pipeline',
      url: 'https://www.kaggle.com/code/ashifahmedshuvo/hazardnet-auto-forecast-pipeline/',
      type: 'notebook',
    },
  ];
}

export function metadataDataSource() {
  return process.env.KAGGLE_KERNEL || process.env.KAGGLE_DATASET || 'ashifahmedshuvo/hazardnet-weekly-forecasts';
}

/**
 * Validate GET /bulk query. Horizon is required.
 * @returns {{ horizon: string } | { error: string }}
 */
export function parseBulkQuery(query) {
  const { horizon } = query || {};
  if (!horizon || !VALID_HORIZONS.includes(horizon)) {
    return { error: `Invalid horizon. Use: ${VALID_HORIZONS.join(', ')}` };
  }
  return { horizon };
}

function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/**
 * Validate GET /history query (window defaults to the last 30 days ending today).
 * @returns {{ from, to, horizon, districtId, format } | { error: string }}
 */
export function parseHistoryQuery(query) {
  const { from, to, horizon, district_id, format } = query || {};

  if (horizon !== undefined && !VALID_HORIZONS.includes(horizon)) {
    return { error: `Invalid horizon. Use: ${VALID_HORIZONS.join(', ')}` };
  }

  let districtId = null;
  if (district_id !== undefined && district_id !== '') {
    districtId = parseInt(district_id, 10);
    if (!Number.isInteger(districtId) || districtId < 0) {
      return { error: 'Invalid district_id — expected a non-negative integer' };
    }
  }

  const todayUtc = new Date().toISOString().slice(0, 10);
  const toDate = to !== undefined && to !== '' ? to : todayUtc;
  const fromDate = from !== undefined && from !== ''
    ? from
    : new Date(Date.parse(`${toDate}T00:00:00Z`) - HISTORY_DEFAULT_WINDOW_DAYS * 86_400_000)
      .toISOString().slice(0, 10);

  if (!isValidDate(fromDate) || !isValidDate(toDate)) {
    return { error: 'from/to must be valid YYYY-MM-DD dates' };
  }
  if (fromDate > toDate) {
    return { error: 'from must be <= to' };
  }
  const windowDays = (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000;
  if (windowDays > HISTORY_MAX_WINDOW_DAYS) {
    return { error: `Date window too large (${Math.floor(windowDays)} days) — max ${HISTORY_MAX_WINDOW_DAYS} days` };
  }

  return { from: fromDate, to: toDate, horizon: horizon || null, districtId, format };
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Render history rows as the ingest-compatible CSV export. */
export function historyRowsToCsv(rows) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((c) => csvEscape(row[c])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/** Metadata from one serving snapshot; legacy stores retain rollout compatibility. */
export async function readForecastMetadata(store) {
  const publication = await store.getLatestPublicationMetadata?.();
  if (publication) return publication;
  return {
    prediction_date: await store.getLatestPredictionDate(),
    ingestion_timestamp: await store.getLatestIngestionTimestamp(),
    data_source: metadataDataSource(),
    notebook_source: process.env.KAGGLE_KERNEL || 'ashifahmedshuvo/hazardnet-auto-forecast-pipeline',
  };
}
