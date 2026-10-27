/**
 * `GET /api/v1/weather?lat=..&lng=..[&forecast_days=16&timezone=Asia/Dhaka][&mini=1]`
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
 * `_extractPoint`/`_addMeta` pair in `backend/utils/openMeteo.js` that the Node handler uses,
 * so a second client does not have to re-learn the shape and a normalisation change lands on
 * both runtimes at once.
 *
 * Query contract and cache header are the Node handler's
 * (`serverless/v1/weather.js`), deliberately: two runtimes answering different shapes for the
 * same URL is the drift this port exists to avoid, and `__tests__/pagesWeather.test.js` runs
 * both over the same upstream fixture.
 */

import { fetchWeather, fetchCurrentWeather } from '../../../backend/utils/openMeteo.js';

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

  const lat = parseFloat(params.get('lat') ?? '');
  const lng = parseFloat(params.get('lng') ?? '');
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return json({ error: 'lat and lng query parameters are required (numeric)' }, 400, 'no-store');
  }

  const forecastDaysParam = params.get('forecast_days');
  const forecast_days = forecastDaysParam ? parseInt(forecastDaysParam, 10) : undefined;
  const timezone = params.get('timezone') || undefined;
  const mini = params.get('mini') === '1' || params.get('mini') === 'true';

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
