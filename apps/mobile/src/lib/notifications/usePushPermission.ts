/**
 * usePushPermission — track whether the user has granted notification
 * permission, expose request + openSettings. Permission is requested IN
 * CONTEXT (after first saved place / user presses "Enable alerts") — never at
 * launch (per §10/§12 and mirroring the location permission pattern).
 */

import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { Notifications } from './configurePush';
import { track } from '../telemetry';
import { safeOpenUrl } from '../security/openUrl';

export type PushPermissionState = 'unknown' | 'granted' | 'denied';

export interface PushPermissionStateValue {
  permission: PushPermissionState;
  requestPermission: () => Promise<PushPermissionState>;
  openSettings: () => void;
}

export function usePushPermission(): PushPermissionStateValue {
  const [permission, setPermission] = useState<PushPermissionState>('unknown');

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!Notifications) { setPermission('denied'); return; }
      try {
        const settings: any = await Notifications.getPermissionsAsync();
        if (!mounted) return;
        setPermission(settings.granted ? 'granted' : (settings.canAskAgain ? 'unknown' : 'denied'));
      } catch {
        setPermission('denied');
      }
    })();
    return () => { mounted = false; };
  }, []);

  const requestPermission = useCallback(async (): Promise<PushPermissionState> => {
    if (!Notifications) return 'denied';
    try {
      const existing: any = await Notifications.getPermissionsAsync();
      let result: any = existing;
      if (!existing.granted && existing.canAskAgain) {
        result = await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
        });
      }
      const state: PushPermissionState = result.granted ? 'granted' : 'denied';
      setPermission(state);
      track({ name: 'permission.request', props: { which: 'notifications', result: state } });
      return state;
    } catch {
      setPermission('denied');
      return 'denied';
    }
  }, []);

  const openSettings = useCallback(() => {
    if (Platform.OS === 'ios') safeOpenUrl('app-settings:', 'ios-settings').catch(() => {});
    else Linking.openSettings();
  }, []);

  return { permission, requestPermission, openSettings };
}
