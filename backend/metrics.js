import client from 'prom-client';
const register = client.register;

// Histogram for inference latency in milliseconds
const inferenceLatency = new client.Histogram({
  name: 'inference_latency_ms',
  help: 'Inference latency in milliseconds',
  buckets: [10, 50, 100, 200, 500, 1000, 2000],
});

// Gauge for prediction accuracy per hazard class
const predictionAccuracyPerClass = new client.Gauge({
  name: 'prediction_accuracy_per_class',
  help: 'Accuracy per hazard class',
  labelNames: ['class'],
});

// Gauge for mean absolute error of severity predictions
const severityMae = new client.Gauge({
  name: 'severity_mae',
  help: 'Mean absolute error of severity predictions',
});

// Gauge for model load time in milliseconds
const modelLoadTime = new client.Gauge({
  name: 'model_load_time_ms',
  help: 'Model load time in milliseconds',
});

// Counter for total API requests
const apiRequestsTotal = new client.Counter({
  name: 'api_requests_total',
  help: 'Total number of API requests',
});

// Gauge for cache hit rate (0-1)
const cacheHitRate = new client.Gauge({
  name: 'cache_hit_rate',
  help: 'Cache hit rate (0-1)',
});

// Gauge for forecast data freshness — the deployment guide's SLO metric.
// Age (hours) of the newest prediction_date in the forecast store. The weekly
// pipeline refreshes it Sundays ~02:00 UTC, so a healthy series saws between
// ~2h and ~170h; a value beyond 192h (or an absent series) means a run was
// missed or the store is unreadable (see backend/utils/forecastFreshness.js
// and monitoring/alerts.yml).
const forecastAgeHours = new client.Gauge({
  name: 'hazardnet_forecast_age_hours',
  help: 'Age of forecast data in hours (newest prediction_date across horizons)',
});

/**
 * Convert a 'YYYY-MM-DD' prediction_date to an age in hours, measured from
 * that date's UTC midnight (prediction_date is date-granular, so the result
 * carries up to ±24h of granularity). Returns null for missing/invalid input.
 */
export function forecastAgeHoursFromPredictionDate(predictionDate) {
  if (typeof predictionDate !== 'string') return null;
  const parsed = Date.parse(`${predictionDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  return (Date.now() - parsed) / 3_600_000;
}

// Helper setters
function setAccuracyPerClass(cls, value) {
  predictionAccuracyPerClass.labels(cls).set(value);
}

function setSeverityMae(value) {
  severityMae.set(value);
}

function setCacheHitRate(value) {
  cacheHitRate.set(value);
}

function setForecastAgeHours(value) {
  if (!Number.isFinite(value)) return;
  // Re-attach in case a previous hide removed it (idempotent when present).
  register.registerMetric(forecastAgeHours);
  forecastAgeHours.set(value);
}

/**
 * Remove the forecast-age series from the exposition entirely. Used when
 * freshness is *unknown* (nothing ingested yet / store lookup failed) so the
 * gauge never shows a misleading value — absence is the alert signal
 * (absent(hazardnet_forecast_age_hours), see monitoring/alerts.yml).
 */
function hideForecastAgeHours() {
  register.removeSingleMetric('hazardnet_forecast_age_hours');
}

export default {
  register,
  inferenceLatency,
  predictionAccuracyPerClass,
  severityMae,
  modelLoadTime,
  apiRequestsTotal,
  cacheHitRate,
  forecastAgeHours,
  setForecastAgeHours,
  hideForecastAgeHours,
  setAccuracyPerClass,
  setSeverityMae,
  setCacheHitRate,
};
