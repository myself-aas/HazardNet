/**
 * Phase 5 Map & Saved — smoke tests. Async initialization (AsyncStorage +
 * expo-location permission check) is flushed via waitFor.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '../src/test/test-utils';
import { MapScreen } from '../src/screens/map/MapScreen';
import { SavedScreen } from '../src/screens/saved/SavedScreen';

describe('Phase 5 Map', () => {
  it('renders legend and recenter button', async () => {
    render(<MapScreen />);
    await waitFor(() => expect(screen.getByText('Severe')).toBeTruthy());
    expect(screen.getByText('Warning')).toBeTruthy();
    // Recenter or denied-state recenter button is present:
    const recenter = screen.getByLabelText(/Recenter|Location permission denied/i);
    expect(recenter).toBeTruthy();
    expect(screen.getByLabelText('Layer controls')).toBeTruthy();
  });
});

describe('Phase 5 Saved Places', () => {
  it('shows empty state', async () => {
    render(<SavedScreen />);
    await waitFor(() => expect(screen.getByText('Add your first place')).toBeTruthy());
    expect(screen.getByText(/Saved places/i)).toBeTruthy();
  });

  it('clicking Add your first place seeds Home', async () => {
    render(<SavedScreen />);
    await waitFor(() => expect(screen.getByText('Add your first place')).toBeTruthy());
    fireEvent.press(screen.getByText('Add your first place'));
    await waitFor(() => expect(screen.getByText('Home')).toBeTruthy());
  });
});
