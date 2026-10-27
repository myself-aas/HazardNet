/**
 * `POST /api/v1/weather/batch` — current conditions for many coordinates in one upstream call.
 *
 * Also answers `GET ?coords=lat,lng,id|lat,lng,id|…`, mirroring the Node handler and the
 * Express twin. The client uses the POST form (`frontend/src/lib/weather.ts`) to paint every
 * district marker at once; doing that per point would be 64 upstream calls per page view.
 *
 * Difference from the Node entry, stated because it is the kind of thing that silently
 * regresses a contract: the Node function declares `bodyParser.sizeLimit: '256kb'` on
 * `api/v1/weather/batch.js`. At the edge there is no body parser — `request.json()` buffers
 * whatever arrives — so the cap is enforced here, before parsing, against the same 256 KiB.
 * Without it the endpoint would accept a body of any size from an unauthenticated caller.
 */

import { fetchCurrentWeatherBatch } from '../../../../backend/utils/openMeteo.js';

/** The Node entry's declared limit (`config.api.bodyParser.sizeLimit`). */
const BODY_MAX_BYTES = 256 * 1024;

interface Point {
  id?: string;
  lat: number;
  lng: number;
}

interface PagesContext {
  request: Request;
}

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=900',
      ...extraHeaders,
    },
  });
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request } = context;
  let points: Point[] = [];
  let timezone = 'Asia/Dhaka';

  if (request.method === 'POST') {
    const raw = await request.text();
    if (raw.length > BODY_MAX_BYTES) {
      return json({ error: 'payload too large' }, 413, { 'cache-control': 'no-store' });
    }
    let body: { timezone?: string; points?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'body must be valid JSON' }, 400, { 'cache-control': 'no-store' });
    }
    timezone = typeof body?.timezone === 'string' && body.timezone ? body.timezone : timezone;
    const list = Array.isArray(body?.points) ? body.points : [];
    points = list
      .filter((point): point is Point => Boolean(point)
        && typeof point.lat === 'number'
        && typeof point.lng === 'number')
      .map((point) => ({ id: point.id ?? `${point.lat},${point.lng}`, lat: point.lat, lng: point.lng }));
    if (points.length === 0) {
      return json({ error: 'points array must contain {id,lat,lng} entries' }, 400, { 'cache-control': 'no-store' });
    }
  } else if (request.method === 'GET') {
    const coords = new URL(request.url).searchParams.get('coords') ?? '';
    points = coords.split('|').map((segment) => {
      const [lat, lng, ...rest] = segment.split(',');
      return { lat: parseFloat(lat), lng: parseFloat(lng), id: rest.join(',') || undefined };
    }).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    if (points.length === 0) {
      return json({ error: 'coords query must be lat,lng,id|lat,lng,id|...' }, 400, { 'cache-control': 'no-store' });
    }
  } else {
    return json({ error: 'method not allowed' }, 405, { allow: 'GET, POST', 'cache-control': 'no-store' });
  }

  try {
    const results = await fetchCurrentWeatherBatch(points, { timezone });
    return json({
      count: results.length,
      generated_at: new Date().toISOString(),
      points: results,
    }, 200);
  } catch (error) {
    console.error('[weather/batch] lookup failed:', error instanceof Error ? error.message : error);
    return json({ error: 'Weather lookup failed' }, 502, { 'cache-control': 'no-store' });
  }
}
