/**
 * RNTL per-state tests for TodayScreen.
 */

import React from 'react';
import { render, screen, waitFor } from '../src/test/test-utils';
import { TodayScreen } from '../src/screens/today/TodayScreen';
import { MOCK_ALERTS } from '../src/lib/mockAlerts';

const mockNav = { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => mockNav,
    useRoute: () => ({ params: {} }),
    useIsFocused: () => true,
  };
});

const mockUseAlerts = jest.fn();
const mockUseAlertById = jest.fn(() => ({ alert: null, extras: null, isLoading: false }));
function mockCountsFor(alerts: any[]) {
  return {
    total: (alerts || []).length,
    severe: (alerts || []).filter((a) => a.level === 'SEVERE').length,
    warning: (alerts || []).filter((a) => a.level === 'WARNING').length,
    watch: (alerts || []).filter((a) => a.level === 'WATCH').length,
  };
}
jest.mock('../src/hooks/useAlerts', () => ({
  useAlerts: () => mockUseAlerts(),
  useAlertById: (id: string) => mockUseAlertById(id),
  useAlertCounts: mockCountsFor,
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

function state({ alerts, isLoading, isError = false, isRefetching = false }:
  { alerts?: any[] | null; isLoading?: boolean; isError?: boolean; isRefetching?: boolean }) {
  const loading = isLoading !== undefined ? isLoading : alerts === undefined;
  mockUseAlerts.mockReturnValue({
    data: alerts === undefined ? null : alerts,
    isLoading: loading,
    isError,
    isRefetching,
    isFetching: isRefetching || loading,
    refetch: jest.fn(() => Promise.resolve()),
    dataUpdatedAt: Date.now(),
  });
}

describe('TodayScreen states', () => {
  beforeEach(() => { mockNav.navigate.mockClear(); });

  it('TodayLoading: no primary CTA visible', () => {
    state({ isLoading: true });
    render(<TodayScreen />);
    expect(screen.queryByText(/See instructions/)).toBeNull();
    expect(screen.queryByText('All clear')).toBeNull();
  });

  it('TodaySevere: SEVERE short label + instructions CTA', async () => {
    state({ alerts: [MOCK_ALERTS[0]] });
    render(<TodayScreen />);
    await waitFor(() => expect(screen.getByText(/See instructions/)).toBeTruthy());
    expect(screen.getByText('Severe')).toBeTruthy();
  });

  it('TodayWarning: WARNING + instructions CTA', async () => {
    state({ alerts: [MOCK_ALERTS[1]] });
    render(<TodayScreen />);
    await waitFor(() => expect(screen.getByText(/See instructions/)).toBeTruthy());
    expect(screen.getByText('Warning')).toBeTruthy();
  });

  it('TodayWatch: Watch + View alert CTA', async () => {
    state({ alerts: [MOCK_ALERTS[2]] });
    render(<TodayScreen />);
    await waitFor(() => expect(screen.getByText(/View alert/)).toBeTruthy());
    expect(screen.getByText('Watch')).toBeTruthy();
  });

  it('TodayAllClear: shows "All clear"', async () => {
    state({ alerts: [] });
    render(<TodayScreen />);
    await waitFor(() => expect(screen.getByText('All clear')).toBeTruthy());
  });

  it('TodayError does not throw', () => {
    state({ alerts: null, isError: true });
    expect(() => render(<TodayScreen />)).not.toThrow();
  });
});
