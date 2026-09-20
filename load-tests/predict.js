/** k6 stored forecast read test. No tensor generation or inference/cache claims. */
import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = { vus: 1, duration: '30s' };
const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';
export default function () {
  const response = http.post(`${BASE_URL}/api/predict`, JSON.stringify({ districtId: 'dhaka', horizon: '7_days' }), { headers: { 'Content-Type': 'application/json' } });
  check(response, {
    'stored row returned': (r) => r.status === 200 && r.json('inference.served_from') === 'stored-forecast',
    'no request inference': (r) => r.status === 200 && r.json('inference.latency_ms') === null,
  });
  sleep(2);
}
