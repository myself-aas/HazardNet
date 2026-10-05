/**
 * windPipeline.test.js
 *
 * Pure-helper contracts for scripts/fetch_live_wind.mjs (Phase E): cycle
 * alignment, GFS idx byte-range bookkeeping, the ECMWF JSONL picks, spread
 * parsing, the degree-grid resample and the artifact shape the client parses.
 * The network + wgrib2 halves are exercised by the Live Wind Update workflow
 * itself. Runs via both `node --test` and Jest.
 */

import assert from 'node:assert';
import * as nodeTest from 'node:test';

const describe = globalThis.describe ?? nodeTest.describe;
const test = globalThis.test ?? nodeTest.test;

import {
  WIND_BBOX,
  WIND_SCHEMA,
  buildArtifact,
  parseGfsIdx,
  parseSpread,
  pickEcmwfMessages,
  pickWindMessages,
  resampleToGrid,
  sixHourCycles,
} from '../scripts/fetch_live_wind.mjs';

describe('six-hour cycle candidates', () => {
  test('align to the synoptic clock and run newest-first', () => {
    const now = new Date('2026-10-05T18:07:00Z');
    const cycles = sixHourCycles(now, 3.5, 3);
    assert.deepStrictEqual(
      cycles.map((c) => `${c.date}/${c.hour}`),
      ['20261005/12', '20261005/06', '20261005/00'],
    );
    assert.strictEqual(cycles[0].iso, '2026-10-05T12:00:00.000Z');
  });
});

describe('GFS idx parsing', () => {
  const IDX = [
    '0:1:d=2026100506:TMP:surface:f006:',
    '512345:2:d=2026100506:UGRD:10 m above ground:f006:',
    '1048576:3:d=2026100506:VGRD:10 m above ground:f006:',
    '1572864:4:d=2026100506:RH:2 m above ground:f006:',
  ].join('\n');

  test('computes byte ranges, open-ended for the last message', () => {
    const entries = parseGfsIdx(IDX);
    assert.strictEqual(entries.length, 4);
    assert.strictEqual(entries[0].end, 512344);
    assert.strictEqual(entries[3].end, null);
  });

  test('picks exactly the 10 m wind messages', () => {
    const picks = pickWindMessages(parseGfsIdx(IDX));
    assert.ok(picks);
    assert.strictEqual(picks.u.offset, 512345);
    assert.strictEqual(picks.u.end, 1048575);
    assert.strictEqual(picks.v.offset, 1048576);
    assert.strictEqual(pickWindMessages(parseGfsIdx('0:1:d=x:TMP:surface:f006:')), null);
  });
});

describe('ECMWF JSONL index', () => {
  test('picks 10u/10v byte ranges from the per-file index', () => {
    const jsonl = [
      JSON.stringify({ param: '2t', step: 6, offset: 0, length: 100 }),
      JSON.stringify({ param: '10u', step: 6, offset: 100, length: 90 }),
      JSON.stringify({ param: '10v', step: 6, offset: 190, length: 95 }),
    ].join('\n');
    const picks = pickEcmwfMessages(jsonl);
    assert.ok(picks);
    assert.strictEqual(picks.u.offset, 100);
    assert.strictEqual(picks.v.length, 95);
    assert.strictEqual(pickEcmwfMessages('{"param":"2t"}'), null);
  });
});

describe('wgrib2 spread parsing', () => {
  test('parses lon/lat/value, normalises 0-360 longitudes, drops sentinels', () => {
    const text = ['90.000000 23.500000 3.4', '450.250000 24.000000 -1.2', '91.000000 25.000000 9.999e+20', 'junk'].join('\n');
    const points = parseSpread(text);
    assert.strictEqual(points.length, 2);
    assert.deepStrictEqual(points[0], { lon: 90, lat: 23.5, value: 3.4 });
    assert.ok(Math.abs(points[1].lon - 90.25) < 1e-9);
    assert.strictEqual(points[1].value, -1.2);
  });
});

describe('degree-grid resample', () => {
  test('averages the native neighbourhood of every node', () => {
    // Native field u(lon) = lon on a 0.25 degree lattice: the four diagonals
    // around any node average back to the node's own longitude exactly.
    const points = [];
    for (let lat = WIND_BBOX.latMin - 0.5; lat <= WIND_BBOX.latMax + 0.5; lat += 0.25) {
      for (let lon = WIND_BBOX.lonMin - 0.5; lon <= WIND_BBOX.lonMax + 0.5; lon += 0.25) {
        points.push({ lon, lat, value: lon });
      }
    }
    const grid = resampleToGrid(points);
    const cols = (WIND_BBOX.lonMax - WIND_BBOX.lonMin) / WIND_BBOX.step + 1;
    assert.strictEqual(grid.length, cols * ((WIND_BBOX.latMax - WIND_BBOX.latMin) / WIND_BBOX.step + 1));
    for (let r = 0; r < 13; r += 1) {
      for (let c = 0; c < 12; c += 1) {
        const lon = WIND_BBOX.lonMin + c * WIND_BBOX.step;
        assert.ok(Math.abs(grid[r * cols + c] - lon) < 1e-6, `node ${lon},${WIND_BBOX.latMin + r} resampled wrong`);
      }
    }
  });

  test('refuses to invent values for holes', () => {
    assert.throws(() => resampleToGrid([]));
  });
});

describe('artifact assembly', () => {
  test('matches the client contract exactly', () => {
    const artifact = buildArtifact(
      {
        model: 'gfs',
        modelName: 'NOAA GFS 0.25 degree',
        issueIso: '2026-10-05T06:00:00.000Z',
        validIso: '2026-10-05T12:00:00.000Z',
        stepHours: 6,
        kind: 'forecast',
        u: new Array(156).fill(1.234),
        v: new Array(156).fill(-5.678),
      },
      new Date('2026-10-05T12:10:00.000Z'),
    );
    assert.strictEqual(artifact.schema, WIND_SCHEMA);
    assert.strictEqual(artifact.model, 'gfs');
    assert.strictEqual(artifact.u.length, 156);
    assert.strictEqual(artifact.u[0], 1.2);
    assert.strictEqual(artifact.v[0], -5.7);
    assert.strictEqual(artifact.grid.step, 1);
    assert.strictEqual(artifact.generated_at, '2026-10-05T12:10:00.000Z');
  });
});
