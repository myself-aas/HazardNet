import React from 'react';
import { Thermometer, CloudRain, Wind, Loader2, AlertCircle } from 'lucide-react';
import { wmoCodeInfo } from '../lib/wmoWeatherCodes';
import { useWeather } from '../hooks/useWeather';

interface WeatherBadgeProps {
  lat: number;
  lng: number;
  /** Visual size */
  size?: 'sm' | 'md';
  /** Click handler (e.g. open detail panel) */
  onClick?: () => void;
  className?: string;
}

/**
 * Compact, single-line weather summary for any point.
 * Designed for embedding in district cards / list rows / map popups without
 * the full panel overhead. Auto-refresh is disabled (0 interval) because a
 * page with 64 of these would otherwise hammer the proxy; the backend
 * still serves cached values.
 */
export const WeatherBadge: React.FC<WeatherBadgeProps> = ({
  lat, lng, size = 'sm', onClick, className = '',
}) => {
  const { data, loading, error } = useWeather(lat, lng, {
    forecast_days: 1,
    refreshIntervalMs: 0,
  });

  const isSm = size === 'sm';
  const base = `inline-flex items-center gap-1.5 rounded-full font-medium tabular-nums ${
    isSm ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
  } ${onClick ? 'cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-900/30' : ''} ${className}`;

  if (loading && !data) {
    return (
      <span className={`${base} bg-slate-100 text-slate-400 dark:bg-slate-800`}>
        <Loader2 size={12} className="animate-spin" />
        <span>Weather…</span>
      </span>
    );
  }

  if (error || !data) {
    return (
      <span className={`${base} bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300`} title={error || 'Weather unavailable'}>
        <AlertCircle size={12} />
        <span>{isSm ? 'N/A' : 'Weather unavailable'}</span>
      </span>
    );
  }

  const cur = data.current;
  const info = wmoCodeInfo(cur.weather_code);
  const temp = Math.round(cur.temperature_2m);
  const windKmh = Math.round(cur.wind_speed_10m * 3.6);
  const precip = cur.precipitation;

  return (
    <span
      className={`${base} bg-sky-50 text-slate-700 dark:bg-sky-900/30 dark:text-sky-100`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <span aria-hidden>{info.emoji}</span>
      <span className="flex items-center gap-0.5">
        <Thermometer size={11} />{temp}°
      </span>
      {precip > 0.1 && (
        <span className="flex items-center gap-0.5 text-sky-600 dark:text-sky-300">
          <CloudRain size={11} />{precip.toFixed(1)}mm
        </span>
      )}
      {windKmh > 20 && (
        <span className="flex items-center gap-0.5">
          <Wind size={11} />{windKmh}
        </span>
      )}
    </span>
  );
};

export default WeatherBadge;
