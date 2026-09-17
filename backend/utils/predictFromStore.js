/**
 * predictFromStore — shape a **stored** forecast row into the `/api/predict`
 * response envelope (ADR 0009: the API reads forecasts; it never computes them).
 *
 * WHY THIS EXISTS
 * ---------------
 * The interactive inference endpoint (`backend/routes/predict.js` +
 * `backend/inference.js`) is not deployed, loads no model weights, and every
 * frontend caller sends a district rather than the 614,400-float tensor the
 * validator demands — so in production those calls 422 and the UI silently falls
 * back to a static baseline. ADR 0009 replaces the computation with a read of
 * the newest stored forecast for a district + horizon.
 *
 * THE INVARIANT: NOTHING IS INVENTED
 * ----------------------------------
 * Every value in the envelope is either
 *   1. copied from the stored row,
 *   2. derived from it by a documented rule (`severity_bin`, `channel_features`
 *      mapping), or
 *   3. `null`, and named in `metadata.fields_unavailable`.
 *
 * A missing number is a fact about the data, not an invitation to synthesize
 * one. This is the same discipline as `validateTensor`'s 422 and the
 * `DataProcessingSkeleton` rewrite: a hazard product that guesses is worse than
 * one that says "not recorded".
 *
 * WHAT THE STORED ROW CANNOT FILL TODAY (Phase 2 shrinks this list)
 * ----------------------------------------------------------------
 * - `class_probabilities` / `top_3` — the pipeline publishes only the argmax
 *   (`hazard_type`) and its softmax score (`confidence`), not the 8-way
 *   distribution. Deriving a one-hot from the argmax would be fabrication.
 * - `channel_features.ndvi/ndwi/soil_moisture/sar_vv` — the SAR/optical driver
 *   values are not published; only the meteorological drivers are.
 * - `inference.latency_ms` — serving a stored row involves no inference. The
 *   field is `null`, not 0, and certainly not a plausible-looking constant.
 * - `inference.model_version` — null unless the row itself records the model
 *   that produced it (PRODUCT_SPEC §5.8: rows currently do not).
 *
 * STATUS: not wired to a route yet — this is the Phase 1 seam. Phase 4 rewires
 * the callers in `Dashboard.tsx`, `UploadPage.tsx`, `usePrediction.ts` and
 * `serviceWorker.ts` onto it and deletes the tensor path.
 */

import { VALID_HAZARDS } from './forecastRow.js';

/** Envelope schema id — bump when the shape changes. */
export const PREDICT_ENVELOPE_SCHEMA = 'hazardnet-predict-envelope/v1';

/**
 * How `prediction.confidence` came to be. A consumer (and the UI copy) must be
 * able to tell an uncalibrated softmax from a calibrated probability; until the
 * Phase 3 calibration work lands, the stored value is the former.
 */
export const CONFIDENCE_KIND_SOFTMAX = 'model_softmax_top_class';
export const CONFIDENCE_KIND_CALIBRATED = 'calibrated_probability';

/**
 * Envelope fields that may legitimately be `null`, as dot-paths. Every entry
 * that ends up null is reported in `metadata.fields_unavailable`, and
 * `__tests__/predictFromStore.test.js` asserts the two agree in both
 * directions — so adding a field to a row without updating this module (or the
 * reverse) fails the build instead of silently changing what the API promises.
 */
export const NULLABLE_PATHS = [
  'prediction.class_probabilities',
  'prediction.top_3',
  'prediction.channel_features.ndvi',
  'prediction.channel_features.ndwi',
  'prediction.channel_features.soil_moisture',
  'prediction.channel_features.sar_vv',
  'inference.latency_ms',
  'inference.model_version',
];

/** Map of envelope driver field -> stored row field (+ any unit passthrough). */
const CHANNEL_FEATURE_SOURCES = {
  precip_mean: 'precipitation_mm',
  max_temp: 'temperature_max',
  min_temp: 'temperature_min',
};

/**
 * Severity banding. Kept identical to `backend/inference.js::severityBin`
 * (0.33 / 0.66) so the two cannot disagree while both exist; the drift guard in
 * the test file is deleted together with `inference.js` in Phase 4.
 */
export function severityBin(score) {
  if (score <= 0.33) return 'Low';
  if (score <= 0.66) return 'Moderate';
  return 'High';
}

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

function requireNumber(row, field) {
  const value = row[field];
  if (!isFiniteNumber(value)) {
    throw new TypeError(
      `predictFromStore: stored row is missing a numeric "${field}" (got ${JSON.stringify(value)}). ` +
        'Refusing to serve a forecast without it.'
    );
  }
  return value;
}

/** Collect the dot-paths that ended up null, in NULLABLE_PATHS order. */
function collectUnavailable(envelope) {
  const read = (path) =>
    path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), envelope);
  return NULLABLE_PATHS.filter((path) => read(path) == null);
}

/**
 * Build the `/api/predict` envelope from a stored forecast row.
 *
 * @param {object} row - a row from the forecast store or the committed snapshot
 *   (`scripts/build_forecast_snapshot.mjs` shape).
 * @param {object} [options]
 * @param {number} [options.storeLatencyMs] - measured time to fetch the row from
 *   the store, if the caller measured one. Reported separately from inference
 *   latency so the two are never conflated.
 * @param {Date}   [options.now] - injectable clock (tests).
 * @returns {object} envelope; see `docs/architecture/TARGET_ARCHITECTURE.md` §3.4
 */
export function predictFromStore(row, options = {}) {
  if (row == null || typeof row !== 'object') {
    throw new TypeError('predictFromStore: a stored forecast row is required');
  }

  const hazard = row.hazard_type;
  if (!isNonEmptyString(hazard) || !VALID_HAZARDS.includes(hazard)) {
    throw new TypeError(
      `predictFromStore: unknown hazard_type ${JSON.stringify(hazard)}. ` +
        `Expected one of: ${VALID_HAZARDS.join(', ')}.`
    );
  }

  const severity = requireNumber(row, 'severity_score');
  const confidence = requireNumber(row, 'confidence');
  const { now = new Date(), storeLatencyMs = null } = options;

  const channelFeatures = {};
  for (const [field, source] of Object.entries(CHANNEL_FEATURE_SOURCES)) {
    channelFeatures[field] = isFiniteNumber(row[source]) ? row[source] : null;
  }
  // Not published by the pipeline (see header): explicitly null, never guessed.
  channelFeatures.ndvi = null;
  channelFeatures.ndwi = null;
  channelFeatures.soil_moisture = null;
  channelFeatures.sar_vv = null;

  const modelVersion = isNonEmptyString(row.model_version) ? row.model_version : null;

  const envelope = {
    prediction: {
      hazard,
      // The stored score is the model's own softmax for its chosen class; it is
      // not a calibrated probability and not a model/physics agreement measure.
      confidence,
      confidence_kind: isNonEmptyString(row.confidence_kind)
        ? row.confidence_kind
        : CONFIDENCE_KIND_SOFTMAX,
      severity_score: severity,
      severity_bin: severityBin(severity),
      class_probabilities: null,
      top_3: null,
      channel_features: channelFeatures,
    },
    provenance: {
      district_id: row.district_id ?? null,
      district_name: row.district_name ?? null,
      division: row.division ?? null,
      pcode: row.pcode ?? null,
      horizon: row.horizon ?? null,
      prediction_date: row.prediction_date ?? null,
      target_date: row.target_date ?? null,
      model_severity: isFiniteNumber(row.model_severity) ? row.model_severity : null,
      physics_severity: isFiniteNumber(row.physics_severity) ? row.physics_severity : null,
      data_source: row.data_source ?? null,
    },
    inference: {
      // No inference happened to serve this response. `null`, not a number.
      latency_ms: null,
      store_latency_ms: isFiniteNumber(storeLatencyMs) ? storeLatencyMs : null,
      model_version: modelVersion,
      timestamp: now.toISOString(),
      served_from: 'stored-forecast',
    },
    metadata: {
      schema: PREDICT_ENVELOPE_SCHEMA,
      source_schema: row.schema ?? null,
      fields_unavailable: [],
    },
  };

  envelope.metadata.fields_unavailable = collectUnavailable(envelope);
  return envelope;
}

export default predictFromStore;
