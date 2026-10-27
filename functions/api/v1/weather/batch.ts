/**
 * `POST /api/v1/weather/batch` — current conditions for many coordinates in one upstream call.
 *
 * Also answers `GET ?coords=lat,lng,id|lat,lng,id|…`, mirroring the Node handler and the
 * Express twin; `;` is accepted as a point separator alongside `|` (both are decoded from
 * `%7C` / `%3B` by URLSearchParams). The client uses the POST form
 * (`frontend/src/lib/weather.ts`) to paint every district marker at once; doing that per
 * point would be 64 upstream calls per page view. `backend/utils/weatherQuery.js` parses
 * both forms for all three runtimes — no per-runtime fork of the mini-language.
 *
 * Difference from the Node entry, stated because it is the kind of thing that silently
 * regresses a contract: the Node function declares `bodyParser.sizeLimit: '256kb'` on
 * `api/v1/weather/batch.js`. At the edge there is no body parser — `request.json()` buffers
 * whatever arrives — so the cap is enforced here, before parsing, against the same 256 KiB.
 * Without it the endpoint would accept a body of any size from an unauthenticated caller.
 */

import { fetchCurrentWeatherBatch } from '../../../../backend/utils/openMeteo.js';
import { parseCoordsQuery, parsePointsBody } from '../../../../backend/utils/weatherQuery.js';

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
    const parsed = parsePointsBody(body?.points);
    if ('error' in parsed) {
      return json({ error: parsed.error }, 400, { 'cache-control': 'no-store' });
    }
    points = parsed.points;
  } else if (request.method === 'GET') {
    const coords = new URL(request.url).searchParams.get('coords') ?? '';
    const parsed = parseCoordsQuery(coords);
    if ('error' in parsed) {
      return json({ error: parsed.error }, 400, { 'cache-control': 'no-store' });
    }
    points = parsed.points;
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
