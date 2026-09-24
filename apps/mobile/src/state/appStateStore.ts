/**
 * Runtime app state: online/offline, foreground/background, last network event.
 */

import { create } from 'zustand';
import type { DataState } from '@hazardnet/core';

export interface AppState {
  isOnline: boolean;
  lastForegroundAt: number;
  globalDataState: DataState;
  lastDataUpdateAt: number | null;
  activeBanner: { tone: 'info' | 'warning' | 'error' | 'success'; headline: string; body?: string } | null;
  setOnline: (v: boolean) => void;
  setForegrounded: () => void;
  setGlobalDataState: (s: DataState) => void;
  setLastDataUpdateAt: (t: number) => void;
  setBanner: (b: AppState['activeBanner']) => void;
}

export const useAppStateStore = create<AppState>((set) => ({
  isOnline: true,
  lastForegroundAt: Date.now(),
  globalDataState: 'loaded',
  lastDataUpdateAt: null,
  activeBanner: null,
  setOnline: (v) => set({ isOnline: v }),
  setForegrounded: () => set({ lastForegroundAt: Date.now() }),
  setGlobalDataState: (s) => set({ globalDataState: s }),
  setLastDataUpdateAt: (t) => set({ lastDataUpdateAt: t }),
  setBanner: (b) => set({ activeBanner: b }),
}));
