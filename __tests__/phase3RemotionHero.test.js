import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock Remotion frame hooks for unit testing
jest.mock('remotion', () => {
  const original = jest.requireActual('remotion');
  return {
    ...original,
    useCurrentFrame: () => 15,
    useVideoConfig: () => ({ fps: 30, durationInFrames: 150, width: 1080, height: 1920 }),
  };
});

import { HazardAlertStory } from '../frontend/src/remotion/compositions/HazardAlertStory';
import { RemotionRoot } from '../frontend/src/remotion/Root';
import { HeroCinematicBackground } from '../frontend/src/components/HeroCinematicBackground';

describe('Phase 3 Remotion Hazard Video & Atmospheric Hero', () => {
  describe('<HazardAlertStory />', () => {
    test('renders district warning story text and severity score', () => {
      render(
        <HazardAlertStory
          district="Sylhet"
          hazardType="Flash Flood Early Warning"
          severityScore={0.88}
          date="2026-09-22"
          affectedPeopleText="42,000+ Households At Risk"
        />
      );

      expect(screen.getByText('Sylhet District')).toBeInTheDocument();
      expect(screen.getByText('Flash Flood Early Warning')).toBeInTheDocument();
      expect(screen.getByText('88')).toBeInTheDocument();
      expect(screen.getByText('42,000+ Households At Risk')).toBeInTheDocument();
      expect(screen.getByText('CRITICAL EMERGENCY')).toBeInTheDocument();
    });

    test('renders advisory badge for moderate severity scores', () => {
      render(
        <HazardAlertStory
          district="Rajshahi"
          hazardType="Drought Watch"
          severityScore={0.4}
          date="2026-09-22"
        />
      );

      expect(screen.getByText('Rajshahi District')).toBeInTheDocument();
      expect(screen.getByText('40')).toBeInTheDocument();
      expect(screen.getByText('ADVISORY')).toBeInTheDocument();
    });
  });

  describe('<RemotionRoot />', () => {
    test('renders Remotion compositions tree without throwing', () => {
      const { container } = render(<RemotionRoot />);
      expect(container).toBeDefined();
    });
  });

  describe('<HeroCinematicBackground />', () => {
    test('renders atmospheric hero container with telemetry labels', () => {
      render(<HeroCinematicBackground paused={true} />);

      expect(screen.getByText(/GEO-SYNC/i)).toBeInTheDocument();
      expect(screen.getByText(/OPTICAL SENSOR STREAM/i)).toBeInTheDocument();
    });
  });
});
