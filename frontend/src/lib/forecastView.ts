import type { StoredPrediction } from './storedPrediction';
import { StoredPredictionError, type ForecastFetchReason } from './storedPrediction';

export type Horizon = '7_days' | '15_days';

export type Selection = { districtId: string; horizon: Horizon };

export type ForecastViewState =
  | { kind: 'idle' }
  | { kind: 'loading'; selection: Selection }
  | { kind: 'ready'; selection: Selection; data: StoredPrediction; refreshing: boolean }
  | { kind: 'uncovered'; selection: Selection }
  | { kind: 'error'; selection: Selection; reason: ForecastFetchReason };

export const HORIZONS: readonly Horizon[] = ['7_days', '15_days'];

export const isHorizon = (value: unknown): value is Horizon =>
  value === '7_days' || value === '15_days';

export function parseLookupParams(params: { get: (name: string) => string | null }): {
  districtId: string | null;
  horizon: Horizon | null;
} {
  const districtRaw = params.get('district');
  const districtId =
    typeof districtRaw === 'string' && /^[a-z][a-z0-9_-]{1,63}$/i.test(districtRaw.trim())
      ? districtRaw.trim().toLowerCase()
      : null;
  const horizonRaw = params.get('horizon');
  return { districtId, horizon: isHorizon(horizonRaw) ? horizonRaw : null };
}

export interface QueryLike {
  data: StoredPrediction | undefined;
  error: unknown;
  isFetching: boolean;
  isPending: boolean;
}

/**
 * Map a TanStack Query result onto the presentation contract.
 * Locale is intentionally absent: formatting happens at the view boundary.
 */
export function forecastViewStateFromQuery(args: {
  selection: Selection | null;
  query: QueryLike;
}): ForecastViewState {
  const { selection, query } = args;
  if (!selection) return { kind: 'idle' };

  if (query.data) {
    return { kind: 'ready', selection, data: query.data, refreshing: query.isFetching };
  }

  if (query.isPending || (query.isFetching && !query.error)) {
    return { kind: 'loading', selection };
  }

  const reason = reasonFromError(query.error);
  if (reason === 'uncovered') return { kind: 'uncovered', selection };
  return { kind: 'error', selection, reason };
}

export function reasonFromError(error: unknown): ForecastFetchReason {
  if (error instanceof StoredPredictionError) return error.reason;
  return 'server';
}

/** Compatibility mapping for callers that still pass a raw stored row. */
export function forecastViewStateFromLegacy(args: {
  forecast: StoredPrediction | null | undefined;
  loading?: boolean;
  requested?: boolean;
  selection?: Selection | null;
}): ForecastViewState {
  const selection = args.selection ?? { districtId: 'unknown', horizon: '7_days' };
  if (args.forecast) {
    return {
      kind: 'ready',
      selection: {
        districtId: args.forecast.provenance.district_id ?? selection.districtId,
        horizon: isHorizon(args.forecast.provenance.horizon)
          ? args.forecast.provenance.horizon
          : selection.horizon,
      },
      data: args.forecast,
      refreshing: Boolean(args.loading),
    };
  }
  if (args.loading) return { kind: 'loading', selection };
  if (args.requested) return { kind: 'error', selection, reason: 'server' };
  return { kind: 'idle' };
}
