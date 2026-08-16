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

export default {
  register,
  inferenceLatency,
  predictionAccuracyPerClass,
  severityMae,
  modelLoadTime,
  apiRequestsTotal,
  cacheHitRate,
  setAccuracyPerClass,
  setSeverityMae,
  setCacheHitRate,
};
