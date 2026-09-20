import { useQuery } from '@tanstack/react-query';
import { fetchStoredPrediction } from '../lib/storedPrediction';

export const usePrediction = (payload: { districtId: string; horizon?: string } | null) =>
  useQuery({
    queryKey: ['stored-prediction', payload],
    queryFn: () => fetchStoredPrediction(payload!.districtId, payload!.horizon),
    enabled: Boolean(payload?.districtId),
  });
