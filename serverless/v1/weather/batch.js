// POST /api/v1/weather/batch — deployed by the Vercel entry point
// api/v1/weather/batch.js, which also carries the `config.bodyParser` limit.
// Body: { "points": [{ "id": "kurigram", "lat": ..., "lng": ... }, ...] }
//
// Returns current-weather conditions for many points in a single upstream call.

// Three levels up from serverless/v1/weather/ is the repo root (this specifier had four
// before the move, i.e. it resolved outside the repository and the deployed function threw
// ERR_MODULE_NOT_FOUND at import time).
import { fetchCurrentWeatherBatch } from '../../../backend/utils/openMeteo.js';
import { clientError } from '../../../backend/utils/clientError.js';
import { guardRequest } from '../../../backend/middleware/serverlessGuard.js';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const points = Array.isArray(req.body?.points) ? req.body.points : [];
    const mapped = points
      .filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number')
      .map(p => ({ id: p.id ?? `${p.lat},${p.lng}`, lat: p.lat, lng: p.lng }));
    if (mapped.length === 0) {
      res.status(400).json({ error: 'points array must contain {id,lat,lng} entries' });
      return;
    }
    try {
      const results = await fetchCurrentWeatherBatch(mapped, { timezone: req.body?.timezone || 'Asia/Dhaka' });
      res.setHeader('Cache-Control', 'public, max-age=900');
      res.status(200).json({ count: results.length, generated_at: new Date().toISOString(), points: results });
    } catch (err) {
      clientError(res, err, { scope: 'api/v1/weather/batch', fallback: 'Weather lookup failed' });
    }
    return;
  }
  if (guardRequest(req, res, { bucket: 'read' })) return;

  if (req.method === 'GET') {
    const coords = typeof req.query.coords === 'string' ? req.query.coords : '';
    const points = coords.split('|').map(seg => {
      const [lat, lng, ...rest] = seg.split(',');
      return { lat: parseFloat(lat), lng: parseFloat(lng), id: rest.join(',') || undefined };
    }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (points.length === 0) {
      res.status(400).json({ error: 'coords query must be lat,lng,id|lat,lng,id|...' });
      return;
    }
    try {
      const results = await fetchCurrentWeatherBatch(points);
      res.setHeader('Cache-Control', 'public, max-age=900');
      res.status(200).json({ count: results.length, generated_at: new Date().toISOString(), points: results });
    } catch (err) {
      clientError(res, err, { scope: 'api/v1/weather/batch', fallback: 'Weather lookup failed' });
    }
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Method Not Allowed' });
}
