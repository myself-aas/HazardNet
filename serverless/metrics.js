/**
 * GET /api/metrics — Prometheus exposition of the Node function process (backlog #5).
 *
 * Deployed through api/[endpoint].js; stateless apart from the prom-client register,
 * whose series populate from scrape-driven refresh (see backend/utils/forecastFreshness.js
 * for the gauge semantics: the forecast-age series is ABSENT — never zeroed — when
 * freshness is unknown, because a flat gauge hides outages).
 *
 * A failing store makes the scrape return 503 rather than a partial exposition: a
 * 200 scrape with missing series can look like "nothing ingested yet", so the failure
 * has to trip the Prometheus "target down" alert instead.
 */

import metrics from '../backend/metrics.js';
import { guardRequest } from '../backend/middleware/serverlessGuard.js';
import { refreshForecastAgeGauge } from '../backend/utils/forecastFreshness.js';

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'metrics' })) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const freshness = await refreshForecastAgeGauge();
  if (freshness.status === 'error') {
    // Discovery-time failures are the ones the interface guard downstream is paging on.
    return res
      .status(503)
      .set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      .send?.(`forecast store unavailable: ${freshness.error?.message || 'unknown error'}\n`);
  }

  const body = await metrics.register.metrics();
  res.setHeader('Content-Type', metrics.register.contentType);
  return res.status(200).send(body);
}
