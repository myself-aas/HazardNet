/**
 * Open-Meteo client with in-memory TTL cache.
 *
 * Why a backend proxy?
 *  - Avoids CORS headaches and keeps third-party origin out of the client CSP.
 *  - Caches responses (Open-Meteo is free but rate-limited; hourly data changes
 *    once per hour, daily once per day, current every ~15 min).
 *  - Single place to pin the variable set (current / hourly / daily) so the
 *    client always gets a known shape.
 *  - Batch endpoint supports 64 districts in one upstream call (Open-Meteo
 *    accepts comma-separated lat/lng lists) so the overview page doesn't fire
 *    64 separate HTTP requests on load.
 *
 * Entry points:
 *    fetchWeather(lat, lng)            → single-point 16-day bundle
 *    fetchCurrentWeather(lat, lng)     → single-point current-only (mini)
 *    fetchCurrentWeatherBatch(coords)  → N-point current-only (one upstream call)
 *    clearCache()                      → tests / admin
 *
 * Variable reference: https://open-meteo.com/en/docs (forecast_days=16)
 */

async function __getFetch() {
  if (globalThis.fetch) return globalThis.fetch;
  try {
    const mod = await import('node-fetch');
    return mod.default;
  } catch {
    throw new Error('No fetch implementation available (Node >=18 or node-fetch required)');
  }
}

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

// ── Pressure levels (19 levels, 1000 hPa → 30 hPa) ────────────────────────
const PRESSURE_LEVELS = [
  1000, 975, 950, 925, 900, 850, 800, 700, 600,
  500, 400, 300, 250, 200, 150, 100, 70, 50, 30,
];
const expandPressure = (prefix) => PRESSURE_LEVELS.map((lvl) => `${prefix}_${lvl}hPa`);

// ── Variable catalogs ──────────────────────────────────────────────────────
// Subset for badges across all 64 districts (tiny payload).
const CURRENT_VARS_MINI = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'cloud_cover',
];

// Full current-conditions set for the detail panel.
const CURRENT_VARS_ALL = [
  'apparent_temperature',
  'cloud_cover',
  'cloud_cover_high',
  'cloud_cover_low',
  'cloud_cover_mid',
  'dew_point_2m',
  'evapotranspiration',
  'is_day',
  'precipitation',
  'pressure_msl',
  'rain',
  'relative_humidity_2m',
  'showers',
  'snowfall',
  'surface_pressure',
  'temperature_2m',
  'weather_code',
  'wind_direction_10m',
  'wind_gusts_10m',
  'wind_speed_10m',
  'soil_moisture_0_to_1cm',
  'soil_moisture_1_to_3cm',
  'soil_moisture_3_to_9cm',
  'soil_moisture_9_to_27cm',
  'soil_moisture_27_to_81cm',
  'soil_temperature_0cm',
  'soil_temperature_6cm',
  'soil_temperature_18cm',
  'soil_temperature_54cm',
];

// Full hourly set (surface + 133 pressure-level fields = 191 total).
const HOURLY_VARS = [
  'apparent_temperature',
  'cape',
  'cloud_cover',
  'cloud_cover_high',
  'cloud_cover_low',
  'cloud_cover_mid',
  'convective_inhibition',
  'dew_point_2m',
  'diffuse_radiation',
  'direct_normal_irradiance',
  'direct_radiation',
  'et0_fao_evapotranspiration',
  'evapotranspiration',
  'freezing_level_height',
  'global_tilted_irradiance',
  'is_day',
  'lightning_potential',
  'precipitation',
  'precipitation_probability',
  'pressure_msl',
  'rain',
  'relative_humidity_2m',
  'shortwave_radiation',
  'showers',
  'snow_depth',
  'snowfall',
  'snowfall_height',
  'soil_moisture_0_to_1cm',
  'soil_moisture_1_to_3cm',
  'soil_moisture_3_to_9cm',
  'soil_moisture_9_to_27cm',
  'soil_moisture_27_to_81cm',
  'soil_temperature_0cm',
  'soil_temperature_6cm',
  'soil_temperature_18cm',
  'soil_temperature_54cm',
  'sunshine_duration',
  'surface_pressure',
  'temperature_2m',
  'terrestrial_radiation',
  'terrestrial_radiation_instant',
  'total_cloud_cover',
  'uv_index',
  'uv_index_clear_sky',
  'vapour_pressure_deficit',
  'visibility',
  'weather_code',
  'wet_bulb_temperature_2m',
  'wind_direction_10m',
  'wind_direction_80m',
  'wind_direction_120m',
  'wind_direction_180m',
  'wind_gusts_10m',
  'wind_speed_10m',
  'wind_speed_80m',
  'wind_speed_120m',
  'wind_speed_180m',
  'zero_degree_level',
  ...expandPressure('temperature'),
  ...expandPressure('relative_humidity'),
  ...expandPressure('dew_point'),
  ...expandPressure('cloud_cover'),
  ...expandPressure('wind_speed'),
  ...expandPressure('wind_direction'),
  ...expandPressure('geopotential_height'),
];

// Full daily aggregation set (26 fields).
const DAILY_VARS = [
  'apparent_temperature_max',
  'apparent_temperature_mean',
  'apparent_temperature_min',
  'daylight_duration',
  'et0_fao_evapotranspiration',
  'precipitation_hours',
  'precipitation_probability_max',
  'precipitation_probability_mean',
  'precipitation_probability_min',
  'precipitation_sum',
  'rain_sum',
  'shortwave_radiation_sum',
  'showers_sum',
  'snowfall_sum',
  'sunrise',
  'sunset',
  'sunshine_duration',
  'temperature_2m_max',
  'temperature_2m_mean',
  'temperature_2m_min',
  'uv_index_clear_sky_max',
  'uv_index_max',
  'weather_code',
  'wind_direction_10m_dominant',
  'wind_gusts_10m_max',
  'wind_speed_10m_max',
];

// ── Cache ──────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map();
const cacheKey = (lat, lng) => `${lat.toFixed(2)},${lng.toFixed(2)}`;
export function clearCache() { cache.clear(); }

// ── Internal helpers ───────────────────────────────────────────────────────
async function _fetchUpstream(params) {
  const fetchImpl = await __getFetch();
  const url = `${OPEN_METEO_BASE}?${params.toString()}`;
  const resp = await fetchImpl(url, {
    headers: { 'User-Agent': 'HazardNet/1.0 (weather-proxy; +https://hazardnet.live)' },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    const err = new Error(`Open-Meteo upstream HTTP ${resp.status}: ${body.slice(0, 200)}`);
    err.status = 502;
    throw err;
  }
  return resp.json();
}

function _baseParams({ timezone, forecast_days, windSpeedUnit = 'ms' }) {
  return {
    timezone,
    forecast_days: String(forecast_days),
    wind_speed_unit: windSpeedUnit,
    temperature_unit: 'celsius',
    precipitation_unit: 'mm',
    timeformat: 'iso8601',
    past_days: '0',
  };
}

/**
 * Extract point `i` from an Open-Meteo response (handles both single-point
 * flat responses and multi-point array responses uniformly).
 *
 * Multi-point shape (N locations):
 *   latitude: [lat0, lat1, ...]
 *   current.temperature_2m: [v0, v1, ...]
 *   hourly.temperature_2m: [[t0...], [t1...], ...]
 *   daily.temperature_2m_max: [[d0...], [d1...], ...]
 *
 * Single-point shape:
 *   latitude: lat0
 *   current.temperature_2m: v0
 *   hourly.temperature_2m: [t0...]
 *   daily.temperature_2m_max: [d0...]
 */
function _extractPoint(raw, i) {
  const scalar = (key) => {
    const v = raw[key];
    if (v == null) return undefined;
    return Array.isArray(v) ? v[i] : v;
  };
  const pickSub = (block) => {
    if (!block) return undefined;
    const out = {};
    for (const [k, v] of Object.entries(block)) {
      if (v == null) { out[k] = undefined; continue; }
      if (Array.isArray(v)) {
        // Nested → multi-point time series: v[i] is the array for point i
        if (Array.isArray(v[0])) { out[k] = v[i]; }
        // Flat + i=0 → single-point series (return as-is)
        else if (i === 0) { out[k] = v; }
        // Flat + i>0 → scalar-per-point (current-block for multi-point)
        else { out[k] = v[i]; }
      } else {
        out[k] = v;
      }
    }
    return out;
  };

  return {
    latitude: scalar('latitude'),
    longitude: scalar('longitude'),
    generationtime_ms: raw.generationtime_ms,
    utc_offset_seconds: scalar('utc_offset_seconds'),
    timezone: scalar('timezone'),
    timezone_abbreviation: scalar('timezone_abbreviation'),
    elevation: scalar('elevation'),
    current_units: raw.current_units,
    hourly_units: raw.hourly_units,
    daily_units: raw.daily_units,
    current: pickSub(raw.current),
    hourly: pickSub(raw.hourly),
    daily: pickSub(raw.daily),
  };
}

function _addMeta(point, forecast_days, timezone) {
  point._meta = {
    source: 'open-meteo',
    license: 'CC-BY 4.0 (https://open-meteo.com/license)',
    cached_at: new Date().toISOString(),
    lat: point.latitude,
    lng: point.longitude,
    current_vars: point.current ? Object.keys(point.current).length - 1 : 0,   // -1 for 'time'
    hourly_vars: point.hourly ? Object.keys(point.hourly).filter(k => k !== 'time').length : 0,
    daily_vars: point.daily ? Object.keys(point.daily).filter(k => k !== 'time').length : 0,
    pressure_levels: point.hourly ? PRESSURE_LEVELS : [],
    forecast_days,
    timezone,
  };
  return point;
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Single-point full 16-day forecast (current + hourly + daily). */
export async function fetchWeather(lat, lng, opts = {}) {
  const forecast_days = Math.min(16, Math.max(1, opts.forecast_days || 16));
  const timezone = opts.timezone || 'Asia/Dhaka';
  return _fetchSingle({ lat, lng, forecast_days, timezone,
                        skipCache: !!opts.skipCache, currentVars: CURRENT_VARS_ALL,
                        wantHourly: true, wantDaily: true });
}

/** Single-point current-only (mini) — used by individual badges when not batched. */
export async function fetchCurrentWeather(lat, lng, opts = {}) {
  return _fetchSingle({ lat, lng, forecast_days: 1, timezone: opts.timezone || 'Asia/Dhaka',
                        skipCache: !!opts.skipCache, currentVars: CURRENT_VARS_MINI,
                        wantHourly: false, wantDaily: false });
}

/**
 * Batch: current-only for many points in ONE upstream HTTP call. Open-Meteo
 * accepts comma-separated lat/lng lists, so one round-trip covers all 64
 * districts and we cache each point independently.
 *
 * @param coords Array of {id, lat, lng} — id is echoed back to the caller.
 * @returns Array of { id, ...weatherObject } in the same order as `coords`
 *          (missing/invalid points are dropped).
 */
export async function fetchCurrentWeatherBatch(coords, opts = {}) {
  const timezone = opts.timezone || 'Asia/Dhaka';
  if (!Array.isArray(coords) || coords.length === 0) return [];

  const validated = [];
  const seenKeys = new Set();
  for (const c of coords) {
    if (typeof c.lat !== 'number' || typeof c.lng !== 'number' ||
        Number.isNaN(c.lat) || Number.isNaN(c.lng)) continue;
    const k = cacheKey(c.lat, c.lng);
    if (seenKeys.has(k)) continue;
    seenKeys.add(k);
    validated.push(c);
  }

  const results = new Array(validated.length).fill(null);
  const toFetch = [];

  for (let i = 0; i < validated.length; i++) {
    const c = validated[i];
    const k = cacheKey(c.lat, c.lng);
    const hit = cache.get(k);
    if (!opts.skipCache && hit && Date.now() - hit.ts < CACHE_TTL_MS && hit.data.current) {
      results[i] = { id: c.id, ...hit.data };
    } else {
      toFetch.push({ idx: i, coord: c });
    }
  }

  if (toFetch.length > 0) {
    const BATCH = 100;    // Open-Meteo allows many coords per request
    for (let b = 0; b < toFetch.length; b += BATCH) {
      const slice = toFetch.slice(b, b + BATCH);
      const params = new URLSearchParams({
        latitude: slice.map(x => x.coord.lat.toFixed(4)).join(','),
        longitude: slice.map(x => x.coord.lng.toFixed(4)).join(','),
        current: CURRENT_VARS_MINI.join(','),
        ..._baseParams({ timezone, forecast_days: 1 }),
      });
      const raw = await _fetchUpstream(params);
      for (let j = 0; j < slice.length; j++) {
        const { idx, coord } = slice[j];
        const point = _addMeta(_extractPoint(raw, j), 1, timezone);
        cache.set(cacheKey(coord.lat, coord.lng), { ts: Date.now(), data: point });
        results[idx] = { id: coord.id, ...point };
      }
    }
  }

  return results.filter(Boolean);
}

async function _fetchSingle({ lat, lng, forecast_days, timezone, skipCache,
                              currentVars, wantHourly, wantDaily }) {
  if (typeof lat !== 'number' || typeof lng !== 'number' ||
      Number.isNaN(lat) || Number.isNaN(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    const err = new Error('Invalid lat/lng');
    err.status = 400;
    throw err;
  }
  const key = cacheKey(lat, lng);
  if (!skipCache) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      const h = hit.data;
      const fullEnough = (!wantHourly || h.hourly) && (!wantDaily || h.daily);
      if (fullEnough) return h;
    }
  }
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: currentVars.join(','),
    ..._baseParams({ timezone, forecast_days }),
  });
  if (wantHourly) params.set('hourly', HOURLY_VARS.join(','));
  if (wantDaily) params.set('daily', DAILY_VARS.join(','));

  const raw = await _fetchUpstream(params);
  const data = _addMeta(_extractPoint(raw, 0), forecast_days, timezone);
  cache.set(key, { ts: Date.now(), data });
  return data;
}

export { CURRENT_VARS_ALL as CURRENT_VARS, CURRENT_VARS_MINI, HOURLY_VARS, DAILY_VARS, PRESSURE_LEVELS };
