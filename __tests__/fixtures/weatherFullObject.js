/* Provenance — required by __tests__/testQuality.test.js; do not remove.
 * # Captured from https://api.open-meteo.com/v1/forecast?latitude=23.8103&longitude=90.4125&current=temperature_2m,relative_humidity_2m,apparent_temperature&hourly=temperature_2m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FDhaka&forecast_days=2&wind_speed_unit=ms&temperature_unit=celsius&precipitation_unit=mm&timeformat=iso8601&past_days=0 on 2026-10-27 by `node scripts/capture_edge_fixtures.mjs`.
 * # Shape: object — single coordinate with current + hourly + daily arrays (the full forecast shape).
 * # To refresh: node scripts/capture_edge_fixtures.mjs --live (needs outbound access to api.open-meteo.com).
 *
 * Hourly series trimmed to the first 4 timesteps (embedded capture); every retained value is real.
 * Leaf assertions use current.temperature_2m 30.5 and daily.temperature_2m_max[0] 36.7 when the embedded capture is in use.
 */
module.exports = {
  "latitude": 23.796133,
  "longitude": 90.38055,
  "generationtime_ms": 0.12624263763427734,
  "utc_offset_seconds": 21600,
  "timezone": "Asia/Dhaka",
  "timezone_abbreviation": "GMT+6",
  "elevation": 19,
  "current_units": {
    "time": "iso8601",
    "interval": "seconds",
    "temperature_2m": "°C",
    "relative_humidity_2m": "%",
    "apparent_temperature": "°C"
  },
  "current": {
    "time": "2026-10-27T23:30",
    "interval": 900,
    "temperature_2m": 30.5,
    "relative_humidity_2m": 65,
    "apparent_temperature": 35.7
  },
  "hourly_units": {
    "time": "iso8601",
    "temperature_2m": "°C",
    "relative_humidity_2m": "%"
  },
  "hourly": {
    "time": [
      "2026-10-27T00:00",
      "2026-10-27T01:00",
      "2026-10-27T02:00",
      "2026-10-27T03:00"
    ],
    "temperature_2m": [
      31.3,
      30.1,
      29.4,
      28.8
    ],
    "relative_humidity_2m": [
      58,
      64,
      67,
      70
    ]
  },
  "daily_units": {
    "time": "iso8601",
    "temperature_2m_max": "°C",
    "temperature_2m_min": "°C",
    "precipitation_sum": "mm"
  },
  "daily": {
    "time": [
      "2026-10-27",
      "2026-10-28"
    ],
    "temperature_2m_max": [
      36.7,
      34.5
    ],
    "temperature_2m_min": [
      27.9,
      25.6
    ],
    "precipitation_sum": [
      0.2,
      6.1
    ]
  }
};
