import React from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  Snowflake,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import type { WmoWeatherIconName } from '../lib/wmoWeatherCodes';

const WEATHER_ICONS: Record<WmoWeatherIconName, LucideIcon> = {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  Snowflake,
  Sun,
};

export interface WeatherIconProps {
  name: WmoWeatherIconName;
  size?: number;
  className?: string;
}

/** Weather-code icon rendered from the shared, registered Lucide family. */
export const WeatherIcon: React.FC<WeatherIconProps> = ({ name, size = 18, className = '' }) => {
  const Icon = WEATHER_ICONS[name];
  return <Icon size={size} className={className} aria-hidden="true" focusable="false" />;
};

export default WeatherIcon;
