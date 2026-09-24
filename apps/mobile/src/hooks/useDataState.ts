/**
 * useDataState — derive one of the 12 explicit data states for a screen.
 *
 * Consumes:
 *   - useConnectivity (online/offline)
 *   - RQ isLoading/isError/dataUpdatedAt for the alerts query
 *   - appStateStore for appError flag
 *
 * Pure — returns the DataState enum plus derived banner copy/body/CTA.
 * Screen uses this to auto-render stale/offline/delayed/service-down banners.
 */

import { useMemo } from 'react';
import {
  type DataState,
  type BannerTone,
  DATA_STATE_DEFINITIONS,
  ageMs,
  describeAge,
  renderBody,
  SLO_HOURS,
} from '@hazardnet/core';
import { useConnectivity } from './useConnectivity';
import { useAppStateStore } from '../state/appStateStore';
import { useAlerts } from './useAlerts';

const ALERT_SLO_MS = SLO_HOURS.ALERT_SNAPSHOT * 60 * 60 * 1000;

export interface DataStateInfo {
  state: DataState;
  tone: BannerTone;
  headline: string;
  body: string;
  primaryAction: string | null;
  cachedAgeMs: number | null;
}

export function useDataState(): DataStateInfo {
  const { isOnline } = useConnectivity();
  const { data: alerts, isLoading, isError, dataUpdatedAt } = useAlerts();
  const appError = useAppStateStore((s) => s.globalDataState === 'appError');
  const permissionDenied = false; // location-permission gating lands in Phase 5

  const info = useMemo<DataStateInfo>(() => {
    const hasCache = Array.isArray(alerts);
    const cachedAge = hasCache ? ageMs(dataUpdatedAt) : null;
    const hasActiveEvents = hasCache && alerts!.some((a) => a.level !== 'NO_ALERT');
    const partialSourcesMissing = false; // multi-source partial detection lands in Phase 5

    let state: DataState;
    if (appError) {
      state = 'appError';
    } else if (!isOnline) {
      state = hasCache ? 'offlineCached' : 'offlineNoCache';
    } else if (isError && !hasCache) {
      state = 'serviceUnavailable';
    } else if (isLoading && !hasCache) {
      state = 'loading';
    } else if (permissionDenied) {
      state = 'permissionDenied';
    } else if (hasCache) {
      const age = cachedAge ?? 0;
      if (age <= ALERT_SLO_MS) {
        state = hasActiveEvents ? 'loadedActive' : 'loaded';
      } else if (age <= 2 * ALERT_SLO_MS) {
        state = 'stale';
      } else {
        state = isError ? 'serviceUnavailable' : 'delayed';
      }
      if (partialSourcesMissing && state !== 'delayed' && state !== 'stale') state = 'partial';
    } else {
      state = 'loading';
    }

    const def = DATA_STATE_DEFINITIONS[state];
    return {
      state,
      tone: def.tone,
      headline: def.headline,
      body: renderBody(state, { age: describeAge(cachedAge) }),
      primaryAction: def.primaryAction,
      cachedAgeMs: cachedAge,
    };
  }, [isOnline, alerts, isLoading, isError, dataUpdatedAt, appError, permissionDenied]);

  return info;
}
