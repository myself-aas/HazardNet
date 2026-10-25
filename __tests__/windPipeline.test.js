/**
 * windPipeline.test.js
 *
 * Pure-helper contracts for scripts/fetch_live_wind.mjs after the 2026-10-26
 * rewire: the field comes from Open-Meteo (one request, the artifact's own 1°
 * lattice), so what this suite pins is *that* contract — the lattice geometry, the
 * hour pick, the speed/direction → u/v decomposition, the request shape, the
 * assembly strictness, and the artifact envelope the client parses. The network
 * half is exercised by the Live Wind Update workflow itself with a stubbed fetch
 * right here for the plumbing. Runs via both `node --test` and Jest.
 */

import assert from 'node:assert';
import * as nodeTest from 'node:test';

const describe = globalThis.describe ?? nodeTest.describe;
const test = globalThis.test ?? nodeTest.test;

import {
  WIND_BBOX,
  WIND_SCHEMA,
  buildArtifact,
  componentsFromWind,
  fetchWindArtifact,
  fieldsFromOpenMeteo,
  gridNodes,
  openMeteoWindUrl,
  pickValidHourIndex,
} from '../scripts/fetch_live_wind.mjs';

describe('the artifact lattice', () => {
  test('covers the hazard window on a 1° grid, row-major, latitude ascending', () => {
    const nodes = gridNodes();
    const cols = Math.round((WIND_BBOX.lonMax - WIND_BBOX.lonMin) / WIND_BBOX.step) + 1;
    const rows = Math.round((WIND_BBOX.latMax - WIND_BBOX.latMin) / WIND_BBOX.step) + 1;
    assert.strictEqual(nodes.length, cols * rows);
    assert.deepStrictEqual(nodes[0], { lon: WIND_BBOX.lonMin, lat: WIND_BBOX.latMin });
    assert.deepStrictEqual(nodes[nodes.length - 1], { lon: WIND_BBOX.lonMax, lat: WIND_BBOX.latMax });
    // Second node is one step east, not north — the client samples row-major.
    assert.deepStrictEqual(nodes[1], { lon: WIND_BBOX.lonMin + WIND_BBOX.step, lat: WIND_BBOX.latMin });
    // Bounds stay the Bangladesh window the retired GFS path sampled.
    assert.strictEqual(cols, 12);
    assert.strictEqual(rows, 13);
  });
});

describe('the forecast hour pick', () => {
  const TIMES = ['2026-10-26T00:00', '2026-10-26T01:00', '2026-10-26T02:00'];

  test('takes the first hour at or after now — never an hour already decaying', () => {
    const now = new Date('2026-10-26T00:15:00Z');
    assert.strictEqual(pickValidHourIndex(TIMES, now), 1);
    assert.strictEqual(pickValidHourIndex(TIMES, new Date('2026-10-26T01:00:00Z')), 1);
  });

  test('falls back to the last available hour when the window is in the past', () => {
    // Clock skew vs a just-rotated forecast: better one stale hour than no artifact.
    assert.strictEqual(pickValidHourIndex(TIMES, new Date('2026-10-26T05:00:00Z')), TIMES.length - 1);
  });

  test('returns -1 for an empty schedule', () => {
    assert.strictEqual(pickValidHourIndex([], new Date()), -1);
    assert.strictEqual(pickValidHourIndex(null, new Date()), -1);
  });
});

describe('speed/direction decomposition', () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

  test('meteorological FROM-convention becomes the u/v TO-vector', () => {
    // Northerly (from the north, dir 0): goes south → v negative, u 0.
    const n = componentsFromWind(10, 0);
    close(n.u, 0);
    close(n.v, -10);
    // Easterly (dir 90): goes west → u negative.
    const e = componentsFromWind(10, 90);
    close(e.u, -10);
    close(e.v, 0);
    // South-westerly (dir 225): goes north-east → both positive, magnitude preserved.
    const sw = componentsFromWind(10, 225);
    close(sw.u, 5 * Math.SQRT2);
    close(sw.v, 5 * Math.SQRT2);
    close(Math.hypot(sw.u, sw.v), 10);
  });
});

describe('the Open-Meteo request', () => {
  test('asks for the 10 m wind in m/s for the whole lattice in one URL', () => {
    const url = openMeteoWindUrl(gridNodes());
    assert.ok(url.startsWith('https://api.open-meteo.com/v1/forecast?'));
    assert.ok(url.includes('hourly=wind_speed_10m%2Cwind_direction_10m'));
    assert.ok(url.includes('wind_speed_unit=ms'));
    assert.ok(url.includes('forecast_hours=6'));
    // Every lattice node goes into the coordinate lists, in order.
    assert.ok(url.includes('latitude=20.50'));
    assert.ok(url.includes('32.50'));
    assert.ok(url.includes('longitude=88.00'));
    assert.ok(url.includes('99.00'));
  });
});

describe('response assembly', () => {
  const hourly = (speed, direction) => ({
    hourly: {
      time: ['2026-10-26T00:00', '2026-10-26T06:00'],
      wind_speed_10m: [speed, speed],
      wind_direction_10m: [direction, direction],
    },
  });
  const now = new Date('2026-10-26T00:30:00Z');
  const twoNodes = [
    { lon: 88, lat: 20.5 },
    { lon: 99, lat: 32.5 },
  ];

  test('decomposes every node at its picked hour, grid-aligned', () => {
    const field = fieldsFromOpenMeteo([hourly(5, 0), hourly(10, 90)], twoNodes, now);
    assert.strictEqual(field.validIso, '2026-10-26T06:00:00.000Z');
    assert.deepStrictEqual(field.u.map((x) => Math.abs(x) < 1e-9 ? 0 : x), [0, -10]);
    assert.deepStrictEqual(field.v.map((x) => Math.abs(x) < 1e-9 ? 0 : x), [-5, 0]);
  });

  test('refuses a response whose blocks do not match the lattice', () => {
    assert.throws(() => fieldsFromOpenMeteo([hourly(5, 0)], twoNodes, now), /1 location blocks for 2 nodes/);
    assert.throws(() => fieldsFromOpenMeteo([{ hourly: { time: [] } }, hourly(5, 0)], twoNodes, now), /no forecast hours/);
    assert.throws(
      () => fieldsFromOpenMeteo([{
        hourly: { time: ['2026-10-26T06:00'], wind_speed_10m: [5], wind_direction_10m: [null] },
      }, hourly(5, 0)], twoNodes, new Date('2026-10-26T00:30:00Z')),
      /no wind at/,
    );
  });
});

describe('artifact assembly', () => {
  test('matches the client contract exactly', () => {
    const artifact = buildArtifact(
      {
        model: 'open-meteo',
        modelName: 'Open-Meteo 10 m wind (blended NWP forecast)',
        issueIso: '2026-10-26T06:00:00.000Z',
        validIso: '2026-10-26T12:00:00.000Z',
        stepHours: 6,
        kind: 'forecast',
        u: new Array(156).fill(1.234),
        v: new Array(156).fill(-5.678),
      },
      new Date('2026-10-26T12:10:00.000Z'),
    );
    assert.strictEqual(artifact.schema, WIND_SCHEMA);
    assert.strictEqual(artifact.model, 'open-meteo');
    assert.strictEqual(artifact.u.length, 156);
    assert.strictEqual(artifact.u[0], 1.2);
    assert.strictEqual(artifact.v[0], -5.7);
    assert.strictEqual(artifact.grid.step, 1);
    assert.strictEqual(artifact.generated_at, '2026-10-26T12:10:00.000Z');
  });

  test('fetch → field → artifact end to end with a stubbed transport', async () => {
    const nodes = gridNodes();
    const one = {
      hourly: {
        time: ['2026-10-26T11:00', '2026-10-26T12:00'],
        wind_speed_10m: [4, 6],
        wind_direction_10m: [0, 0],
      },
    };
    const stub = async (url) => {
      assert.ok(url.includes('hourly=wind_speed_10m%2Cwind_direction_10m'));
      return { ok: true, json: async () => nodes.map(() => one) };
    };
    const now = new Date('2026-10-26T11:30:00.000Z');
    const artifact = await fetchWindArtifact({ fetchImpl: stub, now });
    assert.strictEqual(artifact.schema, WIND_SCHEMA);
    assert.strictEqual(artifact.model, 'open-meteo');
    assert.strictEqual(artifact.issue_time, '2026-10-26T11:00:00.000Z');
    assert.strictEqual(artifact.valid_time, '2026-10-26T12:00:00.000Z');
    assert.strictEqual(artifact.step_hours, 1);
    assert.strictEqual(artifact.u.length, 156);
    assert.deepStrictEqual([...new Set(artifact.u.map((x) => Math.abs(x) < 1e-9 ? 0 : x))], [0]);
    assert.deepStrictEqual([...new Set(artifact.v)], [-6]);
  });

  test('a transport that refuses fails loudly, never publishing nonsense', async () => {
    const stub = async () => ({ ok: false, status: 503 });
    await assert.rejects(
      () => fetchWindArtifact({ fetchImpl: stub, now: new Date() }),
      /HTTP 503/,
    );
  });
});
