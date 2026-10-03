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
    test('keeps its decorative HUD hidden and prints no telemetry it cannot support', () => {
      const { container } = render(<HeroCinematicBackground paused={true} />);

      const hud = container.querySelector('[data-testid="hero-hud"]');
      expect(hud).not.toBeNull();
      expect(hud).toHaveAttribute('aria-hidden', 'true');

      // This layer used to render "GEO-SYNC · 23°42'N 90°22'E · APEX 35,786 KM" and an
      // "OPTICAL SENSOR STREAM · 30 FPS · RES-ADAPTIVE" readout. Nothing in the repository
      // produces either value, and this test used to assert them - it pinned the defect. The
      // strings are gone rather than restyled, so a screen reader meets the headline first.
      expect(screen.queryByText(/GEO-SYNC/i)).toBeNull();
      expect(screen.queryByText(/OPTICAL SENSOR STREAM/i)).toBeNull();
      expect(screen.queryByText(/APEX/i)).toBeNull();
      expect(screen.queryByText(/RES-ADAPTIVE/i)).toBeNull();
    });
  });
});
