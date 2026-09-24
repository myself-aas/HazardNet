/**
 * TanStack Query hooks for alert data.
 *
 * Phase 3: fetches mock fixtures (mockAlerts.ts) with simulated latency.
 * Phase 4: swap fetchMockAlerts for @hazardnet/api bindEndpoints(client).getAlerts()
 *          and add MMKV persistence. The queryKey is already the canonical
 *          @hazardnet/core QUERY_KEYS.alerts, so all caches invalidate correctly.
 */

import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@hazardnet/core';
import { fetchMockAlerts, type AlertExtras, getExtrasFor, MOCK_ALERT_EXTRAS, MOCK_ALERT_ROWS } from '../lib/mockAlerts';
import type { AlertItemType } from '@hazardnet/core';

export function useAlerts() {
  return useQuery<AlertItemType[]>({
    queryKey: QUERY_KEYS.alerts,
    queryFn: () => fetchMockAlerts(),
    staleTime: 5 * 60 * 1000, // mock data — refresh every 5 min
    gcTime: 30 * 60 * 1000,
  });
}

export function useAlertById(id: string | null) {
  const { data: alerts, ...rest } = useAlerts();
  const alert = id ? alerts?.find((a) => a.id === id) ?? null : null;
  const extras = id ? getExtrasFor(id) : null;
  return { alert, extras, ...rest };
}

export function useAlertCounts(alerts?: AlertItemType[]) {
  if (!alerts) return { severe: 0, warning: 0, watch: 0, total: 0 };
  let severe = 0, warning = 0, watch = 0;
  for (const a of alerts) {
    if (a.level === 'SEVERE') severe++;
    else if (a.level === 'WARNING') warning++;
    else if (a.level === 'WATCH') watch++;
  }
  return { severe, warning, watch, total: alerts.length };
}
