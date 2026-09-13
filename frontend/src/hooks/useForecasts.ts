/**
 * Forecast data hooks — TanStack Query wrappers around
 * `GET /api/v1/forecasts/bulk` (the weekly Kaggle pipeline's serving path).
 *
 * The API is refreshed daily from the Kaggle dataset. The client polls for
 * fresh data while keeping the static baseline available for offline use.
 * When the API is unreachable, callers fall
 * back to the static `ALL_64_DISTRICTS` baseline via `useLiveDistricts`.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';
import {
  applyForecastsToDistricts,
  buildForecastIndex,
  effectiveDistrictRows,
  isForecastHorizon,
  parseBulkResponse,
  type ForecastHorizon,
  type ForecastRow,
} from '../lib/forecasts';

/** Fetch + defensively parse the bulk forecast payload for one horizon. */
export function useForecasts(horizon: ForecastHorizon = '7_days') {
  return useQuery({
    queryKey: ['forecasts', 'bulk', horizon],
    queryFn: async (): Promise<ForecastRow[]> => {
      const res = await fetch(`/api/v1/forecasts/bulk?horizon=${encodeURIComponent(horizon)}&fresh=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Forecast API responded ${res.status}`);
      }
      return parseBulkResponse(await res.json());
    },
    // The dataset is updated daily. Poll in the background so an open map
    // receives the new ingestion without requiring a page reload.
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

export interface LiveDistricts {
  /** Static baseline overlaid with live forecast severity/hazard per district. */
  districts: typeof ALL_64_DISTRICTS;
  /** Lookup by normalized district name (for detail panels). */
  forecastByDistrict: Map<string, ForecastRow>;
  /** Number of districts carrying a live forecast (0 → pure static baseline). */
  liveCount: number;
  /** Latest prediction_date across matched rows. */
  predictionDate?: string;
  /** True when live data was fetched and at least one district matched. */
  isLive: boolean;
  /** Fetch in flight and no data yet (static baseline is already usable). */
  isPending: boolean;
}

/**
 * The one-stop district source for map/dashboard views: live forecast data
 * when available, static baseline otherwise — consumers never need to branch.
 */
export function useLiveDistricts(horizon: ForecastHorizon = '7_days'): LiveDistricts {
  const { data, isPending } = useForecasts(horizon);

  return useMemo(() => {
    const rows = data ?? [];
    const { districts, matched, predictionDate } = applyForecastsToDistricts(ALL_64_DISTRICTS, rows);
    return {
      districts,
      // Rolled up to districts when the rows are ADM3-shaped (ADR 0006 8d).
      forecastByDistrict: buildForecastIndex(effectiveDistrictRows(rows)),
      liveCount: matched,
      predictionDate,
      isLive: matched > 0,
      isPending: isPending && matched === 0,
    };
  }, [data, isPending]);
}

/** Re-exported for callers that need the type guard next to a horizon toggle. */
export { isForecastHorizon };
