/**
 * GET /api/v1/weather?lat=..&lng=..[&forecast_days=16&timezone=Asia/Dhaka][&mini=1]
 *
 * Current + forecast for one point from Open-Meteo (the repo's only weather data
 * source, see backend/utils/openMeteo.js); `mini=1` returns current-conditions only.
 * Identical query contract and cache headers to the Express twin
 * (backend/routes/weather.js GET /). Deployed through api/v1/[resource].js.
 */

import { guardRequest } from '../../backend/middleware/serverlessGuard.js';
import { fetchWeather, fetchCurrentWeather } from '../../backend/utils/openMeteo.js';

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'read' })) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const lat = parseFloat(req.query?.lat);
  const lng = parseFloat(req.query?.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'lat and lng query parameters are required (numeric)' });
  }
  const forecast_days = req.query?.forecast_days
    ? parseInt(req.query.forecast_days, 10)
    : undefined;
  const timezone = typeof req.query?.timezone === 'string' && req.query.timezone
    ? req.query.timezone
    : undefined;
  const mini = req.query?.mini === '1' || req.query?.mini === 'true';

  try {
    const data = mini
      ? await fetchCurrentWeather(lat, lng, { timezone })
      : await fetchWeather(lat, lng, { forecast_days, timezone });
    res.setHeader('Cache-Control', 'public, max-age=900');
    return res.status(200).json(data);
  } catch (error) {
    console.error('[weather] lookup failed:', error.message);
    return res.status(502).json({ error: 'Weather lookup failed' });
  }
}
