import type { IconName } from '@hazardnet/design-system';

/**
 * WMO Weather interpretation codes (WW) — maps the integer `weather_code`
 * returned by Open-Meteo to a human-readable label and registered Lucide icon.
 *
 * Reference: https://open-meteo.com/en/docs (WMO Weather interpretation codes)
 */

export type WmoWeatherIconName = Extract<
  IconName,
  | 'Cloud'
  | 'CloudDrizzle'
  | 'CloudFog'
  | 'CloudHail'
  | 'CloudLightning'
  | 'CloudRain'
  | 'CloudRainWind'
  | 'CloudSnow'
  | 'CloudSun'
  | 'Snowflake'
  | 'Sun'
>;

export interface WmoCodeInfo {
  code: number;
  label: string;
  icon: WmoWeatherIconName;
}

const WMO_CODES: Record<number, Omit<WmoCodeInfo, 'code'>> = {
  0: { label: 'Clear sky', icon: 'Sun' },
  1: { label: 'Mainly clear', icon: 'CloudSun' },
  2: { label: 'Partly cloudy', icon: 'CloudSun' },
  3: { label: 'Overcast', icon: 'Cloud' },
  45: { label: 'Fog', icon: 'CloudFog' },
  48: { label: 'Depositing rime fog', icon: 'CloudFog' },
  51: { label: 'Light drizzle', icon: 'CloudDrizzle' },
  53: { label: 'Moderate drizzle', icon: 'CloudDrizzle' },
  55: { label: 'Dense drizzle', icon: 'CloudDrizzle' },
  56: { label: 'Light freezing drizzle', icon: 'CloudHail' },
  57: { label: 'Dense freezing drizzle', icon: 'CloudHail' },
  61: { label: 'Slight rain', icon: 'CloudRain' },
  63: { label: 'Moderate rain', icon: 'CloudRain' },
  65: { label: 'Heavy rain', icon: 'CloudRain' },
  66: { label: 'Light freezing rain', icon: 'CloudHail' },
  67: { label: 'Heavy freezing rain', icon: 'CloudHail' },
  71: { label: 'Slight snowfall', icon: 'CloudSnow' },
  73: { label: 'Moderate snowfall', icon: 'CloudSnow' },
  75: { label: 'Heavy snowfall', icon: 'CloudSnow' },
  77: { label: 'Snow grains', icon: 'Snowflake' },
  80: { label: 'Slight rain showers', icon: 'CloudRain' },
  81: { label: 'Moderate rain showers', icon: 'CloudRain' },
  82: { label: 'Violent rain showers', icon: 'CloudRainWind' },
  85: { label: 'Slight snow showers', icon: 'CloudSnow' },
  86: { label: 'Heavy snow showers', icon: 'CloudSnow' },
  95: { label: 'Thunderstorm', icon: 'CloudLightning' },
  96: { label: 'Thunderstorm with slight hail', icon: 'CloudLightning' },
  99: { label: 'Thunderstorm with heavy hail', icon: 'CloudLightning' },
};

export function wmoCodeInfo(code: number | null | undefined): WmoCodeInfo {
  if (code == null || !WMO_CODES[code]) {
    return { code: code ?? -1, label: 'Unknown', icon: 'Cloud' };
  }
  return { code, ...WMO_CODES[code] };
}

/** A short one-line summary like "Heavy rain, 24°C". */
export function weatherSummary(code: number | null | undefined, tempC: number | null | undefined): string {
  const info = wmoCodeInfo(code);
  if (tempC == null || !Number.isFinite(tempC)) return info.label;
  return `${info.label}, ${Math.round(tempC)}°C`;
}
