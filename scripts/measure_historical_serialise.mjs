#!/usr/bin/env node
/**
 * Measure the CPU cost of the retired `/api/v1/historical` handler's work.
 *
 *   node scripts/measure_historical_serialise.mjs [--iterations 25]
 *
 * The handler did exactly two things per request: `JSON.parse` the 1.5 MB
 * `frontend/public/data/historical/hazard-catalog-index.json` from disk (or from its
 * module-level cache) and `JSON.stringify` it into a response. This script times both with
 * `performance.now()`, reports min/median/p95/max per phase and the total, and states the
 * machine it ran on. It is an **operator measurement**, not a synthetic estimate.
 *
 * Sandbox note: a Cloudflare Pages preview deployment cannot be created from this
 * environment, so the number below is a local Node/V8 measurement on the same class of
 * isolate CPU work. The owner-side preview reproduction command is in
 * docs/ops/pr/phase-4-disposition.md. The decision this informs is deletion, not porting —
 * once the route is gone the 10 ms CPU ceiling is irrelevant to it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = path.join(root, 'frontend', 'public', 'data', 'historical', 'hazard-catalog-index.json');
const raw = readFileSync(file, 'utf8');
const iterations = Number(process.argv[process.argv.indexOf('--iterations') + 1]) || 25;

const parseMs = [];
const stringifyMs = [];
const totalMs = [];
let rows = 0;
let bytes = 0;

for (let i = 0; i < iterations; i += 1) {
  const start = performance.now();
  const events = JSON.parse(raw);
  const afterParse = performance.now();
  const body = JSON.stringify({ success: true, total_events: events.length, events });
  const afterStringify = performance.now();
  rows = events.length;
  bytes = body.length;
  parseMs.push(afterParse - start);
  stringifyMs.push(afterStringify - afterParse);
  totalMs.push(afterStringify - start);
}

const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    min: sorted[0].toFixed(2),
    median: at(0.5).toFixed(2),
    p95: at(0.95).toFixed(2),
    max: sorted[sorted.length - 1].toFixed(2),
  };
};

console.log(JSON.stringify({
  file: path.relative(root, file),
  input_bytes: Buffer.byteLength(raw),
  rows,
  response_bytes: bytes,
  iterations,
  runtime: `node ${process.version} on ${process.platform}/${process.arch}`,
  parse_ms: stats(parseMs),
  stringify_ms: stats(stringifyMs),
  total_ms: stats(totalMs),
  free_tier_cpu_budget_ms: 10,
  note: 'Local V8 measurement, not a Pages preview isolate. See docs/ops/pr/phase-4-disposition.md for the preview reproduction command.',
}, null, 2));
