/**
 * Forecast data hooks — TanStack Query wrappers around
 * `GET /api/v1/forecasts/bulk` (the Kaggle pipeline's serving path).
 *
 * Data cadence: the Kaggle notebooks run daily on Kaggle's own schedule, and
 * `daily_forecast.yml` pulls the forecast notebook's output
 * (`kaggle kernels output ashifahmedshuvo/hazardnet-auto-forecast-pipeline`)
 * into the forecast store and into the committed static snapshot at 00:00 UTC.
 * The client still polls, so an open map picks up a re-run or a dispatched pull
 * without a page reload. When the API is unreachable, the hook falls back to the
 * committed snapshot (/data/forecasts-latest.json); when that is also
 * unavailable, callers degrade to the static `ALL_64_DISTRICTS` baseline via
 * `useLiveDistricts`.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';
import {
  applyForecastsToDistricts,
  buildForecastIndex,
  effectiveDistrictRows,
  fetchStaticForecastSnapshot,
  isForecastHorizon,
  parseBulkResponse,
  type ForecastHorizon,
  type ForecastRow,
} from '../lib/forecasts';

/**
 * Fetch + defensively parse the bulk forecast payload for one horizon.
 * Falls back to the committed snapshot when the API is unreachable,
 * and throws only when both sources fail (so TanStack Query reports an
 * error and the static baseline remains in use).
 */
export async function loadForecasts(horizon: ForecastHorizon): Promise<ForecastRow[]> {
  try {
    const res = await fetch(`/api/v1/forecasts/bulk?horizon=${encodeURIComponent(horizon)}&fresh=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Forecast API responded ${res.status}`);
    }
    const rows = parseBulkResponse(await res.json());
    if (rows.length > 0) return rows;
  } catch {
    // fall through to the committed snapshot
  }
  const snapshotRows = await fetchStaticForecastSnapshot(horizon);
  if (snapshotRows.length > 0) return snapshotRows;
  throw new Error('Forecast API and committed snapshot are both unavailable');
}

/** Fetch + defensively parse the bulk forecast payload for one horizon. */
export function useForecasts(horizon: ForecastHorizon = '7_days') {
  return useQuery({
    queryKey: ['forecasts', 'bulk', horizon],
    queryFn: () => loadForecasts(horizon),
    // The dataset is refreshed daily by the Kaggle pull (and whenever that
    // workflow is dispatched by hand). Poll in the background so an open map
    // receives a new ingestion without requiring a page reload.
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
