import express from 'express';
import { fetchWeather, fetchCurrentWeather, fetchCurrentWeatherBatch } from '../utils/openMeteo.js';
import { parsePointQuery, parseCoordsQuery, parsePointsBody } from '../utils/weatherQuery.js';
import { clientError } from '../utils/clientError.js';

const router = express.Router();

/**
 * GET /api/v1/weather?lat=..&lng=..[&forecast_days=16&timezone=Asia/Dhaka]
 * (`lon` is accepted as an alias; all query parsing lives in utils/weatherQuery.js so the
 * Express, serverless and Pages handlers cannot drift.)
 *
 * Full 16-day bundle: current conditions + all hourly variables + all daily
 * variables. 15-min in-memory cache on the backend.
 */
router.get('/', async (req, res) => {
  const parsed = parsePointQuery(req.query);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  const { lat, lng, forecast_days, timezone, mini } = parsed;

  try {
    const data = mini
      ? await fetchCurrentWeather(lat, lng, { timezone })
      : await fetchWeather(lat, lng, { forecast_days, timezone });
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.status(200).json(data);
  } catch (err) {
    clientError(res, err, { scope: 'backend/weather', fallback: 'Weather lookup failed' });
  }
});

/**
 * POST /api/v1/weather/batch
 * Body: { "points": [{ "id": "kurigram", "lat": 25.8058, "lng": 89.6361 }, ...] }
 *
 * Returns current-weather conditions for many points in a single upstream call.
 * GET is also supported for convenience with ?ids= (but POST avoids URL-length
 * limits for 64 points).
 */
router.post('/batch', express.json({ limit: '256kb' }), async (req, res) => {
  const parsed = parsePointsBody(req.body?.points);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  const mapped = parsed.points;
  try {
    const results = await fetchCurrentWeatherBatch(mapped, { timezone: req.body?.timezone || 'Asia/Dhaka' });
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.status(200).json({
      count: results.length,
      generated_at: new Date().toISOString(),
      points: results,
    });
  } catch (err) {
    clientError(res, err, { scope: 'backend/weather', fallback: 'Weather lookup failed' });
  }
});

/**
 * GET /api/v1/weather/batch?coords=lat1,lng1,id1|lat2,lng2,id2|...
 * (`;` is accepted too — see utils/weatherQuery.js; the Pages Function reads the same
 * parser, which is the Phase 1 "fix the shape divergence at the source" rule.)
 */
router.get('/batch', async (req, res) => {
  const coords = typeof req.query.coords === 'string' ? req.query.coords : '';
  const parsed = parseCoordsQuery(coords);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  const points = parsed.points;
  try {
    const results = await fetchCurrentWeatherBatch(points);
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.status(200).json({ count: results.length, generated_at: new Date().toISOString(), points: results });
  } catch (err) {
    clientError(res, err, { scope: 'backend/weather', fallback: 'Weather lookup failed' });
  }
});

export default router;
