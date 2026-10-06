import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock Remotion frame hooks for unit testing.
//
// `Interactive` is flattened to a plain div here: the real one reads the studio's frame state
// through `useCurrentFrame` internally, which throws outside a registered composition. The
// passthrough keeps the two things a test cares about - the descriptive `name` and the inline
// `style` - so a composition that uses it can be rendered and inspected in jsdom.
jest.mock('remotion', () => {
  const original = jest.requireActual('remotion');
  const React = jest.requireActual('react');
  const passthrough = (tag) =>
    function Interactive({ name, children, ...rest }) {
      return React.createElement(tag, { 'data-interactive-name': name, ...rest }, children);
    };
  return {
    ...original,
    useCurrentFrame: () => 15,
    useVideoConfig: () => ({ fps: 30, durationInFrames: 150, width: 1080, height: 1920 }),
    Interactive: {
      Div: passthrough('div'),
      Span: passthrough('span'),
      Section: passthrough('section'),
      Header: passthrough('header'),
    },
  };
});

import { HazardAlertStory } from '../frontend/src/remotion/compositions/HazardAlertStory';
import { RemotionRoot } from '../frontend/src/remotion/Root';
import { HeroCinematicBackground } from '../frontend/src/components/HeroCinematicBackground';
import { HeroComposition } from '../frontend/src/remotion/compositions/HeroComposition';
import { HERO_GRADE } from '../frontend/src/lib/heroGrade';

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

  describe('<HeroComposition /> (the 16:9 export of the web hero)', () => {
    test('prints no telemetry the repository cannot support', () => {
      // H-P0-1 of docs/audits/2026-10-03-landing-live-hero-audit.md, in the artifact that
      // leaves the building as an MP4: "GEO-SYNC · 23°42'N 90°22'E · APEX 35,786 KM" and
      // "OPTICAL SENSOR STREAM · 30 FPS · RES-ADAPTIVE" were readouts of a satellite the
      // project does not operate, over a page whose argument is that every number traces to a
      // published record. The web hero deleted them on 2026-10-05; the composition kept
      // painting a hero that no longer existed until this test.
      const { container } = render(<HeroComposition />);
      const text = container.textContent ?? '';
      for (const gone of ['GEO-SYNC', 'APEX', 'OPTICAL SENSOR STREAM', 'RES-ADAPTIVE', '23°42', '35,786']) {
        expect(text).not.toContain(gone);
      }
      // "Verified artifacts" was a claim about a verification step the repository does not
      // document; the sub-line states the provenance rule instead.
      expect(text).not.toContain('Verified artifacts');
      expect(text).toContain('Every number traces to a file');
    });

    test('carries the web hero\'s layers, its grade, and the front door\'s own words', () => {
      const { container } = render(<HeroComposition />);
      // The composition mirrors components/HeroCinematicBackground.tsx: mesh, photograph/title and
      // the grade — with the HUD cluster, the second glow and the grain deleted from both. Exact
      // equality on purpose: a fifth node is a fifth layer, and the export has drifted that way
      // before. The exposure curve and the vignette are one node since 2026-10-06, as on the page.
      const names = Array.from(container.querySelectorAll('[data-interactive-name]')).map((el) =>
        el.getAttribute('data-interactive-name')
      );
      expect(names).toEqual([
        'Primary orbital glow',
        'Hero title',
        'Cinematic soft-light grade',
        'Grade — exposure curve + vignette',
      ]);
      for (const gone of ['Secondary cyan reflection', 'HUD telemetry GEO-SYNC', 'HUD optical stream', 'Reticle TL', 'Reticle TR']) {
        expect(names).not.toContain(gone);
      }
      // The grade is the page's grade, read from `lib/heroGrade.ts` rather than typed in here —
      // this is the assertion that keeps the MP4 and the page from drifting apart.
      const wash = container.querySelector('[data-interactive-name="Cinematic soft-light grade"]');
      expect((wash.getAttribute('style') ?? '').replace(/\s+/g, '')).toContain(
        HERO_GRADE.gradeWash.replace(/\s+/g, ''),
      );
      // The default headline is the front door's h1 (`content/site-routes.json`), not a slogan.
      expect(container.textContent).toContain('A forecast you can check, not just read');
    });
  });

  describe('<RemotionRoot />', () => {
    test('renders Remotion compositions tree without throwing', () => {
      const { container } = render(<RemotionRoot />);
      expect(container).toBeDefined();
    });
  });

  describe('<HeroCinematicBackground />', () => {
    test('is three layers of backdrop and no telemetry HUD', () => {
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

      // The layers that remain are the ones that do something: the mesh, the photograph and the
      // grade. Named through `Interactive`, so the names are the contract — and the list is exact,
      // because "four layers" is how the backdrop got to nine nodes in the first place. Since
      // 2026-10-06 the mesh's clipping wrapper is gone (the root clips) and the exposure curve and
      // the vignette share one node, so this is the root, four nodes, and nothing else.
      const names = Array.from(container.querySelectorAll('[data-interactive-name]')).map((el) =>
        el.getAttribute('data-interactive-name')
      );
      expect(names).toEqual([
        'Hero cinematic background — 3-layer',
        'Primary orbital glow',
        'Hero photograph',
        'Soft-light grade',
        'Grade — exposure curve + vignette',
      ]);
      // And none of the deleted three come back by accident.
      for (const gone of ['Telemetry HUD container', 'Reticle top-left', 'Horizon reference line', 'Film grain — SVG fractal noise', 'Secondary cyan reflection']) {
        expect(names).not.toContain(gone);
      }
    });
  });
});
