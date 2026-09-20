// Stored-forecast HTTP read benchmark; these timings are NOT model inference latency.
const N = parseInt(process.argv[2] || '20', 10);
const BASE = process.env.BENCH_URL || 'http://127.0.0.1:3000';

const latencies = [];
console.log(`Benchmarking POST ${BASE}/api/predict x${N} ...`);
for (let i = 0; i < N; i++) {
  const start = performance.now();
  const res = await fetch(`${BASE}/api/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ districtId: 'dhaka', horizon: '7_days' }),
  });
  const ms = performance.now() - start;
  if (!res.ok) {
    console.error(`Request ${i + 1} failed: HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  latencies.push(ms);
}
latencies.sort((a, b) => a - b);
const p = (q) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))].toFixed(1);
console.log(`p50: ${p(0.5)} ms | p95: ${p(0.95)} ms | min: ${latencies[0].toFixed(1)} ms | max: ${latencies[latencies.length - 1].toFixed(1)} ms`);
