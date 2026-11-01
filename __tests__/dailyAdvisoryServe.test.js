/** @jest-environment node */
import { buildPublicDailySnapshot, parsePublicDailySnapshot } from '../backend/utils/dailyAdvisoryPublic.js';
import { dhakaDate, queryPublicDaily, loadPublicDailyAsset } from '../backend/utils/dailyAdvisoryServe.js';
import { DISTRICT_REGISTRY } from '../backend/utils/districtRegistry.js';
import { respondWithPublicDaily } from '../backend/utils/dailyAdvisoryEdge.js';
import { readPublishedDailySnapshot } from '../backend/utils/dailyAdvisoryNode.js';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ALL_64_DISTRICTS } from '../frontend/src/data/bangladeshDistricts.ts';
import { canonicalKey } from '../frontend/src/lib/forecasts.ts';

const NOW = new Date('2026-11-01T18:00:00Z'); // midnight in Dhaka, 2 November
const manifest = {
  schema_version: '4.3-pb', run_id: 'synthetic-test-run',
  generated_at: '2026-11-01T17:00:00Z', data_cutoff: '2026-11-01T15:00:00Z',
  model_version: 'test-version', csv_sha256: 'c'.repeat(64),
};
function sample(count = 3) {
  return DISTRICT_REGISTRY.slice(0, count).flatMap((district) =>
    Array.from({ length: 15 }, (_, index) => ({
      district: district.district_name,
      target_date: new Date(Date.parse('2026-11-02T00:00:00Z') + index * 86_400_000).toISOString().slice(0, 10),
      forecast_day: String(index + 1), hazard: 'Flood',
      advisory_tier: 'WATCH', severity_score: index === 4 ? '0.6' : '0.3',
      is_peak_day: String(index === 4), bmd_stale: 'True', physics_degraded: 'False',
      unapproved_input_note: 'private input detail',
    })));
}
function published() {
  const rows = sample();
  rows[15 + 4].advisory_tier = 'WARNING'; // second district's unreviewed peak
  return buildPublicDailySnapshot(rows, manifest, { expectedDistricts: 3 });
}

it('frontend district names and numeric IDs stay aligned with the canonical 64-district registry', () => {
  expect(ALL_64_DISTRICTS).toHaveLength(DISTRICT_REGISTRY.length);
  for (const [index, district] of DISTRICT_REGISTRY.entries()) {
    const frontend = ALL_64_DISTRICTS[index];
    expect(district.district_id).toBe(index + 1);
    expect(canonicalKey(frontend.name)).toBe(canonicalKey(district.district_name));
    expect(canonicalKey(frontend.division)).toBe(canonicalKey(district.division));
  }
});

it('Dhaka date switches at local midnight, not UTC midnight', () => {
  expect(dhakaDate(new Date('2026-11-01T17:59:59Z'))).toBe('2026-11-01');
  expect(dhakaDate(NOW)).toBe('2026-11-02');
});

it('selects approved 1, 3, 7 and 15-day district timelines and no unpublished tiers', () => {
  const snapshot = published();
  for (const days of [1, 3, 7, 15]) {
    const result = queryPublicDaily(snapshot, { scope: 'timeline', district: 'Kurigram', days: String(days) }, NOW);
    expect(result.code).toBe(200);
    expect(result.body.advisories).toHaveLength(days);
    expect(result.body.advisories[0].targetDate).toBe('2026-11-02');
    expect(JSON.stringify(result.body)).not.toContain('unapproved_input_note');
  }
  expect(queryPublicDaily(snapshot, { scope: 'timeline' }, NOW).body.count).toBe(44);
  expect(queryPublicDaily(snapshot, { scope: 'timeline', role: 'officer' }, NOW).body.count).toBe(44);
  expect(JSON.stringify(queryPublicDaily(snapshot, {}, NOW).body)).not.toContain('WARNING');
});

it('latest, peak and summary are date/district/division-specific without manufactured peak', () => {
  const snapshot = published();
  const latest = queryPublicDaily(snapshot, {}, NOW);
  expect(latest.body.selectedDate).toBe('2026-11-02');
  expect(latest.body.count).toBe(3);
  const selected = queryPublicDaily(snapshot, { scope: 'latest', district_id: '1', date: '2026-11-06' }, NOW);
  expect(selected.body.advisories[0].peak).toBe('unique');
  const withheld = queryPublicDaily(snapshot, { scope: 'peak', district_id: '2' }, NOW);
  expect(withheld.body.count).toBe(0);
  const summary = queryPublicDaily(snapshot, { scope: 'summary', division: 'Rangpur' }, NOW);
  expect(summary.body.summary).toEqual({
    districts: 3, byTier: { WATCH: 3 }, byHazard: { Flood: 3 }, byDivision: { Rangpur: 3 },
  });
  expect(queryPublicDaily(snapshot, { district: 'Not-a-district' }, NOW).code).toBe(400);
  expect(queryPublicDaily(snapshot, { district: ['Kurigram', 'Dhaka'] }, NOW).code).toBe(400);
  expect(queryPublicDaily(snapshot, { date: '2026-02-30' }, NOW).code).toBe(400);
  expect(queryPublicDaily(snapshot, { days: '90' }, NOW).code).toBe(400);
  expect(queryPublicDaily(snapshot, { scope: 'private' }, NOW).code).toBe(400);
});

it('unavailable or tampered assets fail closed; old runs become stale', () => {
  expect(queryPublicDaily(null, {}, NOW)).toMatchObject({ code: 503 });
  const snapshot = published();
  expect(queryPublicDaily(snapshot, {}, new Date('2026-11-05T00:00:00Z')).body.status).toBe('stale');
  expect(parsePublicDailySnapshot({ ...snapshot, advisories: [
    { ...snapshot.advisories[0], fusionReason: 'private' }, ...snapshot.advisories.slice(1),
  ] })).toBeNull();
  expect(queryPublicDaily({ ...snapshot, advisories: [
    { ...snapshot.advisories[0], tier: 'SEVERE' }, ...snapshot.advisories.slice(1),
  ] }, {}, NOW).code).toBe(503);
});

it('Node reads only the built public JSON, never a technical export or an alternate path', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hazardnet-daily-node-'));
  const priorEnv = process.env.NODE_ENV;
  try {
    writeFileSync(join(root, 'daily-private.csv'), 'unapproved_input_note,secret\nprivate,data\n');
    expect(await readPublishedDailySnapshot(root)).toBeNull();
    const publicDir = join(root, 'frontend', 'public', 'data');
    mkdirSync(publicDir, { recursive: true });
    writeFileSync(join(publicDir, 'daily-advisories-v1.json'), JSON.stringify(published()));
    expect((await readPublishedDailySnapshot(root)).advisories).toHaveLength(44);
    process.env.NODE_ENV = 'production';
    // Production must not fall back to the development asset if its own build is missing.
    expect(await readPublishedDailySnapshot(root)).toBeNull();
    const distDir = join(root, 'frontend', 'dist', 'data');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(distDir, 'daily-advisories-v1.json'), JSON.stringify(published()));
    expect((await readPublishedDailySnapshot(root)).advisories).toHaveLength(44);
  } finally {
    if (priorEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorEnv;
    rmSync(root, { recursive: true, force: true });
  }
});

// The dynamic Pages route is /api/v1/advisories/[scope].
it('Pages reads only ASSETS and rejects duplicate filters; method has no privileged branch', async () => {
  jest.useFakeTimers().setSystemTime(NOW);
  try {
    const snapshot = published();
    const assets = { fetch: jest.fn(async (request) => {
      expect(new URL(request.url).pathname).toBe('/data/daily-advisories-v1.json');
      return new Response(JSON.stringify(snapshot), { status: 200 });
    }) };
    const env = { ASSETS: assets };
    const request = new Request('https://hazardnet.live/api/v1/advisories/timeline?district_id=1&days=7');
    const response = await respondWithPublicDaily({ request, env, params: { scope: 'timeline' } });
    expect(response.status).toBe(200);
    expect((await response.json()).count).toBe(7);
    expect(assets.fetch).toHaveBeenCalledTimes(1);
    const edge = require('../functions/api/v1/advisories/[scope].ts');
    const named = await edge.onRequestGet({ request, env, params: { scope: 'timeline' } });
    expect(named.status).toBe(200);
    expect((await named.json()).advisories[0].district).toBe('Kurigram');
    const duplicate = await respondWithPublicDaily({
      request: new Request('https://hazardnet.live/api/v1/advisories?district_id=1&district_id=2'), env,
    });
    expect(duplicate.status).toBe(400);
    expect(assets.fetch).toHaveBeenCalledTimes(2);
    const failed = await loadPublicDailyAsset({ ASSETS: { fetch: async () =>
      new Response(JSON.stringify({ ...snapshot, secret: 'not public' }), { status: 200 }) } }, request);
    expect(failed).toBeNull();
  } finally { jest.useRealTimers(); }
});
