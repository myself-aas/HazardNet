/**
 * @jest-environment node
 *
 * Phase 5 — prove the site-health record lands, and prove the monitors cover the paths
 * the shape defect actually hid in. Static workflow contract assertions plus executable
 * value assertions against scripts/verify_site_health_record.mjs and
 * scripts/probe_runtime_paths.mjs (the latter against a local node:http mock).
 */
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const root = path.resolve(__dirname, '..');
const fixtureDir = path.join(__dirname, 'fixtures', 'site-health');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'site-health.yml'), 'utf8');
const deployment = fs.readFileSync(path.join(root, 'docs', 'ops', 'deployment.md'), 'utf8');
const copyDist = fs.readFileSync(path.join(root, 'scripts', 'copy-dist.mjs'), 'utf8');
const verifier = path.join(root, 'scripts', 'verify_site_health_record.mjs');
const runtimeProbe = path.join(root, 'scripts', 'probe_runtime_paths.mjs');

const healthyRecord = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'healthy-record.json'), 'utf8'));
const healthyFreshness = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'healthy-freshness.json'), 'utf8'));
const healthySummary = fs.readFileSync(path.join(fixtureDir, 'healthy-summary.md'), 'utf8');

/** Mirrors the workflow's summary writer and the freshness artifact's site_probe source. */
function surfacesFrom(record) {
  const failed = record.checks.filter((c) => c.outcome !== 'success');
  const freshness = JSON.parse(JSON.stringify(healthyFreshness));
  const probe = freshness.sources.find((s) => s.id === 'site_probe');
  probe.ran_at = record.ran_at;
  probe.generated_at = record.ran_at;
  probe.outcome = record.outcome;
  probe.state = record.outcome === 'fail' ? 'failing' : 'fresh';
  probe.detail.failed = failed.length;
  probe.detail.passed = record.checks.length - failed.length;
  probe.detail.checks = record.checks.map((c) => ({ id: c.id, outcome: c.outcome, detail: c.detail }));
  const summary = [
    '### Site health probe — 2026-10-27T18:00:00Z',
    '',
    '- site: https://hazardnet.live',
    '',
    `- probe outcome: ${record.outcome}`,
    '- edge challenged: false',
    ...record.checks.map((c) => `  - ${c.id}: ${c.outcome}${c.detail ? ` — ${c.detail}` : ''}`),
    '',
  ].join('\n');
  return { freshness, summary };
}

let tempDir;
beforeAll(() => { tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-health-')); });
afterAll(() => { fs.rmSync(tempDir, { recursive: true, force: true }); });

async function verify(record, { expect: expected = 'any', freshness, summary, omitSummary = false } = {}) {
  const derived = surfacesFrom(record);
  const dir = fs.mkdtempSync(path.join(tempDir, 'case-'));
  const recordPath = path.join(dir, 'record.json');
  const freshPath = path.join(dir, 'freshness.json');
  const summaryPath = path.join(dir, 'summary.md');
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2));
  fs.writeFileSync(freshPath, JSON.stringify(freshness ?? derived.freshness, null, 2));
  fs.writeFileSync(summaryPath, summary ?? derived.summary);
  const args = [verifier, '--record', recordPath, '--freshness', freshPath, '--expect', expected];
  if (!omitSummary) args.push('--summary', summaryPath);
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, args, { cwd: root });
    return { code: 0, stdout, stderr, report: JSON.parse(stdout.slice(0, stdout.lastIndexOf('}') + 1)) };
  } catch (error) {
    const stdout = error.stdout || '';
    let report = null;
    try { report = JSON.parse(stdout.slice(0, stdout.lastIndexOf('}') + 1)); } catch { /* not JSON */ }
    return { code: error.code, stdout, stderr: error.stderr || '', report };
  }
}

describe('site-health workflow contract', () => {
  test('contents: write is job-scoped, not workflow-scoped', () => {
    const firstPermissions = workflow.indexOf('\npermissions:');
    expect(firstPermissions).toBe(-1); // no top-level block
    expect(workflow).toMatch(/jobs:\s*\n\s*probe:[\s\S]*?permissions:\s*\n(?:[ \t]*#.*\n)*[ \t]*contents: write/);
  });

  test('the aggregate check runs BEFORE the commit, and the commit is never gated on its exit', () => {
    const aggregate = workflow.indexOf('id: aggregate');
    const publish = workflow.indexOf('- name: Publish the probe result to the branch');
    expect(aggregate).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(aggregate);
    const publishStep = workflow.slice(publish, workflow.indexOf('- name: Upload the probe result', publish));
    // A verify step sits between them; find the commit step specifically.
    expect(publishStep).toMatch(/if: always\(\)/);
    expect(publishStep).toContain('git commit -m');
    expect(workflow.slice(aggregate, aggregate + 600)).toContain('continue-on-error: true');
    expect(workflow).toMatch(/if: always\(\) && steps\.aggregate\.outcome == 'failure'/);
  });

  test('the commit carries [skip ci] and the watch-path exclusion is documented', () => {
    expect(workflow).toMatch(/git commit -m "[^"]*\[skip ci\]"/);
    expect(deployment).toMatch(/data\/site-health\/\*\*/);
    expect(deployment).toMatch(/watch path/i);
  });

  test('both verification scripts are invoked and the record names the new checks', () => {
    expect(workflow).toContain('node scripts/probe_runtime_paths.mjs');
    expect(workflow).toContain('node scripts/verify_site_health_record.mjs');
    expect(workflow).toContain('{ id: "runtime_paths", outcome: $runtime_paths');
    expect(workflow).toContain('OUT_WEATHER_API_DETAIL');
    expect(workflow).toContain('--expect "$EXPECTED"');
  });

  // Regression for run 40621036497 (2026-10-28): two config/CI divergences the local
  // fixtures cannot see, because locally one summary file is shared and the probe is
  // run by node directly, not by GitHub's `bash -e`.
  test('the verifier reads the persistent summary file, not the per-step $GITHUB_STEP_SUMMARY', () => {
    // $GITHUB_STEP_SUMMARY is a per-step file: a later step reading its own copy sees
    // an empty file, so "Verify the committed record" failed on every real run.
    expect(workflow).toContain('cat /tmp/site-health-summary.md >> "$GITHUB_STEP_SUMMARY"');
    expect(workflow).toContain('--summary /tmp/site-health-summary.md');
    expect(workflow).not.toContain('--summary "$GITHUB_STEP_SUMMARY"');
  });

  test('the runtime-paths step cannot die under bash -e before writing its detail output', () => {
    const start = workflow.indexOf('- name: Probe the runtime sibling paths');
    const step = workflow.slice(start, workflow.indexOf('- name: Probe the status page', start));
    // The pipeline must be tested in an `if` (exempt from `-e`); reading the status
    // from a following line after a bare failing pipeline is unreachable, which is
    // how red probes used to land with `detail: null`.
    expect(step).toMatch(/if node scripts\/probe_runtime_paths\.mjs/);
    expect(step).toContain('STATUS=$?');
    expect(step).not.toMatch(/STATUS=\$\{PIPESTATUS/);
    expect(step).toContain('echo "detail=runtime sibling paths failed');
  });

  test('workflow_dispatch offers healthy and broken expectations', () => {
    expect(workflow).toMatch(/workflow_dispatch:\s*\n\s*#[\s\S]*?inputs:\s*\n[\s\S]*?site_url:/);
    expect(workflow).toMatch(/options:\s*\n\s*- healthy\s*\n\s*- broken/);
    expect(workflow).toContain('broken)  EXPECTED=fail ;;');
  });

  test('the served URL is produced at build time, not by a probe-triggered deployment', () => {
    expect(copyDist).toContain("path.join('data', 'site-health', 'latest.json')");
    expect(copyDist).toContain('copyFileSync(probeSrc, target)');
  });
});

describe('verify_site_health_record.mjs — value assertions', () => {
  test('the checked-in healthy fixtures agree with each other and with the derived surfaces', async () => {
    const derived = surfacesFrom(healthyRecord);
    expect(derived.freshness.sources.find((s) => s.id === 'site_probe'))
      .toEqual(healthyFreshness.sources.find((s) => s.id === 'site_probe'));
    expect(derived.summary.trim()).toBe(healthySummary.trim());
    const direct = await verify(healthyRecord, { freshness: healthyFreshness, summary: healthySummary, expect: 'pass' });
    expect(direct.code).toBe(0);
    expect(direct.report.weather_api.outcome).toBe('success');
    expect(direct.report.runtime_paths.outcome).toBe('success');
    expect(direct.stdout).toContain('site-health record pass — 11 checks');
  });

  test('a broken route lands a failing weather_api check with the named missing field', async () => {
    const broken = JSON.parse(JSON.stringify(healthyRecord));
    broken.outcome = 'fail';
    broken.checks.find((c) => c.id === 'weather_api').outcome = 'failure';
    broken.checks.find((c) => c.id === 'weather_api').detail =
      'missing: current.temperature_2m — /api/v1/weather/batch answered 200 with ids and no readings';
    broken.checks.find((c) => c.id === 'runtime_paths').outcome = 'failure';
    broken.checks.find((c) => c.id === 'runtime_paths').detail = 'batch_post_two_points: expected count=2 with 2 numeric readings, got count=2 readings=0';
    const result = await verify(broken, { expect: 'fail' });
    expect(result.code).toBe(0);
    expect(result.report.outcome).toBe('fail');
    expect(result.report.weather_api.detail).toContain('current.temperature_2m');
  });

  test('a hollow weather failure with detail: null is rejected instead of widened away', async () => {
    const hollow = JSON.parse(JSON.stringify(healthyRecord));
    hollow.outcome = 'fail';
    hollow.checks.find((c) => c.id === 'weather_api').outcome = 'failure';
    hollow.checks.find((c) => c.id === 'weather_api').detail = null;
    const result = await verify(hollow, { expect: 'fail' });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('checks.weather_api.detail');
  });

  test('an outcome that disagrees with checks[] is rejected', async () => {
    const lying = JSON.parse(JSON.stringify(healthyRecord));
    lying.checks.find((c) => c.id === 'weather_api').outcome = 'failure';
    lying.checks.find((c) => c.id === 'weather_api').detail = 'missing: current.temperature_2m';
    const result = await verify(lying, { expect: 'pass' });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('disagrees with checks[]');
  });

  test('a stale freshness artifact is rejected with the differing field named', async () => {
    const stale = JSON.parse(JSON.stringify(healthyFreshness));
    stale.sources.find((s) => s.id === 'site_probe').ran_at = '2026-10-26T00:00:00Z';
    const result = await verify(healthyRecord, { expect: 'pass', freshness: stale });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('freshness.sources[site_probe].ran_at');
  });

  test('a run summary that quotes a different outcome is rejected', async () => {
    const result = await verify(healthyRecord, { expect: 'pass', summary: healthySummary.replace('probe outcome: pass', 'probe outcome: fail') });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('GITHUB_STEP_SUMMARY');
  });

  test('a healthy expectation rejects a failing record', async () => {
    const broken = JSON.parse(JSON.stringify(healthyRecord));
    broken.outcome = 'fail';
    broken.checks.find((c) => c.id === 'weather_api').outcome = 'failure';
    broken.checks.find((c) => c.id === 'weather_api').detail = 'missing: current.temperature_2m';
    const result = await verify(broken, { expect: 'pass' });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('expected pass on a healthy dispatch');
  });
});

describe('probe_runtime_paths.mjs — sibling scenarios against a local mock', () => {
  let server;
  let baseUrl;
  let hollowBatch = false;

  const point = (id, temp) => ({ id, current: { temperature_2m: temp } });
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const send = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(body === undefined ? '' : JSON.stringify(body));
      };
      if (url.pathname === '/api/v1/telemetry' && req.method === 'GET') {
        return send(405, { error: 'method not allowed' });
      }
      if (url.pathname === '/api/v1/telemetry' && req.method === 'POST') {
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        return req.on('end', () => {
          const body = JSON.parse(raw || '{}');
          const event = body?.events?.[0]?.event;
          if (!event || !/^[a-zA-Z0-9_.:-]+$/.test(event)) return send(400, { error: 'invalid event' });
          return send(204);
        });
      }
      if (url.pathname === '/api/v1/weather' && req.method === 'GET') {
        // Leaf values from the provenance-backed openMeteoSingleObject / weatherFullObject
        // fixtures (captured 2026-10-27): 31.1 °C current, 36.7 °C first daily max.
        return send(200, {
          current: { temperature_2m: 31.1 },
          daily: { temperature_2m_max: [36.7] },
          _meta: { current_vars: 11 },
        });
      }
      if (url.pathname === '/api/v1/weather/batch') {
        const points = hollowBatch
          ? [{ id: 'dhaka' }, { id: 'chattogram' }]
          : [point('dhaka', 31.1), point('chattogram', 27.8)];
        return send(200, { count: 2, points });
      }
      return send(404, { error: 'not found' });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

  async function probe() {
    try {
      const { stdout } = await execFileAsync(process.execPath, [runtimeProbe, '--base-url', baseUrl], { cwd: root, maxBuffer: 1024 * 1024 });
      return { code: 0, stdout, report: JSON.parse(stdout) };
    } catch (error) {
      return { code: error.code, stdout: error.stdout || '', stderr: error.stderr || '', report: JSON.parse(error.stdout) };
    }
  }

  test('all eight sibling scenarios pass against a complete mock, with the captured leaf', async () => {
    hollowBatch = false;
    const { code, report } = await probe();
    expect(code).toBe(0);
    expect(report.scenarios).toBe(8);
    expect(report.failed).toBe(0);
    const names = report.results.map((r) => r.name);
    expect(names).toEqual([
      'telemetry_post_204_bound_or_unbound', 'telemetry_post_invalid_400', 'telemetry_get_405',
      'weather_cache_miss', 'weather_cache_hit', 'weather_full_shape',
      'batch_get_two_points', 'batch_post_two_points',
    ]);
    const miss = report.results.find((r) => r.name === 'weather_cache_miss');
    const hit = report.results.find((r) => r.name === 'weather_cache_hit');
    expect(miss.leaf).toBe(31.1);
    expect(hit.leaf).toBe(31.1);
    expect(report.results.find((r) => r.name === 'weather_full_shape').leaf).toBe(36.7);
    expect(report.results.every((r) => r.pass)).toBe(true);
  });

  test('the documented --self-test / --self-test=broken commands behave as written', async () => {
    const healthy = await execFileAsync(process.execPath, [runtimeProbe, '--self-test'], { cwd: root });
    const healthyReport = JSON.parse(healthy.stdout);
    expect(healthyReport.scenarios).toBe(8);
    expect(healthyReport.failed).toBe(0);
    expect(healthy.stderr).toContain('healthy mock at');

    const broken = await execFileAsync(process.execPath, [runtimeProbe, '--self-test=broken'], { cwd: root })
      .catch((error) => error);
    expect(broken.code).toBe(1);
    expect(JSON.parse(broken.stdout).failed).toBe(5);
    expect(broken.stderr).toContain('missing: current.temperature_2m');
  });

  test('a hollow batch point fails with current.temperature_2m named on both GET and POST paths', async () => {
    hollowBatch = true;
    try {
      const { code, report, stderr } = await probe();
      expect(code).toBe(1);
      expect(report.failed).toBe(2);
      expect(report.results.filter((r) => !r.pass).map((r) => r.name))
        .toEqual(['batch_get_two_points', 'batch_post_two_points']);
      expect(stderr).toContain('current.temperature_2m');
    } finally {
      hollowBatch = false;
    }
  });
});
