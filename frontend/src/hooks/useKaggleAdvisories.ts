/**
 * Advisory forecast rows from the Kaggle daily dataset (`/api/v1/kaggle[/advisories]`),
 * with automatic static-asset fallback to `/data/daily-advisories-v1.json` and
 * `/data/forecasts-latest.json` when running in static preview environments.
 */

import { useQuery } from '@tanstack/react-query';
import {
  fetchSnapshotMetadata,
  fetchStaticForecastSnapshot,
  forecastAgeHours,
  parseBulkResponse,
  type ForecastHorizon,
  type ForecastRow,
} from '../lib/forecasts';
import {
  loadNationalDailySnapshot,
  rollupDailyAdvisoriesToForecastRows,
} from '../lib/dailyAdvisories';

export type KaggleStatus = 'fresh' | 'stale' | 'unavailable';

export interface KaggleAdvisorySnapshot {
  status: KaggleStatus;
  dataset: string | null;
  file: string | null;
  fetchedAt: string | null;
  generatedAt: string | null;
  rows: ForecastRow[];
  lastError: { code: string; message: string; at: string } | null;
}

const DEFAULT_DATASET = 'ashifahmedshuvo/hazardnet-weekly-forecasts';
const DEFAULT_FILE = 'hazardnet_advisories_latest.csv';
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

async function fallbackFromStaticSnapshots(horizon: ForecastHorizon): Promise<KaggleAdvisorySnapshot | null> {
  const daily = await loadNationalDailySnapshot().catch(() => null);
  if (daily && daily.run && daily.advisories.length > 0) {
    const rows = rollupDailyAdvisoriesToForecastRows(daily.advisories, daily.run, horizon);
    if (rows.length > 0) {
      return {
        status: daily.status === 'fresh' ? 'fresh' : 'stale',
        dataset: DEFAULT_DATASET,
        file: DEFAULT_FILE,
        fetchedAt: daily.run.generatedAt,
        generatedAt: daily.run.generatedAt,
        rows,
        lastError: null,
      };
    }
  }

  const [staticRows, meta] = await Promise.all([
    fetchStaticForecastSnapshot(horizon),
    fetchSnapshotMetadata(),
  ]);
  if (staticRows.length > 0) {
    const genAt = meta.ingestionTimestamp || (meta.predictionDate ? `${meta.predictionDate}T00:00:00.000Z` : null);
    const stale = meta.predictionDate ? forecastAgeHours(meta.predictionDate) > 36 : true;
    return {
      status: stale ? 'stale' : 'fresh',
      dataset: DEFAULT_DATASET,
      file: DEFAULT_FILE,
      fetchedAt: genAt,
      generatedAt: genAt,
      rows: staticRows,
      lastError: null,
    };
  }
  return null;
}

export async function loadKaggleAdvisories(horizon: ForecastHorizon): Promise<KaggleAdvisorySnapshot> {
  let res = await fetch(`/api/v1/kaggle?horizon=${encodeURIComponent(horizon)}`, {
    cache: 'no-store',
  }).catch(() => null);
  if (!res || res.status === 404 || (res.headers.get('content-type') || '').includes('text/html')) {
    const fallback = await fetch(`/api/v1/kaggle/advisories?horizon=${encodeURIComponent(horizon)}`, {
      cache: 'no-store',
    }).catch(() => null);
    if (fallback && !(fallback.headers.get('content-type') || '').includes('text/html')) {
      res = fallback;
    } else {
      res = null;
    }
  }

  if (res) {
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (body && typeof body === 'object' && Array.isArray(body.data) && body.data.length > 0) {
      const status = body.status === 'fresh' || body.status === 'stale' || body.status === 'unavailable'
        ? body.status
        : 'unavailable';
      const lastErrorRaw = body.lastError as Record<string, unknown> | null | undefined;
      return {
        status,
        dataset: str(body.dataset),
        file: str(body.file),
        fetchedAt: str(body.fetchedAt),
        generatedAt: str(body.generatedAt),
        rows: parseBulkResponse({ forecasts: body.data }),
        lastError: lastErrorRaw && typeof lastErrorRaw === 'object'
          ? {
            code: str(lastErrorRaw.code) ?? 'UNKNOWN',
            message: str(lastErrorRaw.message) ?? 'Kaggle refresh failed',
            at: str(lastErrorRaw.at) ?? '',
          }
          : null,
      };
    }
  }

  const staticFallback = await fallbackFromStaticSnapshots(horizon);
  if (staticFallback) return staticFallback;

  if (!res) {
    throw new Error('Kaggle advisory endpoint could not be reached');
  }
  throw new Error(`Kaggle advisory endpoint responded ${res.status}`);
}

export function useKaggleAdvisories(horizon: ForecastHorizon = '7_days') {
  return useQuery({
    queryKey: ['kaggle', 'advisories', horizon],
    queryFn: () => loadKaggleAdvisories(horizon),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}
