/** Combines the operating-system Reduce Motion setting with the in-app override. */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useSettingsStore } from '../state/settingsStore';

export function useReducedMotionPreference(): boolean {
  const inAppPreference = useSettingsStore((state) => state.reducedMotion);
  const [systemPreference, setSystemPreference] = useState(false);

  useEffect(() => {
    let active = true;
    const update = (enabled: boolean) => {
      if (active) setSystemPreference(enabled);
    };

    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled()).then(update).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', update);

    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  return inAppPreference || systemPreference;
}
