#!/usr/bin/env node
/**
 * Refresh the two committed Open-Meteo fixtures used by the shape-contract tests.
 *
 *   node scripts/capture_open_meteo_fixtures.mjs
 *
 * The sandbox running CI has no outbound route to api.open-meteo.com, so this is an
 * operator command, not a CI step. It writes both files in one run so the object and
 * array fixtures always describe the same variable set and the same moment. Each file
 * keeps the three-line provenance header `__tests__/testQuality.test.js` requires.
 *
 * No dependencies, no credentials, free tier: two unauthenticated GETs against the
 * public Open-Meteo API. `PUSH_TO_API` stays false — this reads data, it never writes.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtureDir = path.join(root, 'backend', 'utils', '__tests__', 'fixtures');

const VARS = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day',
  'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m',
  'wind_gusts_10m', 'cloud_cover',
].join(',');

const COMMON = {
  current: VARS,
  timezone: 'Asia/Dhaka',
  forecast_days: '1',
  wind_speed_unit: 'ms',
  temperature_unit: 'celsius',
  precipitation_unit: 'mm',
  timeformat: 'iso8601',
  past_days: '0',
};

const urlFor = (latitude, longitude) => {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  for (const [key, value] of Object.entries({ latitude, longitude, ...COMMON })) {
    url.searchParams.set(key, value);
  }
  return url.toString();
};

const SINGLE_URL = urlFor('23.8103', '90.4125');
const MULTI_URL = urlFor('23.8103,22.3569', '90.4125,91.7832');

async function capture(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'HazardNet/1.0 (fixture capture; +https://hazardnet.live)' },
  });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response.json();
}

function header(url, shape, queryForm, note) {
  const date = new Date().toISOString().slice(0, 10);
  return `/* Provenance — required by __tests__/testQuality.test.js; do not remove.
 * # Captured from ${url} on ${date} by \`node scripts/capture_open_meteo_fixtures.mjs\`.
 * # Shape: ${shape} — ${queryForm}.
 * # To refresh: node scripts/capture_open_meteo_fixtures.mjs (writes this file and its pair with a fresh provenance stamp).
 *
${note}
 */
module.exports = `;
}

function write(file, url, shape, queryForm, note, payload) {
  const body = JSON.stringify(payload, null, 2).replace(/\n/g, '\n');
  writeFileSync(path.join(fixtureDir, file), `${header(url, shape, queryForm, note)}${body};\n`);
  const leaf = Array.isArray(payload)
    ? payload.map((p) => p.current?.temperature_2m).join(', ')
    : payload.current?.temperature_2m;
  console.log(`[capture] ${file}: shape=${shape} temperature_2m=${leaf}`);
}

const [single, multi] = await Promise.all([capture(SINGLE_URL), capture(MULTI_URL)]);

if (!single || typeof single !== 'object' || Array.isArray(single) || !single.current) {
  throw new Error('single-coordinate response is not a current-bearing object — shape changed');
}
if (!Array.isArray(multi) || multi.length < 2 || !multi[0].current || !multi[1].current) {
  throw new Error('multi-coordinate response is not an array of per-location objects — shape changed');
}

const noteFor = (which) => ` * The bytes below are the parsed upstream response, verbatim. Tests assert leaf values
 * (temperature, wind direction, humidity) from this capture, not just the key names.
 * ${which}`;

write(
  'openMeteoSingleObject.js', SINGLE_URL, 'object',
  'single coordinate (`latitude=23.8103&longitude=90.4125`), no comma in the latitude parameter',
  noteFor('There is NO array-per-variable form: that was a comment, never an Open-Meteo response.'),
  single,
);
write(
  'openMeteoMultiArray.js', MULTI_URL, 'array',
  'multi coordinate (`latitude=23.8103%2C22.3569&longitude=90.4125%2C91.7832`), one complete object per location',
  noteFor('Only the multi-location form carries `location_id` on elements after the first.'),
  multi,
);
