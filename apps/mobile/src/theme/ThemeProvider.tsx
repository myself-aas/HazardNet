/**
 * ThemeProvider — React context + hook for HazardNet native theme.
 *
 * Reacts to system Appearance changes when mode is 'system'; exposes
 * setMode() for user overrides (light/dark/oled). Wired to Zustand in Phase 2.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, ColorSchemeName, Platform } from 'react-native';
import { getTheme, type Theme, type ThemeMode } from './theme';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode | 'system';
  resolvedMode: ThemeMode;
  setMode: (m: ThemeMode | 'system') => void;
  /** Platform-adapted font family name for the default body font. */
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
  const [mode, setMode] = useState<ThemeMode | 'system'>(initialMode);
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme() ?? 'light',
  );

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme ?? 'light');
    });
    return () => sub.remove();
  }, []);

  const resolvedMode: ThemeMode = useMemo(() => {
    if (mode === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
    return mode;
  }, [mode, systemScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: getTheme(resolvedMode),
      mode,
      resolvedMode,
      setMode,
      bodyFont: Platform.select({ ios: 'SF Pro Text', android: 'Roboto', default: 'System' })!,
      monoFont: Platform.select({ ios: 'SF Mono', android: 'Roboto Mono', default: 'System' })!,
    }),
    [mode, resolvedMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
