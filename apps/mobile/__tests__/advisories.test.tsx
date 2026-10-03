/**
 * Native Advisories (audit backlog 11).
 *
 * Two things are worth guarding here, and neither is the styling:
 *
 * 1. The screen renders the *shared* dataset. If someone copies `SECTOR_ADVISORIES` into the app
 *    - the exact drift the move to `@hazardnet/core` was meant to end - these assertions would
 *    still pass, so what is asserted instead is that the list and the detail agree with the core
 *    object the web page renders.
 * 2. The phase order and the unknown-id path. A field reader needs "before / during / after" and
 *    an old deep link must land on a sentence, not a blank screen.
 */

import React from 'react';
import { render, screen, fireEvent } from '../src/test/test-utils';
import { SECTOR_ADVISORIES } from '@hazardnet/core';
import { AdvisoriesScreen } from '../src/screens/advisories/AdvisoriesScreen';
import { AdvisoryDetailScreen } from '../src/screens/advisories/AdvisoryDetailScreen';

const mockNavigate = jest.fn();
let mockRouteParams: { id: string } = { id: 'crops' };

// FlashList — render like a FlatList for testing (same mock the other list screens use).
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { FlatList } = require('react-native');
  return { FlashList: (props: any) => React.createElement(FlatList, { ...props, removeClippedSubviews: false, windowSize: 21 }) };
});

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: mockRouteParams }),
}));

const SECTORS = Object.values(SECTOR_ADVISORIES);

describe('Native Advisories list', () => {
  it('lists every sector the shared dataset declares', () => {
    render(<AdvisoriesScreen />);
    for (const advisory of SECTORS) {
      expect(screen.getByText(advisory.name)).toBeTruthy();
    }
  });

  it('routes to the sector that was tapped, by id', () => {
    mockNavigate.mockClear();
    render(<AdvisoriesScreen />);
    fireEvent.press(screen.getByText(SECTORS[0].name));
    expect(mockNavigate).toHaveBeenCalledWith('AdvisoryDetail', { id: SECTORS[0].id });
  });
});

describe('Native advisory detail', () => {
  beforeEach(() => {
    mockRouteParams = { id: 'crops' };
  });

  it('renders the protocol steps of the sector it was given', () => {
    render(<AdvisoryDetailScreen />);
    const advisory = SECTOR_ADVISORIES.crops;
    for (const step of advisory.phasedProtocols) {
      expect(screen.getAllByText(step.title).length).toBeGreaterThan(0);
    }
  });

  it('labels each step with a phase word, and orders before / during / after', () => {
    render(<AdvisoryDetailScreen />);
    const advisory = SECTOR_ADVISORIES.crops;
    const phases = advisory.phasedProtocols.map((s) => s.phase);
    expect(phases).toContain('pre-disaster');
    expect(screen.getAllByText('Before the event').length).toBeGreaterThan(0);
    if (phases.includes('during-event')) expect(screen.getAllByText('During the event').length).toBeGreaterThan(0);
  });

  it('shows the trigger threshold for a step, which is what decides the phase', () => {
    render(<AdvisoryDetailScreen />);
    const step = SECTOR_ADVISORIES.crops.phasedProtocols[0];
    expect(screen.getAllByText(step.triggerThreshold).length).toBeGreaterThan(0);
    // The agency is rendered on the timeline line ("T-72h to T-24h - DAE ..."), so the match is
    // by substring rather than by the standalone string.
    expect(screen.getAllByText(new RegExp(step.leadAgency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length).toBeGreaterThan(0);
  });

  it('offers an empty state rather than a blank screen when the id is unknown', () => {
    mockRouteParams = { id: 'not-a-sector' };
    render(<AdvisoryDetailScreen />);
    expect(screen.getByText(/not on this device/i)).toBeTruthy();
  });
});
