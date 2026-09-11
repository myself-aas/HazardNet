/**
 * @jest-environment node
 *
 * Vercel /api/metrics handler (backlog #5 — replaced the placeholder).
 * Stateless endpoint exposing the forecast freshness SLO computed live from
 * the (mocked) forecast store.
 */
import { createMocks } from 'node-mocks-http';
import handler from '../api/metrics.js';
import { getForecastStore as _getForecastStore } from '../backend/forecastStore.js';
import { _resetForecastFreshnessCacheForTests } from '../backend/utils/forecastFreshness.js';

jest.mock('../backend/forecastStore.js', () => ({
  getForecastStore: jest.fn(),
}));

const mockGetForecastStore = jest.mocked(_getForecastStore);
const today = () => new Date().toISOString().slice(0, 10);
const withProbe = (probe) => mockGetForecastStore.mockReturnValue({ getLatestPredictionDate: probe });

beforeEach(() => {
  jest.clearAllMocks();
  _resetForecastFreshnessCacheForTests();
});

describe('Metrics API handler', () => {
  it('rejects non-GET requests with 405', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it('serves the forecast-age gauge as Prometheus text when forecasts exist', async () => {
    withProbe(jest.fn().mockResolvedValue(today()));
    const { req, res } = createMocks({ method: 'GET' });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(String(res.getHeader('Content-Type'))).toContain('text/plain');
    const body = res._getData();
    expect(body).toContain('# HELP hazardnet_forecast_age_hours');
    expect(body).toMatch(/hazardnet_forecast_age_hours \d+(\.\d+)?/);
  });

  it('serves an exposition WITHOUT the gauge when nothing has been ingested', async () => {
    withProbe(jest.fn().mockResolvedValue(null));
    const { req, res } = createMocks({ method: 'GET' });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._getData()).not.toContain('hazardnet_forecast_age_hours');
  });

  it('returns 503 when the forecast store is unavailable (failed scrape → alerts fire)', async () => {
    withProbe(jest.fn().mockRejectedValue(new Error('connection refused')));
    const { req, res } = createMocks({ method: 'GET' });

    await handler(req, res);

    expect(res.statusCode).toBe(503);
    expect(res._getData()).toContain('forecast store unavailable');
    expect(res._getData()).toContain('connection refused');
  });
});
