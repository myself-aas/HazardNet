import { useQuery } from '@tanstack/react-query';
import { fetchStoredPrediction, shouldRetryStoredPrediction } from '../lib/storedPrediction';
import type { Horizon } from '../lib/forecastView';

export const storedPredictionQueryKey = (districtId: string, horizon: Horizon) =>
  ['stored-prediction', districtId, horizon] as const;

export const usePrediction = (payload: { districtId: string; horizon: Horizon } | null) =>
  useQuery({
    queryKey: storedPredictionQueryKey(payload?.districtId ?? '', payload?.horizon ?? '7_days'),
    queryFn: ({ signal }) => fetchStoredPrediction(payload!.districtId, payload!.horizon, { signal }),
    enabled: Boolean(payload?.districtId && payload?.horizon),
    retry: shouldRetryStoredPrediction,
    retryDelay: 0,
    refetchOnWindowFocus: false,
  });
