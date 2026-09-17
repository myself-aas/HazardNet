/**
 * @jest-environment jsdom
 *
 * The alert client contract (Phase 5). What is pinned here is the part that protects
 * people rather than the part that is convenient to test:
 *
 *   - only PUBLISHED rows are ever rendered, and the count of dropped rows is reported;
 *   - a payload with no §1.7 disclaimer is flagged, and the canonical text is rendered;
 *   - an unknown level is refused (never coerced into a colour);
 *   - the live API is preferred, the snapshot is the labelled fallback, and a failed
 *     load returns `source: 'none'` instead of throwing;
 *   - a service-worker-labelled stale response is downgraded to `cache`, not passed off
 *     as live.
 */

import {
  ALERTS_API_URL, ALERTS_SNAPSHOT_URL, ALERT_LEVELS, alertLevelRank, alertsByDistrict,
  alertsForDistrict, districtKey, freshnessOf, isAlertLevel, loadAlertPolicy, loadAlerts,
  parseAlertsPayload, parsePolicyPayload, sortAlerts, summariseAlerts,
} from '../alerts';

const DISCLAIMER = 'HazardNet is a research-based decision-support tool. It is not an official '
  + 'warning service. Always follow instructions from the Bangladesh Meteorological Department, '
  + 'FFWC and your local administration.';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'a-1',
  state: 'PUBLISHED',
  level: 'WATCH',
  district_id: 60,
  district_name: 'Sunamganj',
  division: 'Sylhet',
  horizon: '7_days',
  hazard_type: 'Flash Flood',
  target_date: '2026-09-21',
  severity_score: 0.81,
  confidence: 0.42,
  disclaimer: DISCLAIMER,
  ...over,
});

const jsonResponse = (body: unknown, { ok = true, stale = false }: { ok?: boolean; stale?: boolean } = {}) => ({
  ok,
  status: ok ? 200 : 500,
  headers: { get: (name: string) => (stale && name === 'X-HazardNet-Stale' ? '1' : null) },
  json: async () => body,
}) as unknown as Response;

describe('parseAlertsPayload', () => {
  it('keeps PUBLISHED rows and reports how many it dropped', () => {
    const { alerts, dropped_unpublished, warnings } = parseAlertsPayload({
      alerts: [row(), row({ id: 'a-2', state: 'DRAFT' }), row({ id: 'a-3', state: 'PENDING_REVIEW' })],
    });
    expect(alerts.map((a) => a.id)).toEqual(['a-1']);
    expect(dropped_unpublished).toBe(2);
    expect(warnings.join(' ')).toMatch(/non-published/i);
  });

  it('warns when a row has no disclaimer, and keeps the row renderable', () => {
    const { alerts, warnings } = parseAlertsPayload({
      alerts: [row({ disclaimer: null })],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].disclaimer).toBeNull();
    expect(warnings.join(' ')).toMatch(/§1\.7/);
  });

  it('refuses an unknown level instead of inventing one', () => {
    const { alerts, warnings } = parseAlertsPayload({ alerts: [row({ level: 'EMERGENCY' })] });
    expect(alerts).toHaveLength(0);
    expect(warnings.join(' ')).toMatch(/unknown level/i);
  });

  it('refuses a row without an id', () => {
    const { alerts, warnings } = parseAlertsPayload({ alerts: [row({ id: undefined })] });
    expect(alerts).toHaveLength(0);
    expect(warnings.join(' ')).toMatch(/no id/i);
  });

  it('always sorts highest level first', () => {
    const { alerts } = parseAlertsPayload({
      alerts: [
        row({ id: 'w1', level: 'WATCH', severity_score: 0.9 }),
        row({ id: 's1', level: 'SEVERE', severity_score: 0.1 }),
        row({ id: 'n1', level: 'NO_ALERT', severity_score: 0.99 }),
      ],
    });
    expect(alerts.map((a) => a.level)).toEqual(['SEVERE', 'WATCH', 'NO_ALERT']);
  });

  it('accepts a bare array as well as an envelope', () => {
    expect(parseAlertsPayload([row()]).alerts).toHaveLength(1);
  });

  it('reports a payload with no alerts array', () => {
    expect(parseAlertsPayload({ nope: true }).warnings[0]).toMatch(/no alerts array/i);
  });
});

describe('loadAlerts', () => {
  it('prefers the live API and labels the source', async () => {
    const fetcher = jest.fn(async () => jsonResponse({
      generated_at: '2026-09-18T06:00:00Z', assessed: 74, counts: { WATCH: 1 }, alerts: [row()],
    }));
    const result = await loadAlerts({ fetcher: fetcher as unknown as typeof fetch });
    expect(result.source).toBe('api');
    expect(result.alerts).toHaveLength(1);
    expect(result.assessed).toBe(74);
    expect(result.counts).toEqual({ WATCH: 1 });
    const urls = fetcher.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(urls.every((url) => !url.includes(ALERTS_SNAPSHOT_URL))).toBe(true);
  });

  it('falls back to the snapshot and says so when the API fails', async () => {
    const fetcher = jest.fn(async (url: string) => {
      if (String(url).includes(ALERTS_API_URL)) return jsonResponse({}, { ok: false });
      return jsonResponse({
        schema: 'hazardnet-alerts/v1', generated_at: '2026-09-17T20:00:00Z',
        assessed: 74, alerts: [row()],
      });
    });
    const result = await loadAlerts({ fetcher: fetcher as unknown as typeof fetch });
    expect(result.source).toBe('snapshot');
    expect(result.alerts).toHaveLength(1);
    expect(result.error).toContain('live API');
  });

  it('flags a snapshot whose schema tag is not the one the client understands', async () => {
    const fetcher = jest.fn(async () => jsonResponse({ schema: 'hazardnet-alerts/v0', alerts: [row()] }));
    const result = await loadAlerts({ fetcher: fetcher as unknown as typeof fetch, offlineFirst: true });
    expect(result.warnings.join(' ')).toMatch(/schema/);
  });

  it('downgrades a service-worker-labelled stale response to "cache"', async () => {
    const fetcher = jest.fn(async () => jsonResponse({ alerts: [row()] }, { stale: true }));
    const result = await loadAlerts({ fetcher: fetcher as unknown as typeof fetch });
    expect(result.source).toBe('cache');
    expect(result.warnings.join(' ')).toMatch(/offline cache/i);
  });

  it('never throws: an unreachable API and snapshot become source "none"', async () => {
    const fetcher = jest.fn(async () => { throw new Error('offline'); });
    const result = await loadAlerts({ fetcher: fetcher as unknown as typeof fetch });
    expect(result.source).toBe('none');
    expect(result.alerts).toEqual([]);
    expect(result.error).toContain('offline');
  });
});

describe('loadAlertPolicy', () => {
  it('reads the policy from the API when it can', async () => {
    const fetcher = jest.fn(async () => jsonResponse({
      version: 'alert-policy/1.0.0', thresholds: { watch_probability: 0.4 },
    }));
    const policy = await loadAlertPolicy({ fetcher: fetcher as unknown as typeof fetch });
    expect(policy?.version).toBe('alert-policy/1.0.0');
    expect(policy?.thresholds?.watch_probability).toBe(0.4);
  });

  it('falls back to the snapshot copy, then to null', async () => {
    const fetcher = jest.fn(async (url: string) => {
      if (String(url).includes('/policy')) throw new Error('nope');
      return jsonResponse({ policy: { version: 'alert-policy/0.9.0' } });
    });
    expect((await loadAlertPolicy({ fetcher: fetcher as unknown as typeof fetch }))?.version)
      .toBe('alert-policy/0.9.0');

    const dead = jest.fn(async () => { throw new Error('down'); });
    expect(await loadAlertPolicy({ fetcher: dead as unknown as typeof fetch })).toBeNull();
  });

  it('keeps the disclaimer the policy carries', () => {
    const parsed = parsePolicyPayload({ version: 'v', disclaimer: DISCLAIMER });
    expect(parsed?.disclaimer).toBe(DISCLAIMER);
  });
});

describe('levels and helpers', () => {
  it('ranks levels in severity order', () => {
    expect(ALERT_LEVELS.map(alertLevelRank)).toEqual([0, 1, 2, 3]);
    expect(isAlertLevel('WARNING')).toBe(true);
    expect(isAlertLevel('warning')).toBe(false);
  });

  it('summarises counts per level', () => {
    const { alerts } = parseAlertsPayload({
      alerts: [row({ id: '1' }), row({ id: '2' }), row({ id: '3', level: 'SEVERE' })],
    });
    expect(summariseAlerts(alerts)).toEqual({ NO_ALERT: 0, WATCH: 2, WARNING: 0, SEVERE: 1 });
  });

  it('matches districts by slug so "Cox\'s Bazar" finds "coxs-bazar"', () => {
    expect(districtKey("Cox's Bazar")).toBe('coxsbazar');
    expect(districtKey('  Sunamganj ')).toBe('sunamganj');
    const { alerts } = parseAlertsPayload({ alerts: [row({ district_name: "Cox's Bazar", id: 'cx' })] });
    expect(alertsForDistrict(alerts, 'coxs-bazar')?.id).toBe('cx');
    expect(alertsForDistrict(alerts, '60')?.id).toBe('cx'); // joinable by district_id too
    // Two keys per alert, on purpose: the map joins on the name slug and the table on
    // the numeric id, and a lookup that only knew one of them would drop rows silently.
    expect(alertsByDistrict(alerts).size).toBe(2);
    expect([...alertsByDistrict(alerts).keys()].sort()).toEqual(['60', 'coxsbazar']);
  });

  it('sorts a mixed list highest-first', () => {
    const list = [
      { id: 'a', level: 'WATCH', severity_score: 0.5 },
      { id: 'b', level: 'SEVERE', severity_score: 0.2 },
    ] as never[];
    expect(sortAlerts(list).map((alert: { id: string }) => alert.id)).toEqual(['b', 'a']);
  });
});

describe('freshnessOf', () => {
  it('measures age from the newest data cutoff', () => {
    const result = {
      generated_at: '2026-09-16T00:00:00Z',
      alerts: [
        { id: 'a', state: 'PUBLISHED', level: 'WATCH', freshness: { data_cutoff: '2026-09-17T00:00:00Z' } },
        { id: 'b', state: 'PUBLISHED', level: 'WATCH', freshness: { data_cutoff: '2026-09-16T12:00:00Z' } },
      ] as never[],
    };
    const { age_hours, within_slo } = freshnessOf(result as never, { now: new Date('2026-09-17T06:00:00Z') });
    expect(age_hours).toBe(6);
    expect(within_slo).toBe(true);
  });

  it('marks data past the 48 h SLO as stale', () => {
    const result = { generated_at: '2026-09-10T00:00:00Z', alerts: [] as never[] };
    const { age_hours, within_slo } = freshnessOf(result as never, { now: new Date('2026-09-17T06:00:00Z') });
    expect(age_hours).toBeGreaterThan(48);
    expect(within_slo).toBe(false);
  });

  it('returns nulls rather than guessing when there is no timestamp', () => {
    expect(freshnessOf({ generated_at: null, alerts: [] } as never)).toEqual({ age_hours: null, within_slo: null });
    expect(freshnessOf({ generated_at: 'nonsense', alerts: [] } as never).within_slo).toBeNull();
  });
});
