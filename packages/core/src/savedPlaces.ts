/**
 * Saved place types and validation.
 *
 * A saved place is a location the user cares about (Home, Work, family's
 * village, a farm, a school). Notifications are matched against saved places
 * on-device (and server-side, if the user signs in to sync).
 *
 * Location privacy rules (from §12 of the audit):
 *   - Places are stored on-device by default.
 *   - Server sync is opt-in (account sign-in).
 *   - We never log precise location in analytics.
 *   - Adding a place must NOT require GPS; manual entry is always available.
 */

import { z } from 'zod';

export const HAZARD_TYPES = [
  'cold_wave',
  'drought',
  'fire',
  'flash_flood',
  'flood',
  'heat_wave',
  'severe_local_storm',
  'tropical_cyclone',
] as const;

export type HazardType = (typeof HAZARD_TYPES)[number];

/**
 * A quiet-hours window. Both times are stored as "HH:MM" in local time for the
 * saved place, to handle travel across time zones.
 */
export const QuietHoursSchema = z.object({
  enabled: z.boolean().default(false),
  /** IANA TZDB name, e.g. 'Asia/Dhaka'. Null means "use device local time". */
  timeZone: z.string().nullable().default(null),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time, expected HH:MM').default('22:00'),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time, expected HH:MM').default('07:00'),
  /** When true, SEVERE / critical alerts bypass quiet hours. */
  criticalBypasses: z.boolean().default(true),
});
export type QuietHours = z.infer<typeof QuietHoursSchema>;

export const DEFAULT_QUIET_HOURS: QuietHours = {
  enabled: false,
  timeZone: null,
  start: '22:00',
  end: '07:00',
  criticalBypasses: true,
};

/**
 * Per-place notification preferences.
 */
export const PlaceNotificationPrefsSchema = z.object({
  /** Push notifications enabled for this place. */
  enabled: z.boolean().default(true),
  /** Minimum severity that triggers a notification. Default WARNING+. */
  minLevel: z.enum(['NO_ALERT', 'WATCH', 'WARNING', 'SEVERE']).default('WARNING'),
  /** Hazard types the user cares about; missing types default to ON. */
  hazards: z.record(z.string(), z.boolean()).default({}),
  /** Override global quiet hours for this place. */
  quietHours: QuietHoursSchema.default(DEFAULT_QUIET_HOURS),
});
export type PlaceNotificationPrefs = z.infer<typeof PlaceNotificationPrefsSchema>;

export const DEFAULT_PLACE_NOTIFICATION_PREFS: PlaceNotificationPrefs = {
  enabled: true,
  minLevel: 'WARNING',
  hazards: {},
  quietHours: DEFAULT_QUIET_HOURS,
};

/**
 * A saved place. Places can be entered three ways:
 *   - current-location (requires When-in-Use permission)
 *   - search (geocoded text lookup)
 *   - manual district picker (no GPS required)
 */
export const SavedPlaceSchema = z.object({
  /** Client-generated UUID (crypto.randomUUID on web, expo-crypto on native). */
  id: z.string().uuid(),
  /** User-facing label (e.g. "Home", "Mum's house", "Kurigram farm"). */
  label: z.string().min(1).max(60),
  /** Optional note (free text, ≤200 chars). */
  notes: z.string().max(200).default(''),
  /** User-selected kind, for grouping. */
  kind: z.enum(['home', 'work', 'family', 'school', 'farm', 'other']).default('other'),
  /** Latitude/longitude. Null for manual district-only places. */
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .nullable()
    .default(null),
  /**
   * District id (canonical key from ALL_64_DISTRICTS on web). Required —
   * every saved place is attached to at least a district for coarse matching.
   */
  districtId: z.string().min(1),
  /** Administrative division (optional, derived when possible). */
  division: z.string().optional(),
  /** Upazila names (optional; free-form, may be a list for precision). */
  upazilas: z.array(z.string()).default([]),
  /** Notification preferences for this place. */
  notifications: PlaceNotificationPrefsSchema.default(DEFAULT_PLACE_NOTIFICATION_PREFS),
  /** Creation timestamp (epoch ms). */
  createdAt: z.number(),
  /** Last update timestamp (epoch ms). */
  updatedAt: z.number(),
});
export type SavedPlace = z.infer<typeof SavedPlaceSchema>;

/**
 * Returns true if the given hazard type is enabled for a place.
 * If the place's hazard map doesn't mention the hazard, default to ON.
 */
export function isHazardEnabled(prefs: PlaceNotificationPrefs, hazard: string): boolean {
  const v = prefs.hazards[hazard];
  return v === undefined ? true : v;
}

/**
 * Determine whether a quiet-hours window is active at a given local time.
 *
 * This is a simple wall-clock comparison; it does not yet handle overnight
 * windows or time-zone conversion (caller is responsible for converting `now`
 * to the place's configured TZ).
 */
export function isInQuietHours(quietHours: QuietHours, nowHHMM: string): boolean {
  if (!quietHours.enabled) return false;
  const start = quietHours.start;
  const end = quietHours.end;
  if (start === end) return false;
  if (start < end) {
    // Daytime window, e.g., 13:00–15:00
    return nowHHMM >= start && nowHHMM < end;
  }
  // Overnight window, e.g., 22:00–07:00
  return nowHHMM >= start || nowHHMM < end;
}

/** Maximum number of saved places per anonymous user (prevents abuse). */
export const MAX_SAVED_PLACES_ANONYMOUS = 10;

/** Maximum length of a place label. */
export const MAX_PLACE_LABEL_LENGTH = 60;
