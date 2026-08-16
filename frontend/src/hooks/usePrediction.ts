import { useQuery } from '@tanstack/react-query';

export const usePrediction = (payload: any) => {
  return useQuery({
    queryKey: ['predict', payload],
    queryFn: async () => {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
    enabled: Boolean(payload),
  });
};
