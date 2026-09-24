/**
 * QueryClient persistence adapter.
 *
 * Uses @tanstack/query-async-storage-persister with AsyncStorage so cached
 * alerts survive app cold-starts. The cache is automatically hydrated on
 * boot and persisted on every mutation — this is what makes the app work
 * offline on a cold launch (Phase 4 acceptance).
 *
 * We only persist the `alerts` query key — not transient UI state. Per
 * §304, we explicitly do NOT persist modal open/close state or transient
 * toasts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { persistQueryClient } from '@tanstack/query-persist-client-core';
import type { QueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@hazardnet/core';

const PERSIST_KEY = 'hazardnet:query-cache:v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — match Phase 4 "grace" for last-known-good.

const storage = {
  getItem: async (key: string): Promise<string | null> => {
    try { return await AsyncStorage.getItem(key); } catch { return null; }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try { await AsyncStorage.setItem(key, value); } catch { /* quota / secure-storage errors are non-fatal */ }
  },
  removeItem: async (key: string): Promise<void> => {
    try { await AsyncStorage.removeItem(key); } catch {}
  },
};

export const queryPersister = createAsyncStoragePersister({
  storage,
  key: PERSIST_KEY,
  throttleTime: 1000, // Debounce persistence to once per second during refetches.
  serialize: (data) => JSON.stringify(data),
  deserialize: (data) => {
    try { return JSON.parse(data); } catch { return {}; }
  },
});

/**
 * Attach persistence to the singleton QueryClient. Idempotent — if already
 * attached the call is a no-op. Returns a promise that resolves once
 * hydration is complete (callers can await this in App.tsx before rendering
 * the first screen for seamless offline boot).
 */
let hydrationPromise: Promise<void> | null = null;
export function persistQueryClientSafe(client: QueryClient): Promise<void> {
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = new Promise((resolve) => {
    try {
      const [, restorePromise] = persistQueryClient({
        queryClient: client,
        persister: queryPersister,
        maxAge: MAX_AGE_MS,
        buster: String(PERSIST_KEY),
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const key = query.queryKey[0];
            return key === QUERY_KEYS.alerts[0];
          },
        },
      });
      restorePromise.then(() => resolve()).catch(() => resolve());
    } catch {
      resolve();
    }
  });
  return hydrationPromise;
}

/** Nuke the persisted cache (used by Data Status screen "Clear cache" action). */
export async function clearPersistedCache(): Promise<void> {
  try { await AsyncStorage.removeItem(PERSIST_KEY); } catch {}
}
