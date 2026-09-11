/**
 * Vercel serverless Prometheus metrics endpoint (backlog #5 — replaced the
 * former placeholder). Stateless by design: per-instance counters would lie
 * about a fleet of lambdas, so this exposes the one metric that is honestly
 * computable per invocation — the forecast freshness SLO
 * (`hazardnet_forecast_age_hours`), computed live from the forecast store
 * (either FORECAST_STORE implementation) via the 60s-cached probe in
 * backend/utils/forecastFreshness.js.
 *
 * Response contract:
 *   GET  200  text exposition (gauge present once forecasts exist)
 *   GET  200  exposition without the gauge when nothing has been ingested yet
 *   GET  503  forecast store unavailable (failed scrape → alerts fire)
 *   any 405
 */
import client from 'prom-client';
import { refreshForecastAgeGauge } from '../backend/utils/forecastFreshness.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const outcome = await refreshForecastAgeGauge();
  if (outcome.status === 'error') {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain');
    res.end(`# forecast store unavailable: ${outcome.error?.message ?? 'unknown error'}\n`);
    return;
  }

  // Fresh registry per invocation — serverless instances share nothing.
  const register = new client.Registry();
  if (outcome.status === 'ok' && outcome.ageHours !== null) {
    const gauge = new client.Gauge({
      name: 'hazardnet_forecast_age_hours',
      help: 'Age of forecast data in hours (newest prediction_date across horizons)',
      registers: [register],
    });
    gauge.set(outcome.ageHours);
  }
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
}
