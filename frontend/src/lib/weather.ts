/**
 * Open-Meteo weather API client — typed wrapper over the backend proxy
 * at GET /api/v1/weather?lat=..&lng=..
 *
 * The backend returns the full Open-Meteo response (current + hourly + daily)
 * with an added _meta key. Variable lists match backend/utils/openMeteo.js,
 * which pulls every current, hourly, and daily variable documented at
 * https://open-meteo.com/en/docs (forecast_days=16) — including all 19 pressure
 * levels from 1000 hPa down to 30 hPa.
 */

export interface WeatherMeta {
  source: 'open-meteo';
  license: string;
  cached_at: string;
  lat: number;
  lng: number;
  current_vars: number;
  hourly_vars: number;
  daily_vars: number;
  pressure_levels: number[];
  forecast_days: number;
  timezone: string;
}

export interface WeatherUnits {
  [key: string]: string | undefined;
}

/**
 * Index signature allows pressure-level variables (e.g. temperature_850hPa,
 * wind_speed_500hPa) and other document-backed fields without enumerating all
 * 200+ keys. The explicitly-named fields below are the ones the UI relies on;
 * everything else comes through as `number | string | undefined`.
 */
export interface CurrentWeather {
  time: string;
  interval?: number;
  temperature_2m: number;
  relative_humidity_2m: number;
  apparent_temperature: number;
  is_day: number;
  precipitation: number;
  rain: number;
  showers: number;
  snowfall: number;
  weather_code: number;
  cloud_cover: number;
  cloud_cover_low?: number;
  cloud_cover_mid?: number;
  cloud_cover_high?: number;
  pressure_msl: number;
  surface_pressure?: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  wind_gusts_10m: number;
  dew_point_2m?: number;
  evapotranspiration?: number;
  visibility?: number;
  soil_temperature_0cm?: number;
  soil_temperature_6cm?: number;
  soil_temperature_18cm?: number;
  soil_temperature_54cm?: number;
  soil_moisture_0_to_1cm?: number;
  soil_moisture_1_to_3cm?: number;
  soil_moisture_3_to_9cm?: number;
  soil_moisture_9_to_27cm?: number;
  soil_moisture_27_to_81cm?: number;
  [key: string]: number | string | undefined;
}

export interface HourlyWeather {
  time: string[];
  temperature_2m: number[];
  relative_humidity_2m: number[];
  apparent_temperature: number[];
  precipitation: number[];
  precipitation_probability?: number[];
  rain: number[];
  showers: number[];
  snowfall: number[];
  weather_code: number[];
  cloud_cover: number[];
  pressure_msl: number[];
  surface_pressure?: number[];
  wind_speed_10m: number[];
  wind_speed_80m?: number[];
  wind_speed_120m?: number[];
  wind_speed_180m?: number[];
  wind_direction_10m: number[];
  wind_gusts_10m: number[];
  dew_point_2m?: number[];
  visibility?: number[];
  evapotranspiration?: number[];
  et0_fao_evapotranspiration?: number[];
  uv_index?: number[];
  uv_index_clear_sky?: number[];
  is_day?: number[];
  cape?: number[];
  convective_inhibition?: number[];
  freezing_level_height?: number[];
  lightning_potential?: number[];
  shortwave_radiation?: number[];
  direct_radiation?: number[];
  diffuse_radiation?: number[];
  direct_normal_irradiance?: number[];
  global_tilted_irradiance?: number[];
  terrestrial_radiation?: number[];
  terrestrial_radiation_instant?: number[];
  vapour_pressure_deficit?: number[];
  wet_bulb_temperature_2m?: number[];
  snow_depth?: number[];
  snowfall_height?: number[];
  soil_temperature_0cm?: number[];
  soil_moisture_0_to_1cm?: number[];
  zero_degree_level?: number[];
  total_cloud_cover?: number[];
  sunshine_duration?: number[];
  // Pressure-level variables (19 levels × 7 vars): temperature_<L>hPa, etc.
  [key: string]: number[] | string[] | undefined;
}

export interface DailyWeather {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  temperature_2m_mean?: number[];
  apparent_temperature_max?: number[];
  apparent_temperature_min?: number[];
  apparent_temperature_mean?: number[];
  sunrise: string[];
  sunset: string[];
  daylight_duration?: number[];
  sunshine_duration?: number[];
  uv_index_max?: number[];
  uv_index_clear_sky_max?: number[];
  precipitation_sum: number[];
  precipitation_hours?: number[];
  precipitation_probability_max?: number[];
  precipitation_probability_mean?: number[];
  precipitation_probability_min?: number[];
  rain_sum?: number[];
  showers_sum?: number[];
  snowfall_sum?: number[];
  wind_speed_10m_max?: number[];
  wind_gusts_10m_max?: number[];
  wind_direction_10m_dominant?: number[];
  shortwave_radiation_sum?: number[];
  et0_fao_evapotranspiration?: number[];
  [key: string]: number[] | string[] | undefined;
}

export interface WeatherResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  current_units?: WeatherUnits;
  hourly_units?: WeatherUnits;
  daily_units?: WeatherUnits;
  current: CurrentWeather;
  hourly: HourlyWeather;
  daily: DailyWeather;
  _meta: WeatherMeta;
}

export interface CurrentWeatherPoint {
  id?: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  timezone?: string;
  current: CurrentWeather;
  _meta: WeatherMeta;
}

export interface BatchWeatherResponse {
  count: number;
  generated_at: string;
  points: CurrentWeatherPoint[];
}

/**
 * Fetch the full forecast (current + hourly + 16-day daily) for a single point.
 * Mirrors the backend default (forecast_days=16, hourly + daily + current).
 */
export async function fetchWeather(
  lat: number,
  lng: number,
  opts: { forecast_days?: number; timezone?: string; signal?: AbortSignal } = {},
): Promise<WeatherResponse> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  });
  if (opts.forecast_days && opts.forecast_days > 1) {
    params.set('forecast_days', String(Math.min(Math.max(opts.forecast_days, 1), 16)));
  }
  if (opts.timezone) params.set('timezone', opts.timezone);
  const resp = await fetch(`/api/v1/weather?${params.toString()}`, {
    signal: opts.signal,
    cache: 'no-store',
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Weather API error ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json() as Promise<WeatherResponse>;
}

/**
 * Fetch current-only weather for a single point (mini badge).
 */
export async function fetchCurrentWeather(
  lat: number,
  lng: number,
  opts: { timezone?: string; signal?: AbortSignal } = {},
): Promise<WeatherResponse> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    mini: '1',
  });
  if (opts.timezone) params.set('timezone', opts.timezone);
  const resp = await fetch(`/api/v1/weather?${params.toString()}`, {
    signal: opts.signal,
    cache: 'no-store',
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Weather API error ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json() as Promise<WeatherResponse>;
}

/**
 * Fetch current-only weather for many points in one round-trip.
 * Points: array of {id, lat, lng}. The `id` is echoed back in results.
 */
export async function fetchCurrentWeatherBatch(
  points: ReadonlyArray<{ id: string; lat: number; lng: number }>,
  opts: { timezone?: string; signal?: AbortSignal } = {},
): Promise<BatchWeatherResponse> {
  const resp = await fetch('/api/v1/weather/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points, timezone: opts.timezone || 'Asia/Dhaka' }),
    signal: opts.signal,
    cache: 'no-store',
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Weather batch API error ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json() as Promise<BatchWeatherResponse>;
}

/** Cardinal-direction label for a wind bearing (0=N, 90=E, ...). */
export function windDirectionLabel(deg: number): string {
  if (!Number.isFinite(deg)) return '—';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(((deg % 360) / 22.5)) % 16];
}
