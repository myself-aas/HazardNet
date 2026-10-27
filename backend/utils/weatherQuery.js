/**
 * The weather routes' **query contract**, in one place for all three runtimes.
 *
 * Phase 0 did this for upstream response shapes: `_normalisePoint` owns "object vs array"
 * and every caller shares it. The same bug class existed one layer up, in the query
 * language: the Node handlers, the Express router and the Pages Functions each re-parsed
 * `lat`/`lng` and the `coords` mini-language, so a client spelling a coordinate `lon=`
 * (as the verification matrix does) or separating points with `;` (as the matrix also
 * does) got a 400 from one runtime and a silently single-point answer from another.
 *
 * Live measurement on 2026-10-27 against `www.hazardnet.live`:
 *
 *   /api/v1/weather?lat=23.8&lon=90.4&mini=1
 *     → 400 {"error":"lat and lng query parameters are required (numeric)"}
 *   /api/v1/weather/batch?coords=23.8%2C90.4%3B22.3%2C91.8
 *     → 200 {"count":1,"points":[{"id":"91.8",…}]}   (the `;` was parsed as part of lng)
 *
 * This module is the single normaliser for those spellings. `lng` remains canonical (the
 * client in `frontend/src/lib/weather.ts` and the POST body both use it); `lon` is an
 * accepted alias. `|` remains the documented point separator; `;` is accepted too, because
 * it is what a URL-encoded operation runbook sends. Both are decoded by URLSearchParams
 * before they reach here (`%7C`, `%3B`).
 *
 * No dependencies, no node built-ins: bundled into Pages Functions as well as Node.
 */

export const POINT_QUERY_ERROR = 'lat and lng query parameters are required (numeric)';
export const COORDS_QUERY_ERROR = 'coords query must be lat,lng,id|lat,lng,id|...';
export const POINTS_BODY_ERROR = 'points array must contain {id,lat,lng} entries';

/** Works with `URLSearchParams` (edge), Express `req.query` and serverless `req.query`. */
function param(params, key) {
  if (!params) return undefined;
  if (typeof params.get === 'function') {
    const value = params.get(key);
    return value === null ? undefined : value;
  }
  return params[key];
}

/**
 * Parse the single-point query. Returns `{ lat, lng, forecast_days, timezone, mini }` or
 * `{ error: POINT_QUERY_ERROR }`. `lon` is used only when `lng` is absent or empty, so an
 * explicit blank `lng` cannot mask a valid `lon`, and a valid `lng` always wins.
 */
export function parsePointQuery(params) {
  const rawLng = param(params, 'lng');
  const candidateLng = rawLng === undefined || rawLng === null || rawLng === ''
    ? param(params, 'lon')
    : rawLng;
  const lat = parseFloat(param(params, 'lat'));
  const lng = parseFloat(candidateLng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return { error: POINT_QUERY_ERROR };

  const days = param(params, 'forecast_days');
  const forecast_days = days ? parseInt(days, 10) : undefined;
  const tz = param(params, 'timezone');
  const timezone = typeof tz === 'string' && tz ? tz : undefined;
  const miniParam = param(params, 'mini');
  return {
    lat,
    lng,
    forecast_days,
    timezone,
    mini: miniParam === '1' || miniParam === 'true',
  };
}

/**
 * Parse `?coords=lat,lng,id|lat,lng,id|…`. `;` is an accepted separator alongside `|`;
 * everything else (a comma inside a segment, an empty id, a non-numeric coordinate) keeps
 * the Node handler's original behaviour. Returns `{ points }` or `{ error }`.
 */
export function parseCoordsQuery(raw) {
  const text = typeof raw === 'string' ? raw : '';
  const points = text.split(/[|;]/).map((segment) => {
    const [lat, lng, ...rest] = segment.split(',');
    return { lat: parseFloat(lat), lng: parseFloat(lng), id: rest.join(',') || undefined };
  }).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (points.length === 0) return { error: COORDS_QUERY_ERROR };
  return { points };
}

/**
 * Parse a POST `{ points: [{id, lat, lng}, …] }` body. Only numeric coordinates are
 * accepted (an id may be a string), matching all three previous runtimes. Returns
 * `{ points }` or `{ error }`.
 */
export function parsePointsBody(list) {
  const raw = Array.isArray(list) ? list : [];
  const points = raw
    .filter((point) => point
      && typeof point.lat === 'number'
      && typeof (point.lng ?? point.lon) === 'number')
    .map((point) => {
      const lng = point.lng ?? point.lon;
      return { id: point.id ?? `${point.lat},${lng}`, lat: point.lat, lng };
    });
  if (points.length === 0) return { error: POINTS_BODY_ERROR };
  return { points };
}
