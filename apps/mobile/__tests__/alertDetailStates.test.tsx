/**
 * RNTL per-state tests for AlertDetailScreen.
 */

import React from 'react';
import { render, screen, waitFor } from '../src/test/test-utils';
import { AlertDetailScreen } from '../src/screens/alerts/AlertDetailScreen';
import { MOCK_ALERTS, getExtrasFor } from '../src/lib/mockAlerts';

const KURIGRAM_ID = MOCK_ALERTS[0].id;
const COX_ID = MOCK_ALERTS[1].id;

const mockNav = { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() };
const mockRoute = { params: { id: KURIGRAM_ID } };
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => mockNav,
    useRoute: () => mockRoute,
    useIsFocused: () => true,
  };
});

const mockUseAlertsResult = { data: MOCK_ALERTS, isLoading: false, refetch: jest.fn() };
function mockUseAlertByIdFn(id: string) {
  const alert = MOCK_ALERTS.find((a) => a.id === id) ?? null;
  return { alert, extras: alert ? getExtrasFor(alert.id) : null, isLoading: false };
}
jest.mock('../src/hooks/useAlerts', () => ({
  useAlerts: () => mockUseAlertsResult,
  useAlertById: (id: string) => mockUseAlertByIdFn(id),
  useAlertCounts: () => ({ total: MOCK_ALERTS.length, severe: 1, warning: 1, watch: 1 }),
}));

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return { Swipeable: ({ children }: any) => children, GestureHandlerRootView: View, RectButton: View, BaseButton: View };
});
jest.mock('@shopify/flash-list', () => {
  const R = require('react');
  const { FlatList } = require('react-native');
  return { FlashList: (p: any) => R.createElement(FlatList, { ...p, removeClippedSubviews: false }) };
});

describe('AlertDetailScreen states', () => {
  beforeEach(() => {
    mockNav.setOptions.mockClear();
    mockRoute.params.id = KURIGRAM_ID;
  });

  it('DetailSevere: Official instructions card renders first', async () => {
    render(<AlertDetailScreen />);
    await waitFor(() => expect(screen.getByText('Official instructions')).toBeTruthy());
    expect(screen.getByText(/Sources/i)).toBeTruthy();
  });

  it('DetailWarning: Cox\'s Bazar renders when route id is cox cyclone', async () => {
    mockRoute.params.id = COX_ID;
    render(<AlertDetailScreen />);
    await waitFor(() => expect(screen.getByText('Official instructions')).toBeTruthy());
  });

  it('DetailStale: missing id returns no alert (screen renders safely without crashing)', () => {
    mockRoute.params.id = 'non-existent';
    expect(() => render(<AlertDetailScreen />)).not.toThrow();
  });

  it('DetailAllClear: no-alert with no data renders without throwing', () => {
    mockRoute.params.id = 'asdf-missing';
    const { toJSON } = render(<AlertDetailScreen />);
    expect(toJSON()).toBeTruthy();
  });
});
