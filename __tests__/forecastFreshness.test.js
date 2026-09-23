/**
 * @jest-environment node
 *
 * Forecast freshness gauge wiring (backend/utils/forecastFreshness.js) —
 * backlog #5, the guide's freshness SLO.
 *
 * Uses the REAL metrics module (asserted via the registry exposition text)
 * and a mocked forecast store, so the wiring — set on data, absent on
 * empty/error, 60s probe cache, age recomputed per call — is verified
 * end-to-end at the Prometheus text level.
 */
import { refreshForecastAgeGauge, _resetForecastFreshnessCacheForTests } from '../backend/utils/forecastFreshness.js';
import { forecastAgeHoursFromPredictionDate } from '../backend/metrics.js';
import metrics from '../backend/metrics.js';
import { getForecastStore as _getForecastStore } from '../backend/forecastStore.js';

jest.mock('../backend/forecastStore.js', () => ({
  getForecastStore: jest.fn(),
}));

const mockGetForecastStore = jest.mocked(_getForecastStore);
const exposition = () => metrics.register.metrics();

const today = () => new Date().toISOString().slice(0, 10);
const withProbe = (probe) => mockGetForecastStore.mockReturnValue({ getLatestPredictionDate: probe });

beforeEach(() => {
  jest.clearAllMocks();
  _resetForecastFreshnessCacheForTests();
  metrics.hideForecastAgeHours();
});

describe('forecastAgeHoursFromPredictionDate (pure conversion)', () => {
  it('converts a YYYY-MM-DD date to hours since its UTC midnight', () => {
    const date = today();
    const expected = (Date.now() - Date.parse(`${date}T00:00:00Z`)) / 3_600_000;
    expect(forecastAgeHoursFromPredictionDate(date)).toBeCloseTo(expected, 3);
  });

  it('returns null for invalid or non-string input', () => {
    expect(forecastAgeHoursFromPredictionDate('not-a-date')).toBeNull();
    expect(forecastAgeHoursFromPredictionDate(null)).toBeNull();
    expect(forecastAgeHoursFromPredictionDate(20260912)).toBeNull();
  });
});

describe('refreshForecastAgeGauge', () => {
  it('sets the gauge from the store probe and reports ok', async () => {
    const date = today();
    withProbe(jest.fn().mockResolvedValue(date));

    const outcome = await refreshForecastAgeGauge();

    expect(outcome.status).toBe('ok');
    expect(outcome.date).toBe(date);
    expect(outcome.ageHours).toBeCloseTo(forecastAgeHoursFromPredictionDate(date), 3);
    const text = await exposition();
    expect(text).toContain('# HELP hazardnet_forecast_age_hours');
    expect(text).toContain(`hazardnet_forecast_age_hours ${outcome.ageHours}`);
  });

  it('removes the series when nothing has been ingested (absent = the alert signal)', async () => {
    withProbe(jest.fn().mockResolvedValue(null));

    const outcome = await refreshForecastAgeGauge();

    expect(outcome).toMatchObject({ status: 'empty', date: null, ageHours: null });
    expect(await exposition()).not.toContain('hazardnet_forecast_age_hours');
  });

  it('removes the series and reports error when the store lookup fails', async () => {
    withProbe(jest.fn().mockRejectedValue(new Error('store down')));

    const outcome = await refreshForecastAgeGauge();

    expect(outcome.status).toBe('error');
    expect(outcome.error.message).toBe('store down');
    expect(await exposition()).not.toContain('hazardnet_forecast_age_hours');
  });

  it('reports error for an unparseable prediction_date (never a misleading value)', async () => {
    withProbe(jest.fn().mockResolvedValue('garbage'));

    const outcome = await refreshForecastAgeGauge();

    expect(outcome.status).toBe('error');
    expect(await exposition()).not.toContain('hazardnet_forecast_age_hours');
  });

  it('caches the store probe within the TTL', async () => {
    const probe = jest.fn().mockResolvedValue(today());
    withProbe(probe);
    const ttl = 10_000_000; // ~2.8h: long enough to cache, finite (Infinity would also swallow the initial probe)

    const first = await refreshForecastAgeGauge({ maxAgeMs: ttl });
    await refreshForecastAgeGauge({ maxAgeMs: ttl });

    expect(first.status).toBe('ok');
    expect(probe).toHaveBeenCalledTimes(1);

    // TTL forced to 0 → the next refresh re-queries the store.
    await refreshForecastAgeGauge({ maxAgeMs: 0 });
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('recomputes the age from the cached date on every call (age advances between probes)', async () => {
    withProbe(jest.fn().mockResolvedValue(today()));

    const ttl = 10_000_000; // ~2.8h: caches across a 2h clock shift, still expires from a cold start
    const first = await refreshForecastAgeGauge({ maxAgeMs: ttl });
    expect(first.status).toBe('ok');

    // Advance the clock 2h. The TTL must keep the cache (no re-probe) but the
    // age must be recomputed from the cached date against the new now.
    const realNow = Date.now;
    const spy = jest.spyOn(Date, 'now').mockReturnValue(realNow() + 2 * 3_600_000);
    const second = await refreshForecastAgeGauge({ maxAgeMs: ttl });
    spy.mockRestore();

    expect(second.status).toBe('ok');
    expect(second.ageHours).toBeCloseTo(first.ageHours + 2, 3);
  });
});
