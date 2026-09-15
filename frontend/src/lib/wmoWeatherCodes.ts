/**
 * WMO Weather interpretation codes (WW) — maps the integer `weather_code`
 * returned by Open-Meteo to a human-readable label + icon name.
 *
 * Reference: https://open-meteo.com/en/docs (WMO Weather interpretation codes)
 */

export interface WmoCodeInfo {
  code: number;
  label: string;
  /** Short emoji/glyph for compact displays */
  emoji: string;
  /** Lucide icon name hint for <MaterialIcon name={...} /> */
  icon: 'sun' | 'cloud-sun' | 'cloud' | 'cloud-fog' | 'cloud-drizzle' |
        'cloud-rain' | 'cloud-snow' | 'cloud-hail' | 'cloud-lightning' |
        'wind' | 'snowflake' | 'cloud-rain-wind';
  /** Day vs. night variant (used by the caller to swap sun/moon). */
  dayVariant?: boolean;
}

const WMO_CODES: Record<number, Omit<WmoCodeInfo, 'code'>> = {
  0:  { label: 'Clear sky',                          emoji: '☀️',  icon: 'sun' },
  1:  { label: 'Mainly clear',                       emoji: '🌤️', icon: 'cloud-sun' },
  2:  { label: 'Partly cloudy',                      emoji: '⛅',  icon: 'cloud-sun' },
  3:  { label: 'Overcast',                           emoji: '☁️',  icon: 'cloud' },
  45: { label: 'Fog',                                emoji: '🌫️', icon: 'cloud-fog' },
  48: { label: 'Depositing rime fog',                emoji: '🌫️', icon: 'cloud-fog' },
  51: { label: 'Light drizzle',                      emoji: '🌦️', icon: 'cloud-drizzle' },
  53: { label: 'Moderate drizzle',                   emoji: '🌦️', icon: 'cloud-drizzle' },
  55: { label: 'Dense drizzle',                      emoji: '🌧️', icon: 'cloud-drizzle' },
  56: { label: 'Light freezing drizzle',             emoji: '🌧️', icon: 'cloud-hail' },
  57: { label: 'Dense freezing drizzle',             emoji: '🌧️', icon: 'cloud-hail' },
  61: { label: 'Slight rain',                        emoji: '🌦️', icon: 'cloud-rain' },
  63: { label: 'Moderate rain',                      emoji: '🌧️', icon: 'cloud-rain' },
  65: { label: 'Heavy rain',                         emoji: '🌧️', icon: 'cloud-rain' },
  66: { label: 'Light freezing rain',                emoji: '🌧️', icon: 'cloud-hail' },
  67: { label: 'Heavy freezing rain',                emoji: '🌧️', icon: 'cloud-hail' },
  71: { label: 'Slight snowfall',                    emoji: '🌨️', icon: 'cloud-snow' },
  73: { label: 'Moderate snowfall',                  emoji: '🌨️', icon: 'cloud-snow' },
  75: { label: 'Heavy snowfall',                     emoji: '❄️', icon: 'cloud-snow' },
  77: { label: 'Snow grains',                        emoji: '❄️', icon: 'snowflake' },
  80: { label: 'Slight rain showers',                emoji: '🌦️', icon: 'cloud-rain' },
  81: { label: 'Moderate rain showers',              emoji: '🌧️', icon: 'cloud-rain' },
  82: { label: 'Violent rain showers',               emoji: '⛈️', icon: 'cloud-rain-wind' },
  85: { label: 'Slight snow showers',                emoji: '🌨️', icon: 'cloud-snow' },
  86: { label: 'Heavy snow showers',                 emoji: '❄️', icon: 'cloud-snow' },
  95: { label: 'Thunderstorm',                       emoji: '⛈️', icon: 'cloud-lightning' },
  96: { label: 'Thunderstorm with slight hail',      emoji: '⛈️', icon: 'cloud-lightning' },
  99: { label: 'Thunderstorm with heavy hail',       emoji: '⛈️', icon: 'cloud-lightning' },
};

export function wmoCodeInfo(code: number | null | undefined): WmoCodeInfo {
  if (code == null || !WMO_CODES[code]) {
    return { code: code ?? -1, label: 'Unknown', emoji: '❓', icon: 'cloud' };
  }
  return { code, ...WMO_CODES[code] };
}

/** A short one-line summary like "Heavy rain, 24°C". */
export function weatherSummary(code: number | null | undefined, tempC: number | null | undefined): string {
  const info = wmoCodeInfo(code);
  if (tempC == null || !Number.isFinite(tempC)) return info.label;
  return `${info.label}, ${Math.round(tempC)}°C`;
}
