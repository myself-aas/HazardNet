#!/usr/bin/env node
/**
 * Phase 6 (Action 12) — prove the SQL query the owner is told to run matches the data point
 * the Function actually writes.
 *
 *   node scripts/verify_analytics_engine.mjs
 *
 * Cloudflare's SQL API cannot be reached from this sandbox (no binding, no token, no live
 * `writeDataPoint`), and its docs state an Analytics Engine binding cannot be used locally.
 * What CAN be checked here is the contract between the writer and the owner's query: the
 * column names in the runbook (`index1`, `blob1`, `blob2`, `double1`) must describe the
 * values in `writeDataPoint({ blobs, doubles, indexes })`. A query against `blob2` works but
 * scans blobs; `index1` is the indexed path. No dependencies, no network.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTelemetryBatch, PROPERTIES_JSON_MAX } from '../backend/utils/telemetryBatch.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');
// The fixture is CommonJS because Jest loads it through babel; the root package is ESM, so
// `require()` of a .js file would throw here. Its body is plain JSON, which is also a useful
// invariant: a provenance fixture must not contain executable code.
const fixtureText = read('__tests__/fixtures/telemetryBatch.js');
const marker = 'module.exports = ';
const fixtureStart = fixtureText.indexOf(marker);
let batch = null;
if (fixtureStart < 0) {
  batch = null;
} else {
  try {
    batch = JSON.parse(fixtureText.slice(fixtureStart + marker.length).trim().replace(/;\s*$/, ''));
  } catch (error) {
    console.error(`::error::telemetry fixture is not plain JSON: ${error.message}`);
    process.exit(2);
  }
}

const problems = [];
const source = read('functions/api/v1/telemetry.ts');
const actions = read('docs/ops/owner-actions.md');
const action12 = actions.slice(actions.indexOf('## Action 12'), actions.indexOf('## Action 13'));

const requiredSource = [
  'blobs: [event.event, sessionId, JSON.stringify(event.properties)]',
  'doubles: [event.at]',
  'indexes: [sessionId]',
  "new Set(['www.hazardnet.live', 'hazardnet.live'])",
  '} catch (error) {',
];
for (const snippet of requiredSource) {
  if (!source.includes(snippet)) problems.push(`functions/api/v1/telemetry.ts is missing: ${snippet}`);
}
for (const column of ['index1', 'blob1', 'blob2', 'double1']) {
  if (!action12.includes(column)) problems.push(`Action 12 does not document the SQL column ${column}`);
}
if (!action12.includes('analytics_engine/sql')) problems.push('Action 12 is missing the SQL API endpoint');
if (!action12.includes('SHOW TABLES')) problems.push('Action 12 is missing SHOW TABLES (a table only exists after the first write)');

const result = validateTelemetryBatch(batch);
if (!result.ok) problems.push(`the committed telemetry fixture no longer validates: ${result.error}`);

const events = result.ok ? result.batch.events : [];
const dataPoints = events.map((event) => ({
  blobs: [event.event, result.batch.sessionId, JSON.stringify(event.properties)],
  doubles: [event.at],
  indexes: [result.batch.sessionId],
}));
for (const point of dataPoints) {
  const blobBytes = point.blobs.reduce((n, b) => n + b.length, 0);
  if (blobBytes > 16 * 1024) problems.push(`a data point would use ${blobBytes} bytes of blobs (limit 16384)`);
  if (point.indexes[0].length > 96) problems.push('index exceeds 96 bytes');
}
const session = result.ok ? result.batch.sessionId : '';
const sql = `SELECT blob1, blob2, double1 FROM hazardnet_telemetry WHERE index1 = '${session}'`;

const report = {
  schema: 'hazardnet-analytics-engine-verify/v1',
  fixture: '__tests__/fixtures/telemetryBatch.js',
  session,
  data_points: dataPoints.length,
  first_data_point: dataPoints[0] ?? null,
  query: sql,
  why_index1: 'indexes:[sessionId] is Analytics Engine\'s single indexed column; blob2 mirrors the session but is not indexed.',
  limits: {
    properties_json_max: PROPERTIES_JSON_MAX,
    blobs_per_point: '16 KB total',
    index_bytes: 96,
    writes_per_invocation: 250,
    batch_cap: 50,
    free_tier: '100,000 data points/day, 10,000 read queries/day, three months retention',
  },
  owner_steps: [
    'POST https://api.cloudflare.com/client/v4/accounts/{account_id}/analytics_engine/sql --data "SHOW TABLES"',
    `POST .../analytics_engine/sql --data "${sql}"`,
  ],
  problems,
};
console.log(JSON.stringify(report, null, 2));
if (problems.length) {
  for (const problem of problems) console.error(`::error::analytics engine contract: ${problem}`);
  process.exit(1);
}
console.log(`✅ ${dataPoints.length} data point(s) fit the free-tier limits; Action 12's SQL query matches the writer`);
