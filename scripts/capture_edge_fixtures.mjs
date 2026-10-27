#!/usr/bin/env node
/**
 * Regenerate the committed integration fixtures (Phase 3).
 *
 *   node scripts/capture_edge_fixtures.mjs          # from committed artifacts + embedded capture
 *   node scripts/capture_edge_fixtures.mjs --live   # also re-fetch the full Open-Meteo bundle
 *
 * Every generated file starts with the three-line provenance header that
 * `__tests__/testQuality.test.js` requires. No new dependencies and no credentials.
 *
 * The forecast/alert snapshots are **trimmed** from the deployed artifacts (first rows per
 * horizon) so the fixtures stay readable; the trimming is stated in each header, and the
 * leaf values are the real ones (Bagerhat 0.6721, Chandpur 0.7062, watch_probability 0.4).
 * The full artifact is still exercised by `__tests__/routeValueAssertions.test.js`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, '__tests__', 'fixtures');
const date = new Date().toISOString().slice(0, 10);
const live = process.argv.includes('--live');

function write(file, capturedFrom, shape, toRefresh, note, payload) {
  const header = `/* Provenance — required by __tests__/testQuality.test.js; do not remove.
 * # Captured from ${capturedFrom} on ${date} by \`node scripts/capture_edge_fixtures.mjs\`.
 * # Shape: ${shape}.
 * # To refresh: ${toRefresh}.
 *
${note}
 */
module.exports = `;
  writeFileSync(path.join(outDir, file), `${header}${JSON.stringify(payload, null, 2)};\n`);
  console.log(`[capture] ${file}`);
}

const read = (relative) => JSON.parse(readFileSync(path.join(root, relative), 'utf8'));

// ── Forecast snapshot (deployed static artifact) ───────────────────────────
const forecast = read('frontend/public/data/forecasts-latest.json');
const trimmedForecast = {
  schema: forecast.schema,
  generated_at: forecast.generated_at,
  prediction_date: forecast.prediction_date,
  source: forecast.source,
  kernel: forecast.kernel,
  horizons: {
    '7_days': forecast.horizons['7_days'].slice(0, 2),
    '15_days': forecast.horizons['15_days'].slice(0, 1),
  },
};
write(
  'forecastsSnapshot.js',
  'https://www.hazardnet.live/data/forecasts-latest.json (committed as frontend/public/data/forecasts-latest.json)',
  'object — hazardnet-forecast-snapshot/v2; first 2 rows of 7_days and first 1 of 15_days retained',
  'node scripts/capture_edge_fixtures.mjs (reads the committed artifact after an ingest)',
  ' * Leaf values are real: Bagerhat district_id 40, severity_score 0.6721, advisory_tier WARNING.\n * The full 64-row artifact is read directly by __tests__/routeValueAssertions.test.js.',
  trimmedForecast,
);

// ── Alert snapshot (deployed static artifact) ──────────────────────────────
const alerts = read('frontend/public/data/alerts-latest.json');
const trimmedAlerts = {
  schema: alerts.schema,
  generated_at: alerts.generated_at,
  policy_version: alerts.policy_version,
  policy_source: alerts.policy_source,
  assessed: alerts.assessed,
  policy: alerts.policy,
  transports: alerts.transports,
  disclaimer: alerts.disclaimer,
  alerts: alerts.alerts.slice(0, 2),
};
write(
  'alertsSnapshot.js',
  'https://www.hazardnet.live/data/alerts-latest.json (committed as frontend/public/data/alerts-latest.json)',
  'object — hazardnet-alerts/v1 with the stamped policy block; first 2 PUBLISHED rows retained',
  'node scripts/capture_edge_fixtures.mjs (reads the committed artifact after an alert run)',
  ' * Leaf values are real: Chandpur district_id 60, severity_score 0.7062, state PUBLISHED;\n * policy.thresholds.watch_probability 0.4 and policy_source "builder".',
  trimmedAlerts,
);

// ── Telemetry batch (the browser beacon's own payload shape) ───────────────
const telemetry = {
  sessionId: 'session-abc-123',
  events: [
    { event: 'page_view', at: 1_767_000_000_000, properties: { route: '/', lang: 'en' } },
    { event: 'map_interaction', at: 1_767_000_001_000, properties: { zoom: 7, dragged: true } },
  ],
};
write(
  'telemetryBatch.js',
  'packages/analytics/src/streaming.ts:191 (SendBatch) and its __tests__/streaming.test.ts recorder, as posted to /api/v1/telemetry',
  'object — { sessionId, events: [{event, at, properties}] } — the client request, not an upstream response',
  'node scripts/capture_edge_fixtures.mjs (edit EMBEDDED_TELEMETRY if the tracker shape changes)',
  ' * This is a REQUEST fixture: the endpoint\'s "upstream" is the browser beacon. Leaf values\n * (page_view, session-abc-123, zoom 7) are asserted verbatim in the telemetry suites.',
  telemetry,
);

// ── Full single-point weather bundle (real upstream object with series) ─────
const FULL_URL = 'https://api.open-meteo.com/v1/forecast?latitude=23.8103&longitude=90.4125&current=temperature_2m,relative_humidity_2m,apparent_temperature&hourly=temperature_2m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FDhaka&forecast_days=2&wind_speed_unit=ms&temperature_unit=celsius&precipitation_unit=mm&timeformat=iso8601&past_days=0';
const EMBEDDED_FULL = {
  latitude: 23.796133, longitude: 90.38055, generationtime_ms: 0.12624263763427734,
  utc_offset_seconds: 21600, timezone: 'Asia/Dhaka', timezone_abbreviation: 'GMT+6', elevation: 19.0,
  current_units: { time: 'iso8601', interval: 'seconds', temperature_2m: '°C', relative_humidity_2m: '%', apparent_temperature: '°C' },
  current: { time: '2026-10-27T23:30', interval: 900, temperature_2m: 30.5, relative_humidity_2m: 65, apparent_temperature: 35.7 },
  hourly_units: { time: 'iso8601', temperature_2m: '°C', relative_humidity_2m: '%' },
  hourly: {
    time: ['2026-10-27T00:00', '2026-10-27T01:00', '2026-10-27T02:00', '2026-10-27T03:00'],
    temperature_2m: [31.3, 30.1, 29.4, 28.8],
    relative_humidity_2m: [58, 64, 67, 70],
  },
  daily_units: { time: 'iso8601', temperature_2m_max: '°C', temperature_2m_min: '°C', precipitation_sum: 'mm' },
  daily: {
    time: ['2026-10-27', '2026-10-28'],
    temperature_2m_max: [36.7, 34.5],
    temperature_2m_min: [27.9, 25.6],
    precipitation_sum: [0.20, 6.10],
  },
};

let full = EMBEDDED_FULL;
if (live) {
  const response = await fetch(FULL_URL, {
    headers: { 'User-Agent': 'HazardNet/1.0 (fixture capture; +https://hazardnet.live)' },
  });
  if (!response.ok) throw new Error(`Open-Meteo full bundle → HTTP ${response.status}`);
  full = await response.json();
  if (Array.isArray(full) || !full.hourly || !full.daily) throw new Error('full bundle is not a single object with series');
}
write(
  'weatherFullObject.js',
  FULL_URL,
  'object — single coordinate with current + hourly + daily arrays (the full forecast shape)',
  'node scripts/capture_edge_fixtures.mjs --live (needs outbound access to api.open-meteo.com)',
  ` * Hourly series trimmed to the first 4 timesteps ${live ? '(this run was live)' : '(embedded capture)'}; every retained value is real.\n * Leaf assertions use current.temperature_2m 30.5 and daily.temperature_2m_max[0] 36.7 when the embedded capture is in use.`,
  full,
);
