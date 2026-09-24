/**
 * Deduplication helpers.
 *
 * Used for:
 *   - Notification dedupe (don't fire two notifications for the same alert
 *     within a short window; suppress duplicate re-notifications; cancel
 *     superseded alerts).
 *   - Request deduplication (the API client uses the same key logic to ensure
 *     we don't fire more than one in-flight request for the same resource).
 */

import type { AlertLevelType as AlertLevel } from './contracts';

/**
 * Build a stable dedupe key for an alert.
 *
 * An alert is considered "the same" if (district, hazard_type, target_date)
 * is the same within a 6-hour window. The actual alert `id` is preferred when
 * available, but during an update/escalation the server may issue a new id for
 * what the user perceives as the same event — this key keeps the UI from
 * showing double notifications.
 */
export interface AlertDedupeInput {
  id?: string | null;
  district_id?: string | number | null;
  district_name?: string | null;
  hazard_type: string;
  target_date: string | number; // ISO string or epoch ms
  level: AlertLevel;
}

const ALERT_DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

export function alertDedupeKey(a: AlertDedupeInput): string {
  const district =
    String(a.district_id ?? a.district_name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const hazard = a.hazard_type.toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetMs =
    typeof a.target_date === 'number'
      ? a.target_date
      : Date.parse(a.target_date);
  // Bucket to 6-hour windows so reissues/escalations in the same window collapse
  const bucket = Math.floor(targetMs / ALERT_DEDUPE_WINDOW_MS);
  return `${district}|${hazard}|${bucket}`;
}

/**
 * Returns true when a new notification should be SUPPRESSED because we've
 * already notified recently at the same-or-higher level.
 *
 * - If the last notified level is strictly higher than the new one, suppress
 *   (de-escalation doesn't re-notify; the existing notification is silently
 *   updated or left alone).
 * - If the last notification was in the last 30 minutes at the same level,
 *   suppress.
 * - Otherwise notify.
 */
export function shouldSuppressNotification(
  newAlert: { level: AlertLevel; receivedAt: number; dedupeKey: string },
  lastNotified: { level: AlertLevel; at: number } | null,
): boolean {
  if (!lastNotified) return false;
  const levelRank: Record<AlertLevel, number> = {
    NO_ALERT: 0,
    WATCH: 1,
    WARNING: 2,
    SEVERE: 3,
  };
  if (levelRank[lastNotified.level] > levelRank[newAlert.level]) return true;
  if (
    levelRank[lastNotified.level] === levelRank[newAlert.level] &&
    newAlert.receivedAt - lastNotified.at < 30 * 60 * 1000
  ) {
    return true;
  }
  return false;
}

/** Build a dedupe key for an API request (method + URL + sorted query string). */
export function requestDedupeKey(
  method: string,
  url: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  const search = params
    ? Object.entries(params)
        .filter(([, v]) => v !== null && v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return `${method.toUpperCase()}:${url}${search ? '?' + search : ''}`;
}
