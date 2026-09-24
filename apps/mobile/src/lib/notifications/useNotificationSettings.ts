/**
 * useNotificationSettings — persisted global notification preferences.
 * Mirrors @hazardnet/core NotificationSettingsSchema and persists to
 * AsyncStorage under `hazardnet:notif-settings:v1`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from '@hazardnet/core';

const KEY = 'hazardnet:notif-settings:v1';

export function useNotificationSettings() {
  const [settings, setSettingsState] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setSettingsState({ ...DEFAULT_NOTIFICATION_SETTINGS, ...parsed });
        }
      } catch { /* corrupt → defaults */ }
      finally { setIsReady(true); }
    })();
  }, []);

  const updateSettings = useCallback((patch: Partial<NotificationSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { settings, isReady, updateSettings };
}
