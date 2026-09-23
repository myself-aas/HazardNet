/**
 * useOrientationLock — lock a screen to a specific orientation on mount,
 * restore previous orientation on unmount. Safe to call on any screen.
 *
 * Phases 8 scope: lock phones to portrait everywhere EXCEPT Map and
 * SubmitReport (where landscape is useful for the mini-map / camera preview).
 * Tablets are left unlocked.
 */

import { useEffect } from 'react';
import { Platform, Dimensions } from 'react-native';

let ScreenOrientation: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  ScreenOrientation = require('expo-screen-orientation');
} catch { ScreenOrientation = null; }

export type OrientationLock = 'portrait' | 'landscape' | 'all';

function lock(mode: OrientationLock) {
  if (!ScreenOrientation) return;
  try {
    const { width, height } = Dimensions.get('window');
    const isTablet = Math.min(width, height) >= 768;
    if (isTablet) { ScreenOrientation.unlockAsync?.().catch(() => {}); return; }
    if (mode === 'portrait') {
      ScreenOrientation.lockAsync?.(ScreenOrientation.OrientationLock?.PORTRAIT_UP ?? 1).catch(() => {});
    } else if (mode === 'landscape') {
      ScreenOrientation.lockAsync?.(ScreenOrientation.OrientationLock?.LANDSCAPE ?? 3).catch(() => {});
    } else {
      ScreenOrientation.unlockAsync?.().catch(() => {});
    }
  } catch {}
}

export function useOrientationLock(mode: OrientationLock) {
  useEffect(() => {
    lock(mode);
    return () => { lock('portrait'); };
  }, [mode]);
}

/** Call once at app root to apply the default portrait lock. */
export function applyDefaultOrientationLock() {
  // Only lock on phone; tablets free to rotate.
  if (Platform.OS === 'web') return;
  lock('portrait');
}
