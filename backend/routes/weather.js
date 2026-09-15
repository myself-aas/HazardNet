import express from 'express';
import { fetchWeather, fetchCurrentWeather, fetchCurrentWeatherBatch } from '../utils/openMeteo.js';

const router = express.Router();

/**
 * GET /api/v1/weather?lat=..&lng=..[&forecast_days=16&timezone=Asia/Dhaka]
 *
 * Full 16-day bundle: current conditions + all hourly variables + all daily
 * variables. 15-min in-memory cache on the backend.
 */
router.get('/', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'lat and lng query parameters are required (numeric)' });
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
    res.status(err.status || 500).json({ error: err.message });
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
  const points = Array.isArray(req.body?.points) ? req.body.points : [];
  const mapped = points
    .filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number')
    .map(p => ({ id: p.id ?? `${p.lat},${p.lng}`, lat: p.lat, lng: p.lng }));
  if (mapped.length === 0) {
    return res.status(400).json({ error: 'points array must contain {id,lat,lng} entries' });
  }
  try {
    const results = await fetchCurrentWeatherBatch(mapped, { timezone: req.body?.timezone || 'Asia/Dhaka' });
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.status(200).json({
      count: results.length,
      generated_at: new Date().toISOString(),
      points: results,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/weather/batch?coords=lat1,lng1,id1|lat2,lng2,id2|...
 * (Query-string convenience for clients that prefer GET.)
 */
router.get('/batch', async (req, res) => {
  const coords = typeof req.query.coords === 'string' ? req.query.coords : '';
  const points = coords.split('|').map(seg => {
    const [lat, lng, ...rest] = seg.split(',');
    return { lat: parseFloat(lat), lng: parseFloat(lng), id: rest.join(',') || undefined };
  }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (points.length === 0) {
    return res.status(400).json({ error: 'coords query must be lat,lng,id|lat,lng,id|...' });
  }
  try {
    const results = await fetchCurrentWeatherBatch(points);
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.status(200).json({ count: results.length, generated_at: new Date().toISOString(), points: results });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
