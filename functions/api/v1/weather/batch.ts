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
import { CACHE, respond, respondError, type PagesContext as BasePagesContext } from '../../../../backend/edge/response';

/** The Node entry's declared limit (`config.api.bodyParser.sizeLimit`). */
const BODY_MAX_BYTES = 256 * 1024;

interface Point {
  id?: string;
  lat: number;
  lng: number;
}

type PagesContext = BasePagesContext;

/** 15 minutes, matching the single-point endpoint and the Node handler. */
const BATCH_CACHE = CACHE.publicFor(900);

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request } = context;
  let points: Point[] = [];
  let timezone = 'Asia/Dhaka';

  if (request.method === 'POST') {
    const raw = await request.text();
    if (raw.length > BODY_MAX_BYTES) {
      return respond({ error: 'payload too large' }, { status: 413 });
    }
    let body: { timezone?: string; points?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return respond({ error: 'body must be valid JSON' }, { status: 400 });
    }
    timezone = typeof body?.timezone === 'string' && body.timezone ? body.timezone : timezone;
    const parsed = parsePointsBody(body?.points);
    if ('error' in parsed) {
      return respond({ error: parsed.error }, { status: 400 });
    }
    points = parsed.points;
  } else if (request.method === 'GET') {
    const coords = new URL(request.url).searchParams.get('coords') ?? '';
    const parsed = parseCoordsQuery(coords);
    if ('error' in parsed) {
      return respond({ error: parsed.error }, { status: 400 });
    }
    points = parsed.points;
  } else {
    return respond({ error: 'method not allowed' }, { status: 405, headers: { allow: 'GET, POST' } });
  }

  try {
    const results = await fetchCurrentWeatherBatch(points, { timezone });
    return respond({
      count: results.length,
      generated_at: new Date().toISOString(),
      points: results,
    }, { cache: BATCH_CACHE });
  } catch (error) {
    return respondError(error, {
      scope: 'api/v1/weather/batch',
      status: 502,
      fallback: 'Weather lookup failed',
    });
  }
}
