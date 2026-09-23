/**
 * useIncomingAlertNotifier — watches useAlerts() data changes and, for any
 * new alert that matches a saved place (per matchAlertToPlace), schedules
 * a local notification if the app is backgrounded OR shows an in-app banner
 * if the app is foreground.
 *
 * Deduplication is handled locally via scheduleMatch (we use match.dedupeKey
 * + a 30-minute window). New alerts are detected by diffing against a set of
 * "already seen" ids (persisted across sessions via session memory only — we
 * rely on per-alert `published_at` within the last 5 minutes to avoid
 * re-notifying on cold start).
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { matchAlertToPlace, type MatchOutcome } from '@hazardnet/core';
import type { AlertItemType } from '@hazardnet/core';
import { useSavedPlaces } from '../../hooks/useSavedPlaces';
import { useNotificationSettings } from './useNotificationSettings';
import { scheduleMatch } from './notifyAlert';

const RECENT_WINDOW_MS = 5 * 60 * 1000;

export function useIncomingAlertNotifier(alerts: AlertItemType[] | undefined, onForegroundAlert: (m: MatchOutcome, alert: AlertItemType) => void) {
  const { places } = useSavedPlaces();
  const { settings } = useNotificationSettings();
  const seenRef = useRef<Set<string>>(new Set());
  const didInitRef = useRef(false);

  useEffect(() => {
    if (!alerts) return;
    const now = Date.now();
    const appState = AppState.currentState;
    for (const a of alerts) {
      // On first subscription, only consider alerts published within RECENT_WINDOW_MS
      // to avoid re-notifying for every historical alert on cold launch.
      const publishedAt = a.published_at ? Date.parse(a.published_at) : 0;
      if (!didInitRef.current && (now - publishedAt) > RECENT_WINDOW_MS) {
        seenRef.current.add(a.id);
        continue;
      }
      if (seenRef.current.has(a.id)) continue;
      seenRef.current.add(a.id);
      if (!settings.enabled) continue;
      for (const place of places) {
        const m = matchAlertToPlace(a, place, now, { globalCriticalEnabled: settings.criticalAlertsEnabled });
        if (!m) continue;
        if (appState === 'active') {
          onForegroundAlert(m, a);
        } else {
          scheduleMatch(m, a.id).catch(() => {});
        }
      }
    }
    didInitRef.current = true;
  }, [alerts, places, settings, onForegroundAlert]);
}
