/**
 * k6 Load Test - ML Prediction Endpoint
 * Tests POST /api/predict with realistic tensor payloads
 * 
 * Run with: k6 run load-tests/predict.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const predictionLatency = new Trend('prediction_latency');
const cacheHitRate = new Rate('cache_hits');
const rateLimitHits = new Counter('rate_limit_hits');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 5 },   // Warm-up
    { duration: '1m', target: 10 },   // Sustained load
    { duration: '30s', target: 15 },  // Spike
    { duration: '30s', target: 0 },   // Cool-down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<1000', 'p(99)<2000'], // 95% < 1s, 99% < 2s
    'errors': ['rate<0.05'],  // Error rate < 5%
    'cache_hits': ['rate>0.6'], // Cache hit rate > 60%
    'http_req_failed': ['rate<0.1'], // Failed requests < 10%
  },
  ext: {
    loadimpact: {
      projectID: 3596481,
      name: 'HazardNet ML Prediction Load Test',
    },
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

// Generate realistic tensor data
function generateTensor() {
  const shape = [1, 15, 10, 64, 64];
  const size = shape.reduce((a, b) => a * b, 1);
  
  // Generate semi-random data with some patterns
  const data = new Array(size);
  for (let i = 0; i < size; i++) {
    // Simulate realistic satellite/climate data
    const channel = Math.floor(i / (10 * 64 * 64)) % 15;
    const noise = Math.random() * 0.2 - 0.1; // -0.1 to 0.1
    
    if (channel < 2) {
      // SAR channels: typically -20 to 0 dB
      data[i] = -10 + Math.random() * 10 + noise;
    } else if (channel < 6) {
      // Optical channels: 0 to 1 reflectance
      data[i] = Math.random() * 0.8 + noise;
    } else {
      // Climate channels: normalized values
      data[i] = 0.5 + Math.random() * 0.3 + noise;
    }
  }
  
  return { data, shape };
}

// Test scenarios
export default function () {
  const scenario = Math.random();
  
  if (scenario < 0.7) {
    // 70% - Unique predictions
    testUniquePrediction();
  } else if (scenario < 0.9) {
    // 20% - Repeated predictions (test cache)
    testCachedPrediction();
  } else {
    // 10% - Invalid requests
    testInvalidRequest();
  }
  
  // Rate limit: 10 req/15min per IP, so add delay
  sleep(3);
}

function testUniquePrediction() {
  const tensor = generateTensor();
  
  const response = http.post(
    `${BASE_URL}/api/predict`,
    JSON.stringify(tensor),
    {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { scenario: 'unique_prediction' },
    }
  );
  
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'has prediction array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.prediction);
      } catch (e) {
        return false;
      }
    },
    'prediction has scores': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.prediction.every(p => 
          typeof p.score === 'number' && p.score >= 0 && p.score <= 1
        );
      } catch (e) {
        return false;
      }
    },
    'has inference metadata': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.inference && typeof body.inference.latency_ms === 'number';
      } catch (e) {
        return false;
      }
    },
  });
  
  if (response.status === 200) {
    try {
      const body = JSON.parse(response.body);
      predictionLatency.add(body.inference.latency_ms);
      cacheHitRate.add(body.inference.cached ? 1 : 0);
    } catch (e) {
      // Ignore parse errors
    }
  } else if (response.status === 429) {
    rateLimitHits.add(1);
  }
  
  errorRate.add(!success);
}

function testCachedPrediction() {
  // Use fixed tensor to test caching
  const tensor = {
    data: new Array(15 * 10 * 64 * 64).fill(0.5),
    shape: [1, 15, 10, 64, 64],
  };
  
  const response = http.post(
    `${BASE_URL}/api/predict`,
    JSON.stringify(tensor),
    {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { scenario: 'cached_prediction' },
    }
  );
  
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'response is cached': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.inference.cached === true;
      } catch (e) {
        return false;
      }
    },
  });
  
  if (response.status === 200) {
    try {
      const body = JSON.parse(response.body);
      predictionLatency.add(body.inference.latency_ms);
      cacheHitRate.add(body.inference.cached ? 1 : 0);
    } catch (e) {
      // Ignore
    }
  }
  
  errorRate.add(!success);
}

function testInvalidRequest() {
  const invalidPayloads = [
    { data: [], shape: [1, 10, 10] },  // Wrong shape
    { shape: [1, 15, 10, 64, 64] },    // Missing data
    { data: [NaN, NaN], shape: [1, 2] }, // NaN values
    {},  // Empty payload
  ];
  
  const payload = invalidPayloads[Math.floor(Math.random() * invalidPayloads.length)];
  
  const response = http.post(
    `${BASE_URL}/api/predict`,
    JSON.stringify(payload),
    {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { scenario: 'invalid_request' },
    }
  );
  
  check(response, {
    'returns 400 for invalid input': (r) => r.status === 400,
    'has error message': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.error === 'string';
      } catch (e) {
        return false;
      }
    },
  });
}

// Setup function (runs once per VU)
export function setup() {
  console.log('Starting HazardNet ML Prediction Load Test');
  console.log(`Target: ${BASE_URL}`);
  
  // Verify API is reachable
  const healthCheck = http.get(`${BASE_URL}/health`);
  if (healthCheck.status !== 200) {
    throw new Error(`API health check failed: ${healthCheck.status}`);
  }
  
  return { startTime: Date.now() };
}

// Teardown function (runs once after all VUs complete)
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Load test completed in ${duration.toFixed(2)}s`);
}
