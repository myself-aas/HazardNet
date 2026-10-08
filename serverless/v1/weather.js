// GET /api/v1/weather?lat=..&lng=.. — deployed by the Vercel entry point
// api/v1/[resource].js. (The batch variant has its own handler and entry point.)
//
// Thin wrapper over backend/utils/openMeteo.js so production (Vercel) and
// local/GitHub-Actions runs (Express) share identical behavior.

// Relative depth note: this file lives at serverless/v1/, two levels below the repo root,
// which is what `../../backend/...` reaches. (Before the serverless/ move it was at
// api/v1/ — the same depth — but the specifiers still pointed two levels too high, so the
// deployed function failed at import time. __tests__/api/serverlessRouting.test.js now
// asserts every relative specifier resolves.)
import { fetchWeather, fetchCurrentWeather } from '../../backend/utils/openMeteo.js';
import { clientError } from '../../backend/utils/clientError.js';
import { guardRequest } from '../../backend/middleware/serverlessGuard.js';

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
