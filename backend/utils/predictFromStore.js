/** Stored forecast envelope (ADR 0009). No model executes in the HTTP path.
 * Values are copied from a stored row, explicitly derived, or returned as null.
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
  'prediction.channel_features.precip_mean',
  'prediction.channel_features.max_temp',
  'prediction.channel_features.min_temp',
  'prediction.channel_features.ndvi',
  'prediction.channel_features.ndwi',
  'prediction.channel_features.soil_moisture',
  'prediction.channel_features.sar_vv',
  'inference.latency_ms',
  'inference.model_version',
  'inference.store_latency_ms',
  'provenance.district_id',
  'provenance.district_name',
  'provenance.division',
  'provenance.pcode',
  'provenance.horizon',
  'provenance.prediction_date',
  'provenance.target_date',
  'provenance.model_severity',
  'provenance.physics_severity',
  'provenance.data_source',
  'metadata.source_schema',
  // Independent physics track — present only from the 2026-09-17 pipeline
  // onward, so rows published before it legitimately lack these (PRODUCT_SPEC
  // §5.4). `soil_channels_fabricated` is the permanent caveat on the model's
  // input (three soil channels are training means), not a per-run accident.
  'provenance.physics_top_hazard',
  'provenance.physics_agreement',
  'provenance.track_divergence',
  'provenance.soil_channels_fabricated',
];

/** Map of envelope driver field -> stored row field (+ any unit passthrough). */
const CHANNEL_FEATURE_SOURCES = {
  precip_mean: 'precipitation_mm',
  max_temp: 'temperature_max',
  min_temp: 'temperature_min',
};

/** Display bands for stored severity; not calibrated alert thresholds. */
export function severityBin(score) {
  if (score <= 0.33) return 'Low';
  if (score <= 0.66) return 'Moderate';
  return 'High';
}

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

function requireNumber(row, field) {
  const value = row[field];
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    throw new TypeError(
      `predictFromStore: stored row requires a finite score in [0,1] for "${field}" (got ${JSON.stringify(value)}). ` +
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
      // The physics score for the class the model chose (a cross-check of its
      // magnitude) — and, beside it, what the independent physics track would
      // have picked on its own. When those two disagree, the response says so
      // instead of presenting one number as consensus.
      physics_severity: isFiniteNumber(row.physics_severity) ? row.physics_severity : null,
      physics_top_hazard: VALID_HAZARDS.includes(row.physics_top_hazard) ? row.physics_top_hazard : null,
      physics_agreement: typeof row.physics_agreement === 'boolean' ? row.physics_agreement : null,
      track_divergence: isFiniteNumber(row.track_divergence) ? row.track_divergence : null,
      soil_channels_fabricated:
        typeof row.soil_channels_fabricated === 'boolean' ? row.soil_channels_fabricated : null,
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
