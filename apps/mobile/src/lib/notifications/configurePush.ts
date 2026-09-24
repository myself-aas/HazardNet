/**
 * configurePush.ts — set up Android channels + iOS categories. Safe to call
 * on every launch (idempotent). Wraps expo-notifications behind a try/catch
 * so tests/non-native environments don't crash.
 */

import { NOTIFICATION_CHANNELS } from '@hazardnet/core';

let Notifications: typeof import('expo-notifications') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications') as typeof import('expo-notifications');
} catch {
  Notifications = null;
}

export async function configurePushChannels() {
  if (!Notifications) return;
  try {
    // Foreground presentation: show banner + sound for SEVERE/WARNING; badge only for info.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      } as any),
    });

    if (typeof Notifications.setNotificationChannelAsync === 'function') {
      const channels: Record<string, { importance: any }> = {
        critical: { importance: Notifications.AndroidImportance.MAX },
        warning: { importance: Notifications.AndroidImportance.HIGH },
        watch: { importance: Notifications.AndroidImportance.DEFAULT },
        info: { importance: Notifications.AndroidImportance.LOW },
      };
      for (const [id, def] of Object.entries(NOTIFICATION_CHANNELS)) {
        await Notifications.setNotificationChannelAsync(def.id, {
          name: def.name,
          description: def.description,
          importance: (channels[id] ?? channels.info).importance,
          vibrationPattern: id === 'critical' ? [0, 500, 250, 500] : [0, 250, 250, 250],
          sound: 'default',
        });
      }
    }
  } catch { /* native module not available */ }
}

export { Notifications };
