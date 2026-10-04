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
    test('is four layers of backdrop and no telemetry HUD', () => {
      const { container } = render(<HeroCinematicBackground paused={true} />);

      // The decorative HUD cluster - four corner reticles, a horizon rule and a `hero-hud`
      // test id - was deleted on 2026-10-05 (docs/audits/2026-10-03-landing-live-hero-audit.md
      // §4 lists it as "delete before the port"; it printed nothing, so deleting it costs the
      // reader nothing). The layer test id went with it: a test id whose whole job is to prove
      // decoration exists is the decoration's last tether.
      expect(container.querySelector('[data-testid="hero-hud"]')).toBeNull();

      // What it used to print: "GEO-SYNC · 23°42'N 90°22'E · APEX 35,786 KM" and an
      // "OPTICAL SENSOR STREAM · 30 FPS · RES-ADAPTIVE" readout. Nothing in the repository
      // produces either value. An earlier version of this test asserted them - it pinned the
      // defect; this one pins their absence, in every layer that is left.
      expect(screen.queryByText(/GEO-SYNC/i)).toBeNull();
      expect(screen.queryByText(/OPTICAL SENSOR STREAM/i)).toBeNull();
      expect(screen.queryByText(/APEX/i)).toBeNull();
      expect(screen.queryByText(/RES-ADAPTIVE/i)).toBeNull();

      // The layers that remain are the ones that do something: the mesh, the photograph, the
      // grade and the vignette. Named through `Interactive`, so the names are the contract.
      const names = Array.from(container.querySelectorAll('[data-interactive-name]')).map((el) =>
        el.getAttribute('data-interactive-name')
      );
      expect(names).toEqual(
        expect.arrayContaining(['Hero cinematic background — 4-layer', 'BgMesh container', 'Hero photograph', 'Vignette — dual-zone elliptical'])
      );
      // And none of the deleted three come back by accident.
      for (const gone of ['Telemetry HUD container', 'Reticle top-left', 'Horizon reference line', 'Film grain — SVG fractal noise', 'Secondary cyan reflection']) {
        expect(names).not.toContain(gone);
      }
    });
  });
});
