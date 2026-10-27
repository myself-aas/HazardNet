/* Provenance — required by __tests__/testQuality.test.js; do not remove.
 * # Captured from https://api.open-meteo.com/v1/forecast?latitude=23.8103,22.3569&longitude=90.4125,91.7832&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover&timezone=Asia%2FDhaka&forecast_days=1&wind_speed_unit=ms&temperature_unit=celsius&precipitation_unit=mm&timeformat=iso8601&past_days=0 on 2026-10-27 by Arena Agent Mode for myself-aas.
 * # Shape: array — multi coordinate (`latitude=23.8103%2C22.3569&longitude=90.4125%2C91.7832`), one complete object per location.
 * # To refresh: node scripts/capture_open_meteo_fixtures.mjs (writes this file and openMeteoSingleObject.js with a fresh provenance stamp).
 *
 * The bytes below are the parsed upstream response, verbatim — including `location_id: 1`
 * on the second element, which only exists in the multi-location form. Dhaka's
 * `current.temperature_2m` is 31.1 and Chattogram's is 27.8; tests assert both leaves.
 * Note there is NO array-per-variable here: that "nested form" was never an Open-Meteo
 * response shape, only a comment in this repository's old normaliser.
 */
module.exports = [
  {
    latitude: 23.796133,
    longitude: 90.38055,
    generationtime_ms: 0.13625621795654297,
    utc_offset_seconds: 21600,
    timezone: 'Asia/Dhaka',
    timezone_abbreviation: 'GMT+6',
    elevation: 19.0,
    current_units: {
      time: 'iso8601',
      interval: 'seconds',
      temperature_2m: '°C',
      relative_humidity_2m: '%',
      apparent_temperature: '°C',
      is_day: '',
      precipitation: 'mm',
      weather_code: 'wmo code',
      wind_speed_10m: 'm/s',
      wind_direction_10m: '°',
      wind_gusts_10m: 'm/s',
      cloud_cover: '%',
    },
    current: {
      time: '2026-10-27T22:30',
      interval: 900,
      temperature_2m: 31.1,
      relative_humidity_2m: 62,
      apparent_temperature: 36.2,
      is_day: 0,
      precipitation: 0.00,
      weather_code: 0,
      wind_speed_10m: 0.81,
      wind_direction_10m: 173,
      wind_gusts_10m: 2.40,
      cloud_cover: 0,
    },
  },
  {
    latitude: 22.390158,
    longitude: 91.77019,
    generationtime_ms: 0.45430660247802734,
    utc_offset_seconds: 21600,
    timezone: 'Asia/Dhaka',
    timezone_abbreviation: 'GMT+6',
    elevation: 9.0,
    location_id: 1,
    current_units: {
      time: 'iso8601',
      interval: 'seconds',
      temperature_2m: '°C',
      relative_humidity_2m: '%',
      apparent_temperature: '°C',
      is_day: '',
      precipitation: 'mm',
      weather_code: 'wmo code',
      wind_speed_10m: 'm/s',
      wind_direction_10m: '°',
      wind_gusts_10m: 'm/s',
      cloud_cover: '%',
    },
    current: {
      time: '2026-10-27T22:30',
      interval: 900,
      temperature_2m: 27.8,
      relative_humidity_2m: 84,
      apparent_temperature: 33.6,
      is_day: 0,
      precipitation: 0.00,
      weather_code: 0,
      wind_speed_10m: 1.41,
      wind_direction_10m: 153,
      wind_gusts_10m: 3.70,
      cloud_cover: 6,
    },
  },
];
