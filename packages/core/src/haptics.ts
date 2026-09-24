/**
 * Haptic feedback profiles — platform-adapted by the app layer.
 *
 * Core exports the semantic *intents*; each platform (iOS/Android) maps the
 * intent to a native haptic. The web ignores haptics.
 *
 * Haptics rules (from touch-psychology.md):
 *   - Haptics only when meaningful. Never for routine tab switches or background
 *     refreshes the user did not trigger.
 *   - Respect the system "Haptic feedback" / "System Haptics" setting.
 *   - Critical events use stronger patterns; routine confirmations use light.
 */

import type { AlertLevelType as AlertLevel } from './contracts';

export type HapticIntent =
  | 'selection'      // light tick — picker change, chip toggle
  | 'confirmation'   // medium — save/action completed
  | 'warning'        // warning impact — WARNING-level alert appeared
  | 'error'          // heavy error impact
  | 'critical'       // critical — SEVERE alert, breaking through
  | 'sheetSnap'      // selection-class feedback when a bottom sheet snaps
  | 'none';

/**
 * Map an alert level to the haptic that should fire when the alert first
 * becomes visible (not on every refresh — that would be spam).
 */
export function hapticForAlert(level: AlertLevel): HapticIntent {
  switch (level) {
    case 'SEVERE':
      return 'critical';
    case 'WARNING':
      return 'warning';
    case 'WATCH':
      return 'selection';
    case 'NO_ALERT':
    default:
      return 'none';
  }
}

/** Haptic profiles used by the iOS/Android adapters. */
export interface HapticProfile {
  ios: {
    /** UIKit notification feedback type or impact style. */
    type: 'notification' | 'impact' | 'selection' | 'none';
    style?: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'rigid' | 'soft';
  };
  android: {
    /** React Native HapticFeedback type (HapticFeedbackConstants). */
    type: 'selection' | 'impactLight' | 'impactMedium' | 'impactHeavy' | 'notificationWarning' | 'notificationError' | 'contextClick' | 'clockTick' | 'none';
  };
}

export const HAPTIC_PROFILES: Record<HapticIntent, HapticProfile> = {
  none: {
    ios: { type: 'none' },
    android: { type: 'none' },
  },
  selection: {
    ios: { type: 'selection' },
    android: { type: 'selection' },
  },
  confirmation: {
    ios: { type: 'notification', style: 'success' },
    android: { type: 'impactLight' },
  },
  warning: {
    ios: { type: 'notification', style: 'warning' },
    android: { type: 'notificationWarning' },
  },
  error: {
    ios: { type: 'notification', style: 'error' },
    android: { type: 'notificationError' },
  },
  critical: {
    ios: { type: 'notification', style: 'error' },
    android: { type: 'impactHeavy' },
  },
  sheetSnap: {
    ios: { type: 'impact', style: 'rigid' },
    android: { type: 'contextClick' },
  },
};
