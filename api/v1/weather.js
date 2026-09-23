// Vercel Serverless Function — GET /api/v1/weather?lat=..&lng=..
// POST /api/v1/weather/batch  (see backend/routes/weather.js for details).
//
// Thin wrapper over backend/utils/openMeteo.js so production (Vercel) and
// local/GitHub-Actions runs (Express) share identical behavior.

import { fetchWeather, fetchCurrentWeather } from '../../../backend/utils/openMeteo.js';
import { clientError } from '../../backend/utils/clientError.js';
import { guardRequest } from '../backend/middleware/serverlessGuard.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  if (guardRequest(req, res, { bucket: 'read' })) return;

  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    res.status(400).json({ error: 'lat and lng query parameters are required (numeric)' });
    return;
  }
  const forecast_days = req.query.forecast_days ? parseInt(req.query.forecast_days, 10) : undefined;
  const timezone = typeof req.query.timezone === 'string' && req.query.timezone ? req.query.timezone : undefined;
  const mini = req.query.mini === '1' || req.query.mini === 'true';

  try {
    const data = mini
      ? await fetchCurrentWeather(lat, lng, { timezone })
      : await fetchWeather(lat, lng, { forecast_days, timezone });
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.status(200).json(data);
  } catch (err) {
    clientError(res, err, { scope: 'api/v1/weather', fallback: 'Weather lookup failed' });
  }
}
