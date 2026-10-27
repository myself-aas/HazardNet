#!/usr/bin/env node
/**
 * Phase 5 — "the record landed" is a value assertion, not a file-exists assertion.
 *
 * The probe used to write `data/site-health/latest.json` and stop. `latest.json` could
 * contain `checks: [...]` with `weather_api: success` while the deployed URL 404'd, while
 * the run summary quoted a different outcome, and while the uploaded artifact was from a
 * previous step. This verifier compares the four surfaces on every run and names the field
 * that disagrees:
 *
 *   node scripts/verify_site_health_record.mjs \
 *     --record data/site-health/latest.json \
 *     --freshness frontend/public/data/freshness.json \
 *     --summary "$GITHUB_STEP_SUMMARY" \
 *     --require-pass
 *
 * `--require-pass` is used by the workflow on a healthy `workflow_dispatch` run. The
 * verifier is also run locally against the fixtures in `__tests__/fixtures/site-health/` by
 * `__tests__/siteHealthRecord.test.js`. No dependencies, no network.
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const has = (name) => args.includes(name);
const RECORD = flag('--record', 'data/site-health/latest.json');
const FRESHNESS = flag('--freshness', 'frontend/public/data/freshness.json');
const SUMMARY = flag('--summary', '');
const EXPECT = has('--require-pass') ? 'pass' : flag('--expect', 'any');
if (!['any', 'pass', 'fail'].includes(EXPECT)) {
  console.error(`::error::--expect must be any|pass|fail, got ${EXPECT}`);
  process.exit(2);
}

const problems = [];
const note = (field, message) => problems.push(`${field}: ${message}`);
const readJson = (path, field) => {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { note(field, `unreadable or not JSON (${path}: ${error.message})`); return null; }
};

const record = readJson(RECORD, 'record');
const freshness = FRESHNESS ? readJson(FRESHNESS, 'freshness') : null;
const summary = SUMMARY ? (() => {
  try { return readFileSync(SUMMARY, 'utf8'); }
  catch (error) { note('summary', `unreadable (${SUMMARY}: ${error.message})`); return null; }
})() : null;

const checks = Array.isArray(record?.checks) ? record.checks : [];
const byId = Object.fromEntries(checks.map((c) => [c?.id, c]));
const requiredChecks = ['homepage', 'weather_api', 'runtime_paths', 'status_page'];
for (const id of requiredChecks) {
  if (!byId[id]) note(`checks.${id}`, 'missing from the committed record');
}
if (record?.schema !== 'hazardnet-site-probe/v1') note('schema', `expected hazardnet-site-probe/v1, got ${record?.schema}`);
if (!record?.ran_at || Number.isNaN(Date.parse(record.ran_at))) note('ran_at', 'missing or not an ISO timestamp');
if (!['pass', 'fail'].includes(record?.outcome)) note('outcome', `expected pass|fail, got ${record?.outcome}`);
if (checks.length === 0) note('checks', 'empty — a probe with no checks cannot be green');
for (const check of checks) {
  if (!check?.id || !check?.outcome) note('checks[]', 'entry without id or outcome');
}
const derivedOutcome = checks.every((c) => c?.outcome === 'success') ? 'pass' : 'fail';
if (record?.outcome && derivedOutcome !== record.outcome) {
  note('outcome', `disagrees with checks[] (derived ${derivedOutcome})`);
}
const weather = byId.weather_api;
if (weather && weather.outcome !== 'success' && !weather.detail) {
  note('checks.weather_api.detail', 'a failing weather check must name the missing field (e.g. current.temperature_2m)');
}
const runtime = byId.runtime_paths;
if (runtime && runtime.outcome !== 'success' && !runtime.detail) {
  note('checks.runtime_paths.detail', 'a failing runtime-path check must name the scenario');
}

// The derived artifact must quote this run, not an older probe.
const siteProbe = freshness?.sources?.find?.((s) => s?.id === 'site_probe') ?? null;
if (!siteProbe) {
  note('freshness.sources[site_probe]', 'missing — the /status page cannot quote the probe');
} else {
  if (siteProbe.ran_at !== record?.ran_at || siteProbe.generated_at !== record?.ran_at) {
    note('freshness.sources[site_probe].ran_at', `expected ${record?.ran_at}, got ran_at=${siteProbe.ran_at} generated_at=${siteProbe.generated_at}`);
  }
  if (siteProbe.outcome !== record?.outcome) {
    note('freshness.sources[site_probe].outcome', `expected ${record?.outcome}, got ${siteProbe.outcome}`);
  }
  if (record?.outcome === 'fail' && siteProbe.state !== 'failing') {
    note('freshness.sources[site_probe].state', `expected failing, got ${siteProbe.state}`);
  }
  const detailChecks = Array.isArray(siteProbe.detail?.checks) ? siteProbe.detail.checks : [];
  for (const required of requiredChecks) {
    if (!detailChecks.some((c) => c?.id === required)) {
      note(`freshness.sources[site_probe].detail.checks.${required}`, 'missing — the /status page hides a check from the record');
    }
  }
  for (const check of checks) {
    const mirrored = detailChecks.find((c) => c?.id === check.id);
    if (!mirrored) continue;
    if (mirrored.outcome !== check.outcome) {
      note(`freshness.sources[site_probe].detail.checks.${check.id}.outcome`, `expected ${check.outcome}, got ${mirrored.outcome}`);
    }
    if (check.outcome !== 'success' && check.detail && mirrored.detail !== check.detail) {
      note(`freshness.sources[site_probe].detail.checks.${check.id}.detail`, `expected "${check.detail}", got ${mirrored.detail}`);
    }
  }
  const expectedFailed = checks.filter((c) => c.outcome !== 'success').length;
  if (siteProbe.detail?.failed !== expectedFailed) {
    note('freshness.sources[site_probe].detail.failed', `expected ${expectedFailed}, got ${siteProbe.detail?.failed}`);
  }
}

// The run summary is written from the same record by the publish step; verify parity.
if (summary !== null) {
  if (!summary.includes(`- probe outcome: ${record?.outcome}`)) {
    note('GITHUB_STEP_SUMMARY', `does not quote "- probe outcome: ${record?.outcome}"`);
  }
  for (const check of checks) {
    if (!summary.includes(`- ${check.id}: ${check.outcome}`)) {
      note('GITHUB_STEP_SUMMARY', `does not quote "- ${check.id}: ${check.outcome}"`);
    }
  }
  if (weather && !summary.includes(`- weather_api: ${weather.outcome}`)) {
    note('GITHUB_STEP_SUMMARY', 'does not quote the weather_api outcome');
  }
}

if (EXPECT === 'pass') {
  if (record?.outcome !== 'pass') note('outcome', `expected pass on a healthy dispatch, got ${record?.outcome}`);
  if (weather?.outcome !== 'success') note('checks.weather_api.outcome', `expected success, got ${weather?.outcome}`);
  if (runtime?.outcome !== 'success') note('checks.runtime_paths.outcome', `expected success, got ${runtime?.outcome}`);
}
if (EXPECT === 'fail') {
  if (record?.outcome !== 'fail') note('outcome', `expected fail on a broken dispatch, got ${record?.outcome}`);
  if (weather?.outcome !== 'failure') note('checks.weather_api.outcome', `expected failure, got ${weather?.outcome}`);
  if (!weather?.detail || !/current\.temperature_2m/.test(weather.detail)) {
    note('checks.weather_api.detail', 'a broken route must name the missing field current.temperature_2m');
  }
}

const report = {
  schema: 'hazardnet-site-health-verify/v1',
  record: RECORD,
  ran_at: record?.ran_at ?? null,
  outcome: record?.outcome ?? null,
  checks: checks.length,
  weather_api: weather ? { outcome: weather.outcome, detail: weather.detail ?? null } : null,
  runtime_paths: runtime ? { outcome: runtime.outcome, detail: runtime.detail ?? null } : null,
  surfaces: { freshness: !!freshness, summary: summary !== null, artifact: !!record },
  problems,
};
console.log(JSON.stringify(report, null, 2));
if (problems.length) {
  for (const problem of problems) console.error(`::error::site-health record: ${problem}`);
  process.exit(1);
}
console.log(`✅ site-health record ${record.outcome} — ${checks.length} checks, freshness artifact and run summary agree`);
