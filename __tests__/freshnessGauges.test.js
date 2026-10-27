/**
 * @jest-environment node
 *
 * Phase 4 — the metrics route is gone; its one meaningful gauge is published as data.
 *
 * A Worker isolate has no Node process: heap, event loop, GC and request counters are not
 * series that exist there. `hazardnet_forecast_age_hours` was the only gauge computed from
 * real data (a Firestore/snapshot read), so it now lives in
 * `frontend/public/data/freshness.json` -> `gauges.series[]`, built by the same script that
 * already knew the number. This suite replaces `__tests__/metricsApi.test.js`: no route, no
 * scrape, no invented process series — and a leaf-value assertion on the published gauge.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const freshness = JSON.parse(read('frontend/public/data/freshness.json'));

describe('no metrics route', () => {
  test('the Node function, the Express route and the dev proxy are all retired', () => {
    expect(fs.existsSync(path.join(ROOT, 'serverless/metrics.js'))).toBe(false);
    expect(read('backend/server.js')).not.toContain("app.get('/metrics'");
    expect(read('api/[endpoint].js')).not.toContain('metrics:');
    expect(read('frontend/vite.config.ts')).not.toContain("'/metrics'");
    expect(read('frontend/public/_redirects')).toMatch(/permanent 404/i);
  });

  test('the monitoring files say where the gauges went instead of advertising a scrape', () => {
    expect(read('monitoring/prometheus.yml')).toContain('RETIRED 2026-10-27');
    expect(read('monitoring/prometheus.yml')).toContain('/data/freshness.json');
  });
});

describe('the freshness artifact carries the gauge', () => {
  test('hazardnet_forecast_age_hours equals the forecast_snapshot age leaf', () => {
    const series = freshness.gauges && freshness.gauges.series;
    expect(Array.isArray(series)).toBe(true);
    const gauge = series.find((entry) => entry.name === 'hazardnet_forecast_age_hours');
    expect(gauge).toBeDefined();
    const source = freshness.sources.find((entry) => entry.id === 'forecast_snapshot');
    expect(gauge.value).toBe(source.age_hours);          // leaf, not a presence check
    expect(gauge.unit).toBe('hours');
    expect(gauge.slo_hours).toBe(192);
    expect(gauge.source).toBe('forecast_snapshot.age_hours');
    expect(['number', 'object']).toContain(typeof gauge.value); // null when unknown
  });

  test('alert and probe ages are published too, with their SLOs', () => {
    const names = freshness.gauges.series.map((entry) => entry.name);
    expect(names).toContain('hazardnet_alert_snapshot_age_hours');
    expect(names).toContain('hazardnet_site_probe_age_hours');
    expect(freshness.gauges.series.find((e) => e.name === 'hazardnet_alert_snapshot_age_hours').slo_hours).toBe(48);
    expect(freshness.gauges.series.find((e) => e.name === 'hazardnet_site_probe_age_hours').slo_hours).toBe(2);
  });

  test('the builder emits null (absence is the alarm) when a source age is unknown', async () => {
    const { gaugeBlock } = await import('../scripts/build_freshness_artifact.mjs');
    const gauges = gaugeBlock([{ id: 'forecast_snapshot', age_hours: 12.5 }]);
    expect(gauges.series[0].value).toBe(12.5);
    expect(gauges.series[1].value).toBeNull();
    expect(gauges.series[2].value).toBeNull();
  });
});
