/**
 * Notification matcher — decide whether an incoming alert should produce a
 * notification for a given saved place, and how to deliver it.
 *
 * Pure TypeScript so the same logic can run:
 *   - server-side (account-synced push in Phase 7/8)
 *   - on-device (local notifications when we poll/silent-push updates)
 *
 * Quiet-hours and per-hazard-type gates are enforced here. Deduplication is
 * enforced one level up in the notifier via dedupe.ts.
 */

import type { AlertItemType } from './contracts';
import type { SavedPlace } from './savedPlaces';
import { isHazardEnabled } from './savedPlaces';
import { NOTIFICATION_CHANNELS } from './notifications';

export interface MatchOutcome {
  /** Channel to deliver on. */
  channel: keyof typeof NOTIFICATION_CHANNELS;
  /** Should this notification bypass DND / quiet hours? Only SEVERE when criticalAlertsEnabled. */
  bypassesQuietHours: boolean;
  /** Place id this match is for. */
  placeId: string;
  /** Place label for display. */
  placeLabel: string;
  /** A short title (localized by caller). */
  title: string;
  /** Notification body. */
  body: string;
  /** Dedup key (see dedupe.ts). */
  dedupeKey: string;
}

/** InQuietHours — checks if now (epoch ms, local tz for place) is within quiet hours. */
export function inQuietHours(
  nowMs: number,
  quietHours: { enabled: boolean; start: string; end: string; criticalBypasses: boolean },
  tz?: string | null,
): boolean {
  if (!quietHours.enabled) return false;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz ?? undefined,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(nowMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hhmm = `${get('hour')}:${get('minute')}`;
  const [sh, sm] = quietHours.start.split(':').map(Number);
  const [eh, em] = quietHours.end.split(':').map(Number);
  const [nh, nm] = hhmm.split(':').map(Number);
  const nowMin = nh * 60 + nm;
  const sMin = sh * 60 + sm;
  const eMin = eh * 60 + em;
  if (sMin === eMin) return false;
  if (sMin < eMin) return nowMin >= sMin && nowMin < eMin;
  // Overnight window (start > end, e.g. 22-07).
  return nowMin >= sMin || nowMin < eMin;
}

/**
 * matchAlertToPlace — pure function deciding whether an alert triggers a
 * notification for a place. Returns null if suppressed.
 *
 * Note: we do NOT do point-in-polygon district containment here because the
 * AlertItem uses district_name rather than polygon IDs. Phase 7 adds district
 * polygon IDs; in Phase 6 we match by:
 *   - name match against district_name or the place's placeName / notes
 *   - national-level alerts (no district match needed) if the place exists
 *
 * The per-hazard-type filter uses place.notifications.hazards (default ON).
 */
export function matchAlertToPlace(
  alert: AlertItemType,
  place: SavedPlace,
  nowMs: number,
  options?: { globalCriticalEnabled?: boolean },
): MatchOutcome | null {
  if (!place.notifications.enabled) return null;

  // Hazard filter (per-place; missing = ON per §5.4).
  if (!isHazardEnabled(place.notifications, alert.hazard_type)) return null;

  // Level threshold (minLevel).
  const rank: Record<string, number> = { NO_ALERT: 0, WATCH: 1, WARNING: 2, SEVERE: 3 };
  if (rank[alert.level] < rank[place.notifications.minLevel]) return null;

  // Quiet hours — SEVERE bypasses only if criticalAlertsEnabled (place or global).
  const qh = place.notifications.quietHours;
  const criticalBypass = qh.criticalBypasses && (options?.globalCriticalEnabled ?? false);
  const quiet = inQuietHours(nowMs, qh, qh.timeZone);
  if (quiet && !(alert.level === 'SEVERE' && criticalBypass)) return null;

  // District / place match. Phase 5a saved places may have a manual placeName
  // (notes) rather than district_id — we do a loose substring match on both
  // the alert district and the place's notes/label/location.placeName.
  const district = alert.district_name.toLowerCase();
  const placeStrings = [
    place.label,
    place.notes,
    place.districtId,
    place.division ?? '',
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  const matches = placeStrings.some((s) => {
    if (!s) return false;
    if (s === 'bd-national') return true; // national place matches everything
    return district.includes(s) || s.includes(district);
  });
  if (!matches) return null;

  const channel =
    alert.level === 'SEVERE' ? 'critical' :
    alert.level === 'WARNING' ? 'warning' :
    alert.level === 'WATCH' ? 'watch' : 'info';

  const bypassesQuietHours = alert.level === 'SEVERE' && criticalBypass;

  return {
    channel,
    bypassesQuietHours,
    placeId: place.id,
    placeLabel: place.label,
    title: alert.level === 'SEVERE' ? `${place.label}: Severe alert` :
           alert.level === 'WARNING' ? `${place.label}: Warning` :
           alert.level === 'WATCH' ? `${place.label}: Watch` : `${place.label}: Update`,
    body: `${alert.hazard_type.replace(/_/g, ' ')} — ${alert.district_name}`,
    dedupeKey: `${alert.id}|${place.id}`,
  };
}
