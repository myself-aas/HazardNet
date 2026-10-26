/**
 * POST /api/v1/weather/batch — current conditions for many coordinates at once.
 *   Body: { "points": [{ "id": "kurigram", "lat": 25.8058, "lng": 89.6361 }, …] }
 *
 * The only endpoint with its own function-level `config` (the 256 kb body limit is
 * declared on the entry file api/v1/weather/batch.js, next to its re-export). GET is
 * also supported with ?coords=lat1,lng1,id1|… mirroring the Express twin
 * (backend/routes/weather.js /batch).
 */

import { guardRequest } from '../../../backend/middleware/serverlessGuard.js';
import { fetchCurrentWeatherBatch } from '../../../backend/utils/openMeteo.js';

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'read' })) {
    return;
  }

  let points = [];
  let timezone = 'Asia/Dhaka';

  if (req.method === 'POST') {
    timezone = req.body?.timezone || timezone;
    const raw = Array.isArray(req.body?.points) ? req.body.points : [];
    points = raw
      .filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number')
      .map((p) => ({ id: p.id ?? `${p.lat},${p.lng}`, lat: p.lat, lng: p.lng }));
    if (points.length === 0) {
      return res.status(400).json({ error: 'points array must contain {id,lat,lng} entries' });
    }
  } else if (req.method === 'GET') {
    const coords = typeof req.query?.coords === 'string' ? req.query.coords : '';
    points = coords.split('|').map((seg) => {
      const [lat, lng, ...rest] = seg.split(',');
      return { lat: parseFloat(lat), lng: parseFloat(lng), id: rest.join(',') || undefined };
    }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (points.length === 0) {
      return res.status(400).json({ error: 'coords query must be lat,lng,id|lat,lng,id|...' });
    }
  } else {
    res.setHeader('allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const results = await fetchCurrentWeatherBatch(points, { timezone });
    res.setHeader('Cache-Control', 'public, max-age=900');
    return res.status(200).json({
      count: results.length,
      generated_at: new Date().toISOString(),
      points: results,
    });
  } catch (error) {
    console.error('[weather/batch] lookup failed:', error.message);
    return res.status(502).json({ error: 'Weather lookup failed' });
  }
}
