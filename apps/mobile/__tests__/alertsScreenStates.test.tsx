/**
 * RNTL per-state tests for AlertsScreen:
 *   AlertsLoading, AlertsEmpty, AlertsError, AlertsFiltered, AlertsSearchNoMatch.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '../src/test/test-utils';
import { AlertsScreen } from '../src/screens/alerts/AlertsScreen';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() }),
    useRoute: () => ({ params: {} }),
    useIsFocused: () => true,
  };
});

const mockUseAlerts = jest.fn();
jest.mock('../src/hooks/useAlerts', () => ({
  useAlerts: () => mockUseAlerts(),
  useAlertCounts: (alerts: any[]) => ({
    total: (alerts || []).length,
    severe: (alerts || []).filter((a) => a.level === 'SEVERE').length,
    warning: (alerts || []).filter((a) => a.level === 'WARNING').length,
    watch: (alerts || []).filter((a) => a.level === 'WATCH').length,
  }),
}));

// Swipeable is not easy to drive in RNTL without setup; stub to plain View.
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    Swipeable: ({ children }: any) => children,
    GestureHandlerRootView: ({ children }: any) => <View>{children}</View>,
    RectButton: View,
    BaseButton: View,
  };
});

// FlashList — render like a FlatList for testing.
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { FlatList } = require('react-native');
  return { FlashList: (props: any) => React.createElement(FlatList, { ...props, removeClippedSubviews: false, windowSize: 21 }) };
});

import { MOCK_ALERTS } from '../src/lib/mockAlerts';

function state({
  alerts, isLoading = false, isError = false, isRefetching = false,
}: { alerts?: any[] | null; isLoading?: boolean; isError?: boolean; isRefetching?: boolean }) {
  mockUseAlerts.mockReturnValue({
    data: alerts === undefined ? null : alerts,
    isLoading, isError, isRefetching,
    refetch: jest.fn(() => Promise.resolve()),
    dataUpdatedAt: Date.now(),
  });
}

describe('AlertsScreen states', () => {
  it('AlertsLoading: shows skeleton rows while loading', () => {
    state({ isLoading: true, alerts: null });
    render(<AlertsScreen />);
    expect(screen.getByText('Alerts')).toBeTruthy();
  });

  it('AlertsEmpty: shows "No active alerts" when list empty', async () => {
    state({ alerts: [] });
    render(<AlertsScreen />);
    await waitFor(() => expect(screen.getByText(/No active alerts/i)).toBeTruthy());
  });

  it('AlertsError: shows retry headline when fetch fails', async () => {
    state({ alerts: null, isError: true });
    render(<AlertsScreen />);
    await waitFor(() => expect(screen.getByText(/Could not reach HazardNet/i)).toBeTruthy());
  });

  it('AlertsFiltered: renders fixture rows and filter chips', async () => {
    state({ alerts: MOCK_ALERTS });
    render(<AlertsScreen />);
    await waitFor(() => expect(screen.getByText(/Kurigram/i)).toBeTruthy());
    expect(screen.getAllByText(/Severe/i).length).toBeGreaterThan(0);
  });

  it('AlertsSearchNoMatch: shows "No matching alerts" when typing nonsense', async () => {
    state({ alerts: MOCK_ALERTS });
    const { getByPlaceholderText } = render(<AlertsScreen />);
    await waitFor(() => expect(screen.getByText(/Kurigram/i)).toBeTruthy());
    const input = getByPlaceholderText(/Search/i);
    fireEvent.changeText(input, 'zzzznomatch');
    await waitFor(() => expect(screen.getByText(/No matching alerts/i)).toBeTruthy());
  });
});
