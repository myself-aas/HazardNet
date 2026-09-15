import { useEffect, useRef, useState } from 'react';
import { fetchWeather, fetchCurrentWeather, type WeatherResponse } from '../lib/weather';

export interface UseWeatherState {
  data: WeatherResponse | null;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
}

export interface UseWeatherOptions {
  /** 1..16 — defaults to 16 (maximum). Pass 1 for current-only mini mode. */
  forecast_days?: number;
  /** IANA timezone — defaults to Asia/Dhaka */
  timezone?: string;
  /** Auto-refresh interval in ms; 0 disables. Default 15 min (matches backend cache). */
  refreshIntervalMs?: number;
  /** Don't fire until lat/lng are valid */
  enabled?: boolean;
}

/**
 * Fetch weather for a lat/lng with automatic refresh and abort-on-unmount.
 * Re-fires whenever lat or lng changes.
 *
 * For forecast_days=1 we use the /mini endpoint (current-only, small payload).
 */
export function useWeather(
  lat: number | null | undefined,
  lng: number | null | undefined,
  opts: UseWeatherOptions = {},
): UseWeatherState {
  const {
    forecast_days = 16,
    timezone = 'Asia/Dhaka',
    refreshIntervalMs = 15 * 60 * 1000,
    enabled = true,
  } = opts;

  const [state, setState] = useState<UseWeatherState>({
    data: null,
    loading: true,
    error: null,
    fetchedAt: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled || lat == null || lng == null ||
        !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setState((s) => ({ ...s, loading: false, data: null, error: null }));
      return;
    }

    let cancelled = false;

    const load = async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setState((s) => ({ ...s, loading: !s.data, error: null }));
      try {
        const fn = forecast_days <= 1 ? fetchCurrentWeather : fetchWeather;
        const data = await fn(lat, lng, { forecast_days, timezone, signal: ctrl.signal });
        if (cancelled) return;
        setState({ data, loading: false, error: null, fetchedAt: Date.now() });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('aborted')) return;
        setState((s) => ({ ...s, loading: false, error: msg }));
      }
    };

    load();

    if (refreshIntervalMs > 0) {
      timerRef.current = setInterval(load, refreshIntervalMs);
    }

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // Serialize lat/lng to fixed precision so tiny float wobbles don't refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat?.toFixed(2), lng?.toFixed(2), forecast_days, timezone, refreshIntervalMs, enabled]);

  return state;
}
