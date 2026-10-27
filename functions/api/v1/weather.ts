/**
 * `GET /api/v1/weather?lat=..&lng=..[&forecast_days=16&timezone=Asia/Dhaka][&mini=1]`
 * (`lon` is accepted as an alias for `lng`; `backend/utils/weatherQuery.js` owns that rule
 * for this route, the Node function and the Express router alike.)
 *
 * Current conditions and a 16-day forecast for one point, proxied from Open-Meteo (the
 * repository's only weather source). The client calls this from `frontend/src/lib/weather.ts`
 * for the district panels and the "near me" card, so until 2026-10-26 every one of those
 * requests took the 404 path and the panels rendered without weather.
 *
 * Why this is a proxy at all: Open-Meteo is a public, CORS-enabled, keyless API, so the
 * browser *could* call it directly — but then the user's coordinates, and the API's rate
 * limiting, would be the browser's problem, and the deployment would have no single place to
 * cache or to change source. The proxy is also where the payload is normalised — by the same
 * `_normalisePoint`/`_extractPoint`/`_addMeta` chain in `backend/utils/openMeteo.js` that the
 * Node handler uses, so a second client does not have to re-learn the shape and a normalisation
 * change lands on both runtimes at once. A single coordinate is an upstream object; a comma-
 * separated list is an upstream array — the normaliser owns that distinction, not this route.
 *
 * Query contract and cache header are the Node handler's
 * (`serverless/v1/weather.js`), deliberately: two runtimes answering different shapes for the
 * same URL is the drift this port exists to avoid, and `__tests__/pagesWeather.test.js` runs
 * both over the same upstream fixture.
 */

import { fetchWeather, fetchCurrentWeather } from '../../../backend/utils/openMeteo.js';
import { parsePointQuery } from '../../../backend/utils/weatherQuery.js';

interface PagesContext {
  request: Request;
}

function json(body: unknown, status: number, cacheControl: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
    },
  });
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const params = new URL(context.request.url).searchParams;
  // Phase 1: the query contract lives in `backend/utils/weatherQuery.js` with the Node
  // handlers. `lng` is canonical, `lon` is accepted; a shape fix must not fork per runtime.
  const parsed = parsePointQuery(params);
  if ('error' in parsed) {
    return json({ error: parsed.error }, 400, 'no-store');
  }
  const { lat, lng, forecast_days, timezone, mini } = parsed;

  try {
    const data = mini
      ? await fetchCurrentWeather(lat, lng, { timezone })
      : await fetchWeather(lat, lng, { forecast_days, timezone });
    // 15 minutes, as on the Node runtime: Open-Meteo updates hourly, and this keeps a busy
    // district panel from turning one page view into one upstream call.
    return json(data, 200, 'public, max-age=900');
  } catch (error) {
    console.error('[weather] lookup failed:', error instanceof Error ? error.message : error);
    // 502 rather than 500: the failure is upstream's, and the distinction is what tells an
    // operator to check Open-Meteo rather than this deployment.
    return json({ error: 'Weather lookup failed' }, 502, 'no-store');
  }
}
