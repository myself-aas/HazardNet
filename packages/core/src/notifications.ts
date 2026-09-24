/**
 * Global notification preferences (separate from per-place prefs).
 *
 * These live at the app level and control global behaviour: which categories
 * generate notifications, quiet hours fallback, rate-limit overrides, lock-
 * screen privacy.
 */

import { z } from 'zod';
import { QuietHoursSchema, DEFAULT_QUIET_HOURS } from './savedPlaces';

export const NotificationSettingsSchema = z.object({
  /** Master toggle: if false, no notifications are sent (overrides per-place). */
  enabled: z.boolean().default(true),
  /** Are critical/SEVERE notifications allowed to bypass Do-Not-Disturb? */
  criticalAlertsEnabled: z.boolean().default(false),
  /** Sound enabled. */
  soundEnabled: z.boolean().default(true),
  /** Haptics enabled. */
  hapticsEnabled: z.boolean().default(true),
  /** Show full place name / alert text on the lock screen. When false, show
   *  "HazardNet alert" without place details (privacy for shared phones). */
  showDetailsOnLockScreen: z.boolean().default(false),
  /** Hourly rate limit (max non-critical notifications per hour). */
  maxNotificationsPerHour: z.number().int().min(1).max(50).default(10),
  /** Global fallback quiet hours (used when a place has none set). */
  globalQuietHours: QuietHoursSchema.default(DEFAULT_QUIET_HOURS),
  /** Whether to send a "While you were away" summary on quiet-hour exit or
   *  after returning from offline. */
  digestOnExit: z.boolean().default(true),
  /** Whether to send a test notification when the user taps "Send test". */
  testNotificationsSent: z.number().int().default(0),
});
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  criticalAlertsEnabled: false,
  soundEnabled: true,
  hapticsEnabled: true,
  showDetailsOnLockScreen: false,
  maxNotificationsPerHour: 10,
  globalQuietHours: DEFAULT_QUIET_HOURS,
  digestOnExit: true,
  testNotificationsSent: 0,
};

/** Notification channels (Android) / categories (iOS). */
export const NOTIFICATION_CHANNELS = {
  critical: {
    id: 'critical',
    name: 'Severe alerts',
    description: 'Imminent or life-threatening hazards affecting your saved places.',
    importance: 'max' as const,
  },
  warning: {
    id: 'warning',
    name: 'Warnings',
    description: 'Prepare: a damaging event is plausible at a saved place.',
    importance: 'high' as const,
  },
  watch: {
    id: 'watch',
    name: 'Watches',
    description: 'Monitor: conditions are favourable for a hazard.',
    importance: 'default' as const,
  },
  info: {
    id: 'info',
    name: 'Informational',
    description: 'Data status updates, service restoration, and summaries.',
    importance: 'low' as const,
  },
} as const;

export type NotificationChannelId = keyof typeof NOTIFICATION_CHANNELS;

/** Map an alert level to its delivery channel. */
export function channelForLevel(level: 'NO_ALERT' | 'WATCH' | 'WARNING' | 'SEVERE'): NotificationChannelId {
  switch (level) {
    case 'SEVERE':
      return 'critical';
    case 'WARNING':
      return 'warning';
    case 'WATCH':
      return 'watch';
    default:
      return 'info';
  }
}
