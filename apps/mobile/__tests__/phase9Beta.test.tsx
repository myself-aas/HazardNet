/**
 * Phase 9 — beta / telemetry / security tests.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { View, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });

// isSafeUrl whitelist.
import { isSafeUrl, redactPlace, redactError } from '../src/lib/security/sanitize';

// Telemetry interface.
import { track, enableDebugLogging, setTelemetryClient, TelemetryClient, TelemetryEvent } from '../src/lib/telemetry';

// SensitiveBlur.
import { SensitiveBlur } from '../src/components/SensitiveBlur/SensitiveBlur';
import { ThemeProvider } from '../src/theme/ThemeProvider';

// Onboarding (screen + persistence helpers).
import { OnboardingScreen, hasSeenOnboarding } from '../src/screens/onboarding/OnboardingScreen';

// safeOpenUrl blocks unsafe schemes.
import { safeOpenUrl } from '../src/lib/security/openUrl';

// Mock react-native's AppState + Linking for SensitiveBlur and openUrl tests.
import { AppState, Linking } from 'react-native';

describe('Phase 9 — security / sanitize', () => {
  test('isSafeUrl allows http/https/tel/mailto/hazardnet/app-settings and blocks javascript/data/file', () => {
    expect(isSafeUrl('https://hazardnet.live')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('tel:999')).toBe(true);
    expect(isSafeUrl('mailto:hello@hazardnet.live')).toBe(true);
    expect(isSafeUrl('hazardnet://alerts/123')).toBe(true);
    expect(isSafeUrl('app-settings:')).toBe(true);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl(null)).toBe(false);
    expect(isSafeUrl(undefined)).toBe(false);
    expect(isSafeUrl('')).toBe(false);
  });

  test('redactPlace strips label/lat/lng and only returns kind + hasLocation', () => {
    const out = redactPlace({ label: 'Home', location: { lat: 23.8103, lng: 90.4125 }, kind: 'home', notes: 'secret' });
    expect(out).toEqual({ kind: 'home', hasLocation: true, notificationsEnabled: false });
    // No coordinate / label leakage.
    expect(JSON.stringify(out)).not.toContain('Home');
    expect(JSON.stringify(out)).not.toContain('23.81');
    expect(JSON.stringify(out)).not.toContain('secret');
  });

  test('redactError produces a {name,message} shape truncated to 200 chars', () => {
    const e = new Error('x'.repeat(400));
    const out = redactError(e);
    expect(out.name).toBe('Error');
    expect(out.message.length).toBeLessThanOrEqual(200);
    expect(redactError('not an error')).toEqual({ name: 'UnknownError', message: '' });
  });
});

describe('Phase 9 — telemetry', () => {
  test('default (Noop) client produces no events and does not throw', () => {
    // Reset to default NoopClient by installing a fresh noop.
    setTelemetryClient({ track() {} } as TelemetryClient);
    expect(() => track({ name: 'app.open' })).not.toThrow();
    expect(() => track({ name: 'screen.view', props: { screen: 'today' } })).not.toThrow();
  });

  test('debug client records events in memory', () => {
    const dbg = enableDebugLogging();
    dbg.reset();
    track({ name: 'app.open' });
    track({ name: 'screen.view', props: { screen: 'today' } });
    track({ name: 'permission.request', props: { which: 'location', result: 'granted' } });
    const events = dbg.getEvents();
    expect(events.map((e: TelemetryEvent) => e.name)).toEqual(['app.open', 'screen.view', 'permission.request']);
  });

  test('track() does not throw on error events with missing/partial props', () => {
    const dbg = enableDebugLogging();
    dbg.reset();
    expect(() => track({ name: 'error', props: { where: 'openUrl' } })).not.toThrow();
  });
});

describe('Phase 9 — SensitiveBlur', () => {
  test('renders children when AppState is active, mounts opaque cover when inactive', () => {
    let listener: ((s: string) => void) | null = null;
    (AppState as any).addEventListener = jest.fn((_evt: string, cb: any) => {
      listener = cb;
      return { remove: jest.fn() };
    });
    const { getByTestId, queryByTestId } = render(
      <ThemeProvider initialMode="light">
        <SensitiveBlur>
          <View testID="child" accessibilityLabel="real-content"><Text>hello</Text></View>
        </SensitiveBlur>
      </ThemeProvider>
    );
    expect(getByTestId('child')).toBeTruthy();
    expect(queryByTestId('sensitive-blur-cover')).toBeNull();
    act(() => { listener?.('inactive'); });
    expect(getByTestId('sensitive-blur-cover')).toBeTruthy();
    act(() => { listener?.('active'); });
    expect(queryByTestId('sensitive-blur-cover')).toBeNull();
  });
});

describe('Phase 9 — safeOpenUrl', () => {
  test('safeOpenUrl blocks javascript: and never calls Linking.openURL', async () => {
    (Linking as any).canOpenURL = jest.fn().mockResolvedValue(true);
    (Linking as any).openURL = jest.fn().mockResolvedValue(undefined);
    const ok = await safeOpenUrl('javascript:alert(1)');
    expect(ok).toBe(false);
    expect((Linking as any).openURL).not.toHaveBeenCalled();
  });

  test('safeOpenUrl opens tel: urls', async () => {
    (Linking as any).canOpenURL = jest.fn().mockResolvedValue(true);
    (Linking as any).openURL = jest.fn().mockResolvedValue(undefined);
    const ok = await safeOpenUrl('tel:999', 'emergency');
    expect(ok).toBe(true);
    expect((Linking as any).openURL).toHaveBeenCalledWith('tel:999');
  });
});

function renderOnboarding(onDone: () => void) {
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider initialMode="light">
        <NavigationContainer>
          <OnboardingScreen onDone={onDone} />
        </NavigationContainer>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe('Phase 9 — onboarding', () => {
  beforeEach(() => {
    // Reset AsyncStorage between tests.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    AsyncStorage.clear?.();
  });

  test('hasSeenOnboarding returns false until completed', async () => {
    expect(await hasSeenOnboarding()).toBe(false);
  });

  test('OnboardingScreen shows 3 slides; Continue twice then Get started completes', async () => {
    const dbg = enableDebugLogging();
    dbg.reset();
    const onDone = jest.fn();
    const { getByText } = renderOnboarding(onDone);
    expect(getByText(/Multi-hazard alerts/)).toBeTruthy();
    // First Continue → slide 2.
    fireEvent.press(getByText('Continue'));
    expect(getByText(/Not an official warning service/)).toBeTruthy();
    // Second Continue → slide 3.
    fireEvent.press(getByText('Continue'));
    expect(getByText(/Save places, get alerts/)).toBeTruthy();
    // Get started calls onDone.
    fireEvent.press(getByText('Get started'));
    await waitFor(() => { expect(onDone).toHaveBeenCalled(); });
    expect(await hasSeenOnboarding()).toBe(true);
  });

  test('Skip dismisses onboarding immediately', async () => {
    const onDone = jest.fn();
    const { getByText } = renderOnboarding(onDone);
    fireEvent.press(getByText('Skip'));
    await waitFor(() => { expect(onDone).toHaveBeenCalled(); });
    expect(await hasSeenOnboarding()).toBe(true);
  });
});
