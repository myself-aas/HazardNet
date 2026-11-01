/** @jest-environment node */
import { dhakaCalendarDate, loadDistrictDaily, parsePublicDailyPayload, DAILY_SCHEMA } from '../dailyAdvisories';

const now = new Date('2026-11-01T18:00:00Z');
const row = {
  advisoryId: '1-2026-11-02-flood', districtId: 1, district: 'Kurigram', division: 'Rangpur',
  forecastDay: 1, targetDate: '2026-11-02', hazard: 'Flood', tier: 'WATCH',
  reasonCode: 'district_outlook', actionIds: ['check_drains', 'keep_feed_dry', 'check_official_updates'],
  peak: 'tied', qualityNotes: ['official_update_unverified'], weather: { precipitationMm: 2.4 },
};
const payload = {
  schema: DAILY_SCHEMA,
  run: {
    id: 'synthetic-client-test', generatedAt: '2026-11-01T17:00:00Z',
    dataCutoff: '2026-11-01T15:00:00Z', expiresAt: '2026-11-03T03:00:00.000Z',
    modelVersion: 'test-version', inputSha256: 'a'.repeat(64),
  },
  coverage: { districts: 1, forecastDays: 15, publishedRows: 1 },
  scope: 'timeline', status: 'fresh', asOf: '2026-11-01T18:00:00Z',
  selectedDate: null, count: 1,
  advisories: [row],
};

const answer = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

it('uses Bangladesh midnight and accepts only a validated published row', () => {
  expect(dhakaCalendarDate(new Date('2026-11-01T17:59:59Z'))).toBe('2026-11-01');
  expect(dhakaCalendarDate(now)).toBe('2026-11-02');
  expect(parsePublicDailyPayload(payload, 'Kurigram')?.advisories[0].targetDate).toBe('2026-11-02');
  expect(parsePublicDailyPayload(payload, 'Dhaka')?.advisories).toEqual([]);
});

it('refuses higher tiers, leaked columns and invented actions instead of displaying partial results', () => {
  expect(parsePublicDailyPayload({ ...payload, advisories: [{ ...row, tier: 'SEVERE' }] }, 'Kurigram')).toBeNull();
  expect(parsePublicDailyPayload({ ...payload, advisories: [{ ...row, fusionReason: 'secret' }] }, 'Kurigram')).toBeNull();
  expect(parsePublicDailyPayload({ ...payload, advisories: [{ ...row, actionIds: ['check_drains', 'avoid_burning'] }] }, 'Kurigram')).toBeNull();
  expect(parsePublicDailyPayload({ ...payload, run: { ...payload.run, dataCutoff: null } }, 'Kurigram')).toBeNull();
  expect(parsePublicDailyPayload({ ...payload, advisories: [{ ...row, targetDate: '2026-02-30' }] }, 'Kurigram')).toBeNull();
  expect(parsePublicDailyPayload({ ...payload, privateLedger: { row: 'secret' } }, 'Kurigram')).toBeNull();
  expect(parsePublicDailyPayload({ ...payload, run: { ...payload.run, reviewerEmail: 'private@example.test' } }, 'Kurigram')).toBeNull();
  expect(parsePublicDailyPayload({ ...payload, coverage: { ...payload.coverage, hiddenCount: 7 } }, 'Kurigram')).toBeNull();
  expect(parsePublicDailyPayload({ ...payload, run: { ...payload.run, inputSha256: 'invalid' } }, 'Kurigram')).toBeNull();
  expect(parsePublicDailyPayload({ ...payload, advisories: [{ ...row, districtId: 2,
    advisoryId: '2-2026-11-02-flood' }] }, 'Kurigram')).toBeNull();
  expect(parsePublicDailyPayload({ ...payload, scope: 'summary' }, 'Kurigram')).toBeNull();
  expect(parsePublicDailyPayload({ ...payload, status: 'fresh' }, 'Kurigram')?.advisories).toHaveLength(1);
  expect(parsePublicDailyPayload({ ...payload, status: 'officially_verified' }, 'Kurigram')).toBeNull();
});

it('tries the small API first, then a validated static asset, and labels offline/old copies', async () => {
  const calls: string[] = [];
  const staticPayload = {
    schema: payload.schema, run: payload.run, coverage: payload.coverage, advisories: payload.advisories,
  };
  const fetcher: typeof fetch = (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    return calls.length === 1 ? answer({ error: 'unavailable' }, {}, 503) : answer(staticPayload);
  }) as typeof fetch;
  const fromSnapshot = await loadDistrictDaily('Kurigram', { fetcher, now });
  expect(calls[0]).toContain('/api/v1/advisories?scope=timeline');
  expect(calls[1]).toBe('/data/daily-advisories-v1.json');
  expect(fromSnapshot).toMatchObject({ status: 'fresh', source: 'snapshot', advisories: [row] });

  const offline = await loadDistrictDaily('Kurigram', {
    now, fetcher: (async () => answer(payload, { 'X-HazardNet-Stale': '1' })) as typeof fetch,
  });
  expect(offline).toMatchObject({ status: 'offline', source: 'offline', fetchedAt: null });
  const stale = await loadDistrictDaily('Kurigram', {
    now: new Date('2026-11-04T18:00:00Z'), fetcher: (async () => answer(payload)) as typeof fetch,
  });
  expect(stale.status).toBe('stale');
  expect(stale.advisories).toEqual([]); // Past days are never presented as today's forecast.
});

it('never substitutes a historic or unrelated forecast when both public reads fail', async () => {
  const result = await loadDistrictDaily('Kurigram', {
    now, fetcher: (async () => answer({ error: 'none' }, {}, 503)) as typeof fetch,
  });
  expect(result).toEqual({ status: 'unavailable', source: 'none', run: null, advisories: [], fetchedAt: null });
});
