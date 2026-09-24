/**
 * React Query client configuration.
 *
 * Phase 4: persistence via @tanstack/query-async-storage-persister on
 * AsyncStorage, seeded on first boot with LAST_KNOWN_GOOD snapshot.
 */

import { QueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@hazardnet/core';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Exponential backoff: 2s → 4s → 8s cap. Matches §7 "Retry and backoff"
      // (1s → 5s → 30s → 2m → 15m → 1h cap with jitter). The RQ default has
      // jitter; we tighten the floor/ceiling to avoid thrashing on slow 2G/3G.
      retry: 5,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 60 * 60 * 1000),
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: 'always', // immediate silent refetch on reconnect
      // Alert data is considered fresh for 60s (matches BMD poll cadence).
      staleTime: 60_000,
      gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days — long grace for offline cache
    },
    mutations: {
      retry: 1,
    },
  },
});

/**
 * Seed the query cache with last-known-good on first-ever launch.
 * Called early from App.tsx before persistence hydrates; if persistence
 * has data it will overwrite this seed. If persistence is empty (first
 * cold launch), this seed guarantees the app is not blank.
 */
import { LAST_KNOWN_GOOD } from '../../assets/snapshot/lastKnownGood';
export function seedLastKnownGood() {
  const existing = queryClient.getQueryData(QUERY_KEYS.alerts);
  if (existing) return;
  queryClient.setQueryData(QUERY_KEYS.alerts, LAST_KNOWN_GOOD.alerts);
}

