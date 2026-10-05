/**
 * ThemeProvider — system appearance, user theme preference, contrast and fonts.
 *
 * System is the default. Explicit light/dark/OLED preferences and the Increase
 * contrast setting are read from the shared settings store so the controls in
 * Accessibility settings affect the app instead of only changing a stored flag.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, ColorSchemeName, Platform } from 'react-native';
import { useSettingsStore } from '../state/settingsStore';
import { getTheme, type Theme, type ThemeMode } from './theme';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode | 'system';
  resolvedMode: ThemeMode;
  setMode: (m: ThemeMode | 'system') => void;
  /** Platform system UI face; iOS resolves to San Francisco, Android to its default sans. */
  bodyFont: string;
  monoFont: string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  initialMode = 'system',
}: {
  children: React.ReactNode;
  initialMode?: ThemeMode | 'system';
}) {
  const storedMode = useSettingsStore((state) => state.theme);
  const setStoredMode = useSettingsStore((state) => state.setTheme);
  const increaseContrast = useSettingsStore((state) => state.increaseContrast);
  const [manualMode, setManualMode] = useState<ThemeMode | 'system'>(initialMode);
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme() ?? 'light',
  );

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme ?? 'light');
    });
    return () => sub.remove();
  }, []);

  const mode = initialMode === 'system' ? storedMode : manualMode;
  const setMode = useCallback((next: ThemeMode | 'system') => {
    if (initialMode === 'system') setStoredMode(next);
    else setManualMode(next);
  }, [initialMode, setStoredMode]);

  const resolvedMode: ThemeMode = useMemo(() => {
    if (mode === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
    return mode;
  }, [mode, systemScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: getTheme(resolvedMode, increaseContrast),
      mode,
      resolvedMode,
      setMode,
      // Native system family names preserve the platform's own UI typography:
      // iOS uses San Francisco; Android uses its installed system sans face.
      bodyFont: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' })!,
      monoFont: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })!,
    }),
    [increaseContrast, mode, resolvedMode, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
