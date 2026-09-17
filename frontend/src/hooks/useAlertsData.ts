/**
 * Alert data as React state (Phase 5).
 *
 * Wraps `lib/alerts.loadAlerts`, which already handles live-API → snapshot fallback
 * and never throws. This hook adds the React concerns:
 *
 *  - one load per mount, plus a manual `refresh()`;
 *  - a visibilitychange reload only when the data is already stale past the SLO, so a
 *    tab left open overnight does not show yesterday's numbers, and a tab switched
 *    back and forth does not hammer the API;
 *  - `offlineFirst` when the browser says it is offline — a metered user should not
 *    watch a request time out for six seconds before the snapshot renders;
 *  - the freshness computation, so the page can render the source banner without
 *    repeating the arithmetic.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AlertPolicyView, type AlertsResult, type AlertsSource, freshnessOf, loadAlerts,
} from '../lib/alerts';

export interface UseAlertsData {
  alerts: AlertsResult['alerts'];
  policy: AlertPolicyView | null;
  source: AlertsSource;
  generatedAt: string | null;
  /** District forecasts assessed by the run that produced this payload. */
  assessed: number | null;
  /** Level → row count, as reported by the payload. */
  counts: Record<string, number> | null;
  droppedUnpublished: number;
  warnings: string[];
  error: string | null;
  loading: boolean;
  ageHours: number | null;
  withinSlo: boolean | null;
  fetchedAt: string | null;
  refresh: () => void;
}

export interface UseAlertsDataOptions {
  /** Milliseconds after which `refresh()` is allowed to fire on tab focus. */
  maxAgeHours?: number;
  /** Disable the network entirely (used by the low-bandwidth/offline surfaces). */
  offline?: boolean;
}

export function useAlertsData({ maxAgeHours = 48, offline = false }: UseAlertsDataOptions = {}): UseAlertsData {
  const [result, setResult] = useState<AlertsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const inFlight = useRef(false);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      const offlineFirst = offline
        || (typeof navigator !== 'undefined' && navigator.onLine === false);
      try {
        const next = await loadAlerts({ offlineFirst });
        if (!cancelled) setResult(next);
      } finally {
        inFlight.current = false;
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [nonce, offline]);

  // Reload on tab focus — but only when what we hold is already past the SLO.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !result) return;
      const { within_slo } = freshnessOf(result, { maxAgeHours });
      if (within_slo === false) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [result, maxAgeHours, refresh]);

  const freshness = result ? freshnessOf(result, { maxAgeHours }) : { age_hours: null, within_slo: null };

  return {
    alerts: result?.alerts || [],
    policy: result?.policy || null,
    source: result?.source || 'none',
    generatedAt: result?.generated_at || null,
    assessed: result?.assessed ?? null,
    counts: result?.counts ?? null,
    droppedUnpublished: result?.dropped_unpublished || 0,
    warnings: result?.warnings || [],
    error: result?.error || null,
    loading,
    ageHours: freshness.age_hours,
    withinSlo: freshness.within_slo,
    fetchedAt: result?.fetched_at || null,
    refresh,
  };
}

export default useAlertsData;
