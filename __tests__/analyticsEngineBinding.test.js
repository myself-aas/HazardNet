/**
 * @jest-environment node
 *
 * Phase 6 (Action 12) — the Analytics Engine binding is a dashboard-side, Production-only
 * object this repository cannot create. These are the thin tests for **both** runtime paths:
 * bound (one data point whose leaves come from the committed request fixture), unbound
 * (fail-open 204 + the same leaves in the log line), a Preview host that must never reach
 * the production dataset, and a binding that throws. The last block pins the owner runbook,
 * because a wrong SQL column or a stale "the Node handler is deleted" claim is how an owner
 * spends an afternoon on a query that cannot work.
 */

const fs = require('node:fs');
const path = require('node:path');
const BATCH = require('./fixtures/telemetryBatch.js');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const PRODUCTION_URL = 'https://www.hazardnet.live/api/v1/telemetry';
const PREVIEW_URL = 'https://arena-abcdef-hazardnet.pages.dev/api/v1/telemetry';

const post = (body, url = PRODUCTION_URL) => new Request(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

let writeDataPoint;
let logSpy;
let warnSpy;

beforeEach(() => {
  writeDataPoint = jest.fn();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const load = () => require('../functions/api/v1/telemetry.ts').onRequest;

describe('Action 12 — bound and unbound telemetry sinks', () => {
  test('bound on a production host: 204 and one data point carrying the fixture leaves', async () => {
    const onRequest = load();
    const response = await onRequest({ request: post(BATCH), env: { ANALYTICS: { writeDataPoint } } });

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(writeDataPoint).toHaveBeenCalledTimes(BATCH.events.length);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    const point = writeDataPoint.mock.calls[0][0];
    expect(point.blobs[0]).toBe('page_view');
    expect(point.blobs[1]).toBe('session-abc-123');
    expect(JSON.parse(point.blobs[2])).toEqual({ route: '/', lang: 'en' });
    expect(point.doubles).toEqual([1767000000000]);
    expect(point.indexes).toEqual(['session-abc-123']);
    // Cloudflare's limits: 16 KB of blobs per data point, a 96-byte index.
    expect(point.blobs.reduce((n, b) => n + b.length, 0)).toBeLessThan(16 * 1024);
    expect(point.indexes[0].length).toBeLessThanOrEqual(96);
  });

  test('unbound on a production host: 204, no writes, the same leaves in the fail-open log', async () => {
    const onRequest = load();
    const response = await onRequest({ request: post(BATCH), env: {} });

    expect(response.status).toBe(204);
    expect(writeDataPoint).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(BATCH.events.length);
    expect(JSON.parse(logSpy.mock.calls[0][0])).toEqual({
      tag: 'analytics',
      sessionId: 'session-abc-123',
      event: 'page_view',
      properties: { route: '/', lang: 'en' },
      at: 1767000000000,
    });
  });

  test('a context with no env object at all still answers 204 (fail-open)', async () => {
    const onRequest = load();
    const response = await onRequest({ request: post(BATCH) });
    expect(response.status).toBe(204);
    expect(logSpy).toHaveBeenCalledTimes(BATCH.events.length);
  });

  test('the apex production host is allowed too', async () => {
    const onRequest = load();
    const response = await onRequest({
      request: post(BATCH, 'https://hazardnet.live/api/v1/telemetry'),
      env: { ANALYTICS: { writeDataPoint } },
    });
    expect(response.status).toBe(204);
    expect(writeDataPoint).toHaveBeenCalledTimes(BATCH.events.length);
  });

  test('a Preview host with a bound ANALYTICS never reaches the production dataset', async () => {
    const onRequest = load();
    const response = await onRequest({
      request: post(BATCH, PREVIEW_URL),
      env: { ANALYTICS: { writeDataPoint } },
    });

    expect(response.status).toBe(204);
    expect(writeDataPoint).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('non-production host'),
      'arena-abcdef-hazardnet.pages.dev',
    );
    expect(logSpy).toHaveBeenCalledTimes(BATCH.events.length);
  });

  test('a binding that throws is caught: the event is logged and the beacon still gets 204', async () => {
    const onRequest = load();
    const broken = { writeDataPoint: jest.fn(() => { throw new Error('dataset missing'); }) };
    const response = await onRequest({ request: post(BATCH), env: { ANALYTICS: broken } });

    expect(response.status).toBe(204);
    expect(broken.writeDataPoint).toHaveBeenCalledTimes(BATCH.events.length);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('ANALYTICS.writeDataPoint failed'),
      'dataset missing',
    );
    expect(logSpy).toHaveBeenCalledTimes(BATCH.events.length);
  });

  test('properties that would exceed the 16 KB blob budget are refused with a named error', async () => {
    const onRequest = load();
    // Long *keys* are the way past the per-value cap: 20 values of 256 chars is still only
    // ~5 KB, but one 9 KB key would blow the 16 KB blob budget without a JSON-size check.
    const huge = {
      ...BATCH,
      events: [{ event: 'page_view', at: 1767000000000, properties: { ['k'.repeat(9000)]: 'v' } }],
    };
    const response = await onRequest({ request: post(huge), env: { ANALYTICS: { writeDataPoint } } });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('event.properties is too large');
    expect(writeDataPoint).not.toHaveBeenCalled();
  });
});

describe('Action 12 — owner runbook and code contract', () => {
  test('the Function keeps the production allowlist, the optional env and the catch', () => {
    const source = read('functions/api/v1/telemetry.ts');
    expect(source).toContain("new Set(['www.hazardnet.live', 'hazardnet.live'])");
    expect(source).toContain('function isProductionRequest');
    expect(source).toContain('env?: { ANALYTICS?: AnalyticsEngineDataset }');
    expect(source).toContain('context.env ?? {}');
    expect(source).toMatch(/try \{[\s\S]*?writeDataPoint\([\s\S]*?\} catch \(error\)/);
    expect(source).toContain('logEvent(event, sessionId)');
  });

  test('Action 12 documents the real dashboard path, the redeploy, and a query that can work', () => {
    const actions = read('docs/ops/owner-actions.md');
    const section = actions.slice(actions.indexOf('## Action 12'), actions.indexOf('## Action 13'));
    expect(section).toContain('Settings → Bindings → Add → Analytics engine');
    expect(section).toContain('Production');
    expect(section).toContain('Preview');
    expect(section).toContain('Redeploy');
    expect(section).toContain('analytics_engine/sql');
    expect(section).toContain('SHOW TABLES');
    expect(section).toContain('index1');
    expect(section).toContain('hazardnet_telemetry');
    expect(section).toContain('100,000');
    expect(section).toContain('10,000');
    expect(section).toContain('96');
    expect(section).toContain('three months');
    expect(section).toContain('cannot be used locally');
  });

  test('the codebase docs no longer claim the Node telemetry handler is deleted', () => {
    for (const file of ['docs/codebase/ARCHITECTURE.md', 'docs/codebase/INTEGRATIONS.md']) {
      const text = read(file);
      expect(text).not.toMatch(/is deleted at HEAD/);
      expect(text).toContain('functions/api/v1/telemetry.ts');
    }
    expect(fs.existsSync(path.join(root, 'serverless', 'v1', 'telemetry.js'))).toBe(true);
  });

  test('the deployment runbook names the Production-only binding and the SQL verification', () => {
    const deployment = read('docs/ops/deployment.md');
    expect(deployment).toContain('Production-only');
    expect(deployment).toContain('ANALYTICS');
    expect(deployment).toContain('hazardnet_telemetry');
  });

  test('scripts/verify_analytics_engine.mjs derives the owner SQL from the writer shape', async () => {
    const { execFile } = require('node:child_process');
    const { promisify } = require('node:util');
    const { stdout } = await promisify(execFile)(process.execPath,
      [path.join(root, 'scripts/verify_analytics_engine.mjs')], { cwd: root });
    const report = JSON.parse(stdout.slice(0, stdout.lastIndexOf('}') + 1));
    expect(report.problems).toEqual([]);
    expect(report.data_points).toBe(2);
    expect(report.query).toContain("index1 = 'session-abc-123'");
    expect(report.first_data_point.indexes).toEqual(['session-abc-123']);
    expect(report.first_data_point.blobs[0]).toBe('page_view');
    expect(report.first_data_point.doubles).toEqual([1767000000000]);
  });
});
