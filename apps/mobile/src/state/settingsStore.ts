/**
 * Global settings store (Zustand).
 *
 * Holds non-sensitive UI preferences. Secure/identifying state lives elsewhere:
 * refresh tokens in expo-secure-store; query cache in MMKV (Phase 4).
 */

import { create } from 'zustand';
import type { ThemeMode } from '../theme/theme';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@hazardnet/core';

export type AppThemePref = 'system' | ThemeMode;

export interface SettingsState {
  theme: AppThemePref;
  locale?: 'en' | 'bn';
  hapticsEnabled: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  lowDataMode: boolean;
  increaseContrast: boolean;
  boldText: boolean;
  notificationSettings: typeof DEFAULT_NOTIFICATION_SETTINGS;
  // Actions
  setTheme: (t: AppThemePref) => void;
  setLocale: (l: 'en' | 'bn') => void;
  setHapticsEnabled: (v: boolean) => void;
  setReducedMotion: (v: boolean) => void;
  setLargeText: (v: boolean) => void;
  setLowDataMode: (v: boolean) => void;
  setIncreaseContrast: (v: boolean) => void;
  setBoldText: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'system',
  locale: undefined,
  hapticsEnabled: true,
  reducedMotion: false,
  largeText: false,
  lowDataMode: false,
  increaseContrast: false,
  boldText: false,
  notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
  setTheme: (t) => set({ theme: t }),
  setLocale: (l) => set({ locale: l }),
  setHapticsEnabled: (v) => set({ hapticsEnabled: v }),
  setReducedMotion: (v) => set({ reducedMotion: v }),
  setLargeText: (v) => set({ largeText: v }),
  setLowDataMode: (v) => set({ lowDataMode: v }),
  setIncreaseContrast: (v) => set({ increaseContrast: v }),
  setBoldText: (v) => set({ boldText: v }),
}));
