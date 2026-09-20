// Inference latency benchmark (ML-01 baseline). Fires N predictions at a
// running backend and reports p50/p95 latency. Run: node scripts/bench-predict.mjs [n]
// The "before" numbers here quantify the @tensorflow/tfjs (browser build)
// baseline; re-run after the tfjs-node swap (P2) to quantify the win.
const N = parseInt(process.argv[2] || '20', 10);
const BASE = process.env.BENCH_URL || 'http://127.0.0.1:3001';

// Minimal valid tensor payload [1,15,10,64,64] — deterministic, not random.
const size = 1 * 15 * 10 * 64 * 64;
const tensor = new Array(size).fill(0.1);

const latencies = [];
console.log(`Benchmarking POST ${BASE}/api/predict x${N} ...`);
for (let i = 0; i < N; i++) {
  const start = performance.now();
  const res = await fetch(`${BASE}/api/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tensor }),
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
