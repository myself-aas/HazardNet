/**
 * Advisory forecast rows as last fetched from the Kaggle Dataset API by the backend
 * (`GET /api/v1/kaggle/advisories`). The browser never talks to Kaggle directly and holds
 * no Kaggle credentials.
 */

import { useQuery } from '@tanstack/react-query';
import { parseBulkResponse, type ForecastHorizon, type ForecastRow } from '../lib/forecasts';

export type KaggleStatus = 'fresh' | 'stale' | 'unavailable';

export interface KaggleAdvisorySnapshot {
  status: KaggleStatus;
  dataset: string | null;
  file: string | null;
  /** When the backend last fetched the file from Kaggle successfully (ISO 8601, UTC). */
  fetchedAt: string | null;
  /** The dataset's own `generated_at` for the run, normalised to ISO 8601 UTC by the backend. */
  generatedAt: string | null;
  rows: ForecastRow[];
  lastError: { code: string; message: string; at: string } | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

export async function loadKaggleAdvisories(horizon: ForecastHorizon): Promise<KaggleAdvisorySnapshot> {
  let res = await fetch(`/api/v1/kaggle?horizon=${encodeURIComponent(horizon)}`, {
    cache: 'no-store',
  }).catch(() => null);
  if (!res || res.status === 404) {
    const fallback = await fetch(`/api/v1/kaggle/advisories?horizon=${encodeURIComponent(horizon)}`, {
      cache: 'no-store',
    }).catch(() => null);
    if (fallback) res = fallback;
  }
  if (!res) {
    throw new Error('Kaggle advisory endpoint could not be reached');
  }
  // 503 still carries a JSON body describing why there are no rows; read it either way.
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    throw new Error(`Kaggle advisory endpoint responded ${res.status}`);
  }
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
