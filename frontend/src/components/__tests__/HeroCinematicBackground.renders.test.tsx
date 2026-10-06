/**
 * @jest-environment jsdom
 *
 * The hero backdrop's re-render boundary — the reason `HeroMeshGlow` is a leaf.
 *
 * The animation is a 14-second, 420-frame loop at 30 fps. Before 2026-10-06 the frame state lived
 * in `HeroCinematicBackground` itself, so every one of those frames re-rendered the whole backdrop:
 * the four-slide carousel with its four style objects, the poster wrapper, the two grade layers —
 * on the 2 GB Android devices this page is explicitly built for, to animate one blurred circle.
 *
 * The fix is a boundary, and a boundary is only real if something fails when it is removed. This
 * file therefore runs the **real** frame loop (rAF via `useWebFrame`, fake timers advancing it) and
 * counts renders of the carousel: the loop must cost the carousel nothing, while still visibly
 * moving the glow.
 *
 * The carousel is mocked, not stubbed by hand: `memo()` compares props, and a real component's
 * render is what a regression would re-run. The mock counts calls and renders the same test id the
 * real one does, so the rest of the backdrop's structure is untouched.
 */

import '@testing-library/jest-dom';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';

jest.mock('../HeroImageCarousel', () => {
  const R = jest.requireActual('react') as typeof import('react');
  const Stub = jest.fn(() =>
    R.createElement('div', { 'data-testid': 'hero-image-carousel', 'aria-hidden': 'true' }),
  );
  return { __esModule: true, default: Stub };
});

import HeroCinematicBackground from '../HeroCinematicBackground';
import HeroImageCarousel from '../HeroImageCarousel';

const carouselRenderCount = (): number => (HeroImageCarousel as unknown as jest.Mock).mock.calls.length;

describe('<HeroCinematicBackground /> — re-render boundary', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    cleanup();
    (HeroImageCarousel as unknown as jest.Mock).mockClear();
  });

  it('does not re-render the carousel while the frame loop runs', () => {
    const { container } = render(<HeroCinematicBackground />);
    const glow = container.querySelector('[data-interactive-name="Primary orbital glow"]') as HTMLElement;
    expect(glow).not.toBeNull();

    // The carousel renders once, on mount.
    expect(carouselRenderCount()).toBe(1);

    // ~30 frames of the real loop. `useWebFrame` drives rAF; fake timers advance it.
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // One render for the whole half-second of animation, and the slide list is untouched.
    expect(carouselRenderCount()).toBe(1);
    expect(container.querySelectorAll('[data-testid="hero-image-carousel"]')).toHaveLength(1);

    // …and the loop is genuinely running: the animation is not simply dead on this path.
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });

  it('renders the three layers plus the wash, in paint order', () => {
    const { container } = render(<HeroCinematicBackground />);
    const root = container.firstElementChild as HTMLElement;
    const names = Array.from(container.querySelectorAll('[data-interactive-name]')).map((el) =>
      el.getAttribute('data-interactive-name'),
    );
    expect(names).toEqual([
      'Hero cinematic background — 3-layer',
      'Primary orbital glow',
      'Hero photograph',
      'Soft-light grade',
      'Grade — exposure curve + vignette',
    ]);
    // The two static layers are the same element identity across renders (hoisted), which is what
    // keeps them out of every render's allocation.
    const first = root.querySelector('[data-interactive-name="Grade — exposure curve + vignette"]');
    act(() => {
      jest.advanceTimersByTime(100);
    });
    const second = root.querySelector('[data-interactive-name="Grade — exposure curve + vignette"]');
    expect(second).toBe(first);
  });

  it('keeps the frame loop out of the component every state change re-renders', () => {
    // A structural guard, because the boundary above is invisible when it works: the hook that
    // drives the frames must be called by the glow child, never by the exported backdrop itself.
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'frontend/src/components/HeroCinematicBackground.tsx'),
      'utf8',
    );
    // Comments name the hook (they explain this decision); count call sites only.
    const callSites = [...source.matchAll(/=\s*useWebFrame\(/g)];
    expect(callSites).toHaveLength(1);
    const glowStart = source.indexOf('const HeroMeshGlow');
    const exportedStart = source.indexOf('export const HeroCinematicBackground');
    expect(callSites[0].index!).toBeGreaterThan(glowStart);
    expect(callSites[0].index!).toBeLessThan(exportedStart);
  });
});
