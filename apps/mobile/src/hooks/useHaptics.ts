/**
 * useHaptics — wraps expo-haptics behind @hazardnet/core HapticIntent.
 *
 * Safe to call on web / without expo-haptics installed (no-ops).
 */

import { useCallback } from 'react';
import { Platform } from 'react-native';
import { hapticForAlert, HAPTIC_PROFILES, type HapticIntent } from '@hazardnet/core';

let Haptics: typeof import('expo-haptics') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  Haptics = require('expo-haptics') as typeof import('expo-haptics');
} catch {
  Haptics = null;
}

export function useHaptics() {
  const trigger = useCallback((intent: HapticIntent) => {
    if (!Haptics || intent === 'none') return;
    let hapticsEnabled = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const { useSettingsStore } = require('../state/settingsStore');
      hapticsEnabled = useSettingsStore.getState().hapticsEnabled;
    } catch {}
    if (!hapticsEnabled) return;
    const profile = HAPTIC_PROFILES[intent];
    if (!profile) return;
    const plat = Platform.OS === 'ios' ? profile.ios : profile.android;
    try {
      if (Platform.OS === 'ios') {
        if (plat.type === 'selection') {
          Haptics.selectionAsync().catch(() => {});
          return;
        }
        if (plat.type === 'notification') {
          const nmap: Record<string, unknown> = {
            success: Haptics.NotificationFeedbackType.Success,
            warning: Haptics.NotificationFeedbackType.Warning,
            error: Haptics.NotificationFeedbackType.Error,
          };
          Haptics.notificationAsync(nmap[plat.style ?? 'success'] as any).catch(() => {});
          return;
        }
        if (plat.type === 'impact') {
          const imap: Record<string, unknown> = {
            light: Haptics.ImpactFeedbackStyle.Light,
            medium: Haptics.ImpactFeedbackStyle.Medium,
            heavy: Haptics.ImpactFeedbackStyle.Heavy,
          };
          Haptics.impactAsync(imap[plat.style ?? 'medium'] as any).catch(() => {});
        }
      } else {
        if (plat.type === 'selection') {
          Haptics.selectionAsync().catch(() => {});
          return;
        }
        if (plat.type === 'impact' || plat.type === 'notification') {
          const imap: Record<string, unknown> = {
            light: Haptics.ImpactFeedbackStyle.Light,
            medium: Haptics.ImpactFeedbackStyle.Medium,
            heavy: Haptics.ImpactFeedbackStyle.Heavy,
          };
          Haptics.impactAsync(imap[plat.style ?? 'medium'] as any).catch(() => {});
        }
      }
    } catch {
      // never crash on haptics
    }
  }, []);

  const triggerForAlert = useCallback((level: 'NO_ALERT' | 'WATCH' | 'WARNING' | 'SEVERE') => {
    trigger(hapticForAlert(level));
  }, [trigger]);

  return { trigger, triggerForAlert };
}
