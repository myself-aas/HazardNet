/**
 * usePushToken — register for an Expo Push Token on device and persist it to
 * AsyncStorage for the Phase 6+ server push relay.
 *
 * This is a LOCAL STUB for now: it resolves the device push token via expo-
 * notifications and stores it. The actual upload to hazardnet.live/push-token
 * is wired in Phase 6b once the FCM/APNs/EAS project IDs are provisioned.
 */

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Notifications } from './configurePush';

const TOKEN_KEY = 'hazardnet:push-token:v1';

export function usePushToken(permission: 'unknown' | 'granted' | 'denied') {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (permission !== 'granted' || !Notifications) return;
    let mounted = true;
    (async () => {
      try {
        // Try cached token first.
        const cached = await AsyncStorage.getItem(TOKEN_KEY);
        if (cached && mounted) setToken(cached);
        // Only resolve native token if expo-notifications exposes getExpoPushTokenAsync;
        // wrapped so this doesn't crash in tests/web.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const expoNotif: any = Notifications;
        // getExpoPushTokenAsync requires expo applicationId/projectId. We attempt it but
        // swallow errors (Phase 6b wires the real EAS projectId).
        if (typeof (expoNotif as any).getExpoPushTokenAsync === 'function') {
          try {
            const res = await (expoNotif as any).getExpoPushTokenAsync();
            if (res?.data) {
              await AsyncStorage.setItem(TOKEN_KEY, res.data);
              if (mounted) setToken(res.data);
            }
          } catch { /* no projectId configured yet */ }
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, [permission]);

  return { token };
}
