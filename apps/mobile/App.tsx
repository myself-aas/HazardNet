/**
 * HazardNet Mobile — Phase 2 root.
 *
 * Wraps the app with:
 *   - GestureHandlerRootView (required by reanimated + gesture-handler)
 *   - SafeAreaProvider
 *   - QueryClientProvider (TanStack React Query)
 *   - ThemeProvider (light/dark/OLED + Dynamic Type-aware text)
 *   - ErrorBoundary (state 12 — never a white screen)
 *   - System UI color sync (expo-system-ui / StatusBar)
 *   - NavigationContainer (React Navigation root)
 *
 * The 5-tab IA (Today / Alerts / Map / Saved / More) is rendered via
 * RootNavigator. Screens render placeholder chrome in Phase 2; Phase 3+
 * fills in feature content.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SystemUI from 'expo-system-ui';

import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { ErrorBoundary } from './src/components/ErrorBoundary/ErrorBoundary';
import { RootNavigator } from './src/navigation/RootNavigator';
import { queryClient, seedLastKnownGood } from './src/lib/queryClient';
import { persistQueryClientSafe } from './src/lib/persister';
import { useAppStateStore } from './src/state/appStateStore';
import { SavedPlacesProvider } from './src/hooks/useSavedPlaces';
import { applyDefaultOrientationLock } from './src/hooks/useOrientationLock';
import { SensitiveBlur } from './src/components/SensitiveBlur/SensitiveBlur';
import { OnboardingScreen, hasSeenOnboarding } from './src/screens/onboarding/OnboardingScreen';
import { track, enableDebugLogging, startMark } from './src/lib/telemetry';
import { assertNoSecretsInBundle } from './src/lib/security/sanitize';

// Strip console.log in release builds (keeps warn/error for crash reporting).
if (!__DEV__) {
  // eslint-disable-next-line no-console
  console.log = () => {};
  // eslint-disable-next-line no-console
  console.debug = () => {};
}
applyDefaultOrientationLock();
if (__DEV__) { enableDebugLogging(); assertNoSecretsInBundle(); }

function ThemedApp() {
  const { resolvedMode, theme } = useTheme();
  const setForegrounded = useAppStateStore((s) => s.setForegrounded);
  const [seenOnboarding, setSeenOnboarding] = useState<boolean | null>(null);
  const ttfc = React.useMemo(() => startMark('ttfc'), []);

  useEffect(() => {
    hasSeenOnboarding().then((s) => setSeenOnboarding(s));
  }, []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.background).catch(() => {});
  }, [theme.colors.background]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setForegrounded();
    });
    return () => sub.remove();
  }, [setForegrounded]);

  const handleOnboardingDone = useCallback(() => {
    setSeenOnboarding(true);
    track({ name: 'screen.view', props: { screen: 'tabs' } });
  }, []);

  // Fire TTFC metric once onboarding decision is known + first paint.
  useEffect(() => {
    if (seenOnboarding !== null) {
      // Defer a frame so the first content is painted; record TTFC.
      requestAnimationFrame(() => ttfc());
    }
  }, [seenOnboarding, ttfc]);

  return (
    <View style={styles.root}>
      <StatusBar style={resolvedMode === 'light' ? 'dark' : 'light'} />
      <SensitiveBlur>
        {seenOnboarding === false ? <OnboardingScreen onDone={handleOnboardingDone} /> : <RootNavigator />}
      </SensitiveBlur>
    </View>
  );
}

/**
 * BootGate waits for persistence hydration + last-known-good seeding before
 * rendering the navigator. Without this gate, a cold launch on airplane mode
 * would briefly show "Loading…" before the cache hydrates — Phase 4 acceptance
 * criterion is <2s to first severity card.
 */
function BootGate() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    seedLastKnownGood();
    persistQueryClientSafe(queryClient)
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  if (!ready) return null;
  return <ThemedApp />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider initialMode="system">
            <SavedPlacesProvider>
              <ErrorBoundary>
                <BootGate />
              </ErrorBoundary>
            </SavedPlacesProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

/**
 * Phase 2 shell descriptor — exposed for unit-test verification of config
 * constants (touch-target floor, app name, sample risk data). The runtime App
 * is the default export above.
 */
export function getAppState() {
  return {
    appName: 'HazardNet Mobile',
    sampleDistrictData: { risk: 'High' },
    expressiveTouchFloor: { googlePlayDp: 48 },
  };
}
