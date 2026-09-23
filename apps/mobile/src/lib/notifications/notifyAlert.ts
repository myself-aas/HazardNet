/**
 * notifyAlert — schedule a local notification for a matched alert and
 * record the identifier in AsyncStorage so we can cancel on expiration.
 *
 * We schedule with a 1-second trigger (immediate delivery) because expo
 * local-notifications API uses trigger objects. We set the data payload so
 * the response handler can deep-link.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Notifications } from './configurePush';
import type { MatchOutcome } from '@hazardnet/core/notificationMatcher';

const NOTIFIED_KEY = 'hazardnet:notified:v1';

async function getNotifiedMap(): Promise<Record<string, { id: string; at: number }>> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFIED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function saveNotifiedMap(m: Record<string, { id: string; at: number }>) {
  await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify(m)).catch(() => {});
}

export async function scheduleMatch(match: MatchOutcome, alertId: string): Promise<string | null> {
  if (!Notifications) return null;
  const notified = await getNotifiedMap();
  // Already shown in last 30 minutes? skip.
  const existing = notified[match.dedupeKey];
  if (existing && Date.now() - existing.at < 30 * 60 * 1000) return null;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: match.title,
        body: match.body,
        sound: match.bypassesQuietHours ? 'default' : 'default',
        data: {
          type: 'alert',
          alertId,
          placeId: match.placeId,
          channel: match.channel,
          url: `hazardnet://alert/${alertId}`,
        },
        ...(match.channel === 'critical' ? { priority: 'max' } : {}),
      },
      trigger: null, // deliver immediately
    });
    notified[match.dedupeKey] = { id, at: Date.now() };
    await saveNotifiedMap(notified);
    return id;
  } catch { return null; }
}

/** Cancel a previously-scheduled/delivered notification (e.g. expired alert). */
export async function cancelDismissed(alertId: string) {
  if (!Notifications) return;
  const notified = await getNotifiedMap();
  for (const [key, entry] of Object.entries(notified)) {
    if (key.startsWith(alertId + '|')) {
      try { await Notifications.dismissNotificationAsync(entry.id); } catch {}
      delete notified[key];
    }
  }
  await saveNotifiedMap(notified);
}

/** Send a test notification (for Settings → Send test). */
export async function scheduleTestNotification(): Promise<string | null> {
  if (!Notifications) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'HazardNet test',
        body: 'Notifications are working. SEVERE alerts will sound even when the app is closed.',
        sound: 'default',
        data: { type: 'test', url: 'hazardnet://settings/notifications' },
      },
      trigger: null,
    });
  } catch { return null; }
}
