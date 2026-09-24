/**
 * Shared render wrapper for RNTL component tests.
 * Wraps screens in QueryClient + Theme + SafeAreaProvider + NavigationContainer
 * so useNavigation/useRoute/useQuery/useTheme all resolve.
 */

import React from 'react';
import { render as rtlRender } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { SavedPlacesProvider } from '../../src/hooks/useSavedPlaces';

export function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

export function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeTestQueryClient()}>
      <ThemeProvider>
        <SavedPlacesProvider>
          <SafeAreaProvider initialMetrics={{
            frame: { x: 0, y: 0, width: 390, height: 844 },
            insets: { top: 47, left: 0, right: 0, bottom: 34 },
          }}>
            <NavigationContainer>
              {children}
            </NavigationContainer>
          </SafeAreaProvider>
        </SavedPlacesProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export function render(ui: React.ReactElement, options: any = {}) {
  return rtlRender(ui, { wrapper: AllProviders, ...options });
}

export { screen, fireEvent, within, waitFor, act, userEvent } from '@testing-library/react-native';
