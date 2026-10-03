/**
 * Phase 5 Map & Saved — smoke tests. Async initialization (AsyncStorage +
 * expo-location permission check) is flushed via waitFor.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '../src/test/test-utils';
import { MapScreen } from '../src/screens/map/MapScreen';
import { SavedScreen } from '../src/screens/saved/SavedScreen';

describe('Phase 5 Map', () => {
  it('renders the legend and one labelled control for the map tools', async () => {
    render(<MapScreen />);
    await waitFor(() => expect(screen.getByText('Severe')).toBeTruthy());
    expect(screen.getByText('Warning')).toBeTruthy();
    // Backlog 8: the glyph buttons became one labelled control, and the rows behind it are
    // labelled too, so nothing about the map is explained only by a tooltip or an icon.
    expect(screen.getByText('Map layers')).toBeTruthy();
  });

  it('opens the tools sheet with labelled rows and working layer switches', async () => {
    render(<MapScreen />);
    await waitFor(() => expect(screen.getByText('Map layers')).toBeTruthy());
    fireEvent.press(screen.getByText('Map layers'));
    await waitFor(() => expect(screen.getByText('Division boundaries')).toBeTruthy());
    expect(screen.getByText('Alert markers')).toBeTruthy();
    // The recenter row states the current state rather than showing a glyph.
    expect(screen.getByText(/Recenter on my location|Following your location|Location permission is off|Finding your location/)).toBeTruthy();

    const boundaries = screen.getByLabelText('Show division boundaries');
    expect(boundaries.props.value).toBe(true);
    fireEvent(boundaries, 'valueChange', false);
    await waitFor(() => expect(screen.getByLabelText('Show division boundaries').props.value).toBe(false));
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
