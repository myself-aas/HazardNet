/**
 * @jest-environment jsdom
 *
 * The hero backdrop as a self-hosted CSS-background carousel.
 *
 * Two properties are load-bearing:
 *   - Every slide is same-origin, because the E2E suite fails the build on any failing
 *     request on a covered route — the failure that ended the stock-video playlist.
 *   - The page keeps zero `<img>` elements. `FrontDoor.test.tsx` pins "carries no map and
 *     no image: the console stays at /live", and the established way to give the hero a
 *     backdrop without breaking that is a CSS-painted layer (the poster is one already).
 */

import '@testing-library/jest-dom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import HeroImageCarousel, { HeroImageCarousel as NamedHeroImageCarousel } from '../HeroImageCarousel';
import { HERO_CAROUSEL_IMAGES } from '../../lib/heroCarouselImages';

const slides = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-testid="hero-slide"]'));

const activeSlides = (container: HTMLElement): string[] =>
  slides(container)
    .filter((el) => el.style.opacity === '1')
    .map((el) => el.getAttribute('data-src') as string);

describe('<HeroImageCarousel />', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    cleanup();
  });

  it('paints every slide as a CSS background, never as an image element', () => {
    const { container } = render(<HeroImageCarousel reducedMotion />);
    expect(slides(container).length).toBe(HERO_CAROUSEL_IMAGES.length);
    // The whole point of using backgrounds: no <img> enters the front door.
    expect(container.querySelector('img')).toBeNull();
    for (const { src } of HERO_CAROUSEL_IMAGES) {
      expect(src.startsWith('/')).toBe(true); // never a remote URL
      const slide = container.querySelector(`[data-src="${src}"]`) as HTMLElement;
      expect(slide).not.toBeNull();
      expect(slide.style.backgroundImage).toContain(src);
    }
  });

  it('is decorative: hidden from assistive tech', () => {
    const { getByTestId } = render(<HeroImageCarousel reducedMotion />);
    expect(getByTestId('hero-image-carousel')).toHaveAttribute('aria-hidden', 'true');
  });

  it('under reduced motion shows one static slide and never advances', () => {
    const { container } = render(<HeroImageCarousel reducedMotion />);
    expect(activeSlides(container)).toEqual([HERO_CAROUSEL_IMAGES[0].src]);

    act(() => {
      jest.advanceTimersByTime(40_000);
    });
    expect(activeSlides(container)).toEqual([HERO_CAROUSEL_IMAGES[0].src]);
  });

  it('cross-fades to the next slide on the interval', () => {
    const { container } = render(<HeroImageCarousel reducedMotion={false} intervalMs={8000} />);
    expect(activeSlides(container)).toEqual([HERO_CAROUSEL_IMAGES[0].src]);

    act(() => {
      jest.advanceTimersByTime(8000);
    });
    expect(activeSlides(container)).toEqual([HERO_CAROUSEL_IMAGES[1].src]);

    act(() => {
      jest.advanceTimersByTime(8000);
    });
    expect(activeSlides(container)).toEqual([HERO_CAROUSEL_IMAGES[2].src]);
  });

  it('pausing freezes advancement', () => {
    const { container } = render(<HeroImageCarousel reducedMotion={false} paused intervalMs={8000} />);
    expect(activeSlides(container)).toEqual([HERO_CAROUSEL_IMAGES[0].src]);

    act(() => {
      jest.advanceTimersByTime(32_000);
    });
    expect(activeSlides(container)).toEqual([HERO_CAROUSEL_IMAGES[0].src]);
  });

  it('a failing slide is dropped instead of painting blank', () => {
    const bad = HERO_CAROUSEL_IMAGES[0].src;
    /* The preload Image reports the error synchronously, as a broken network would. */
    jest.spyOn(window, 'Image').mockImplementation((() => {
      const img: { onload: null | (() => void); onerror: null | (() => void); src: string } = {
        onload: null,
        onerror: null,
        src: '',
      };
      Object.defineProperty(img, 'src', {
        get() {
          return (this as { _src?: string })._src ?? '';
        },
        set(v: string) {
          (this as { _src?: string })._src = v;
          if (v === bad) img.onerror?.();
        },
      });
      return img;
    }) as unknown as (width?: number, height?: number) => HTMLImageElement);

    const { container } = render(<HeroImageCarousel reducedMotion={false} intervalMs={8000} />);

    expect(container.querySelector(`[data-src="${bad}"]`)).toBeNull();
    expect(slides(container).length).toBe(HERO_CAROUSEL_IMAGES.length - 1);
    // Something is still on screen.
    expect(activeSlides(container).length).toBe(1);
  });

  /* ── the 2026-10-06 simplifications, each pinned by the failure it prevents ─────────────── */

  it('falls forward past a failed slide without waiting for another render pass', () => {
    // Two broken files at once: the slides at index 0 and 1 are both gone before the first paint.
    const broken = new Set([HERO_CAROUSEL_IMAGES[0].src, HERO_CAROUSEL_IMAGES[1].src]);
    jest.spyOn(window, 'Image').mockImplementation((() => {
      const img = { onload: null, onerror: null, src: '' } as unknown as HTMLImageElement;
      Object.defineProperty(img, 'src', {
        get() {
          return '';
        },
        set(v: string) {
          if (broken.has(v)) img.onerror?.({} as Event);
        },
      });
      return img;
    }) as unknown as (width?: number, height?: number) => HTMLImageElement);

    const { container } = render(<HeroImageCarousel reducedMotion={false} intervalMs={8000} />);

    // Exactly one slide on screen, and it is the first usable one — not slide 0 (gone) and not a
    // blank frame while an effect catches up. `firstUsable` derives this during render.
    expect(activeSlides(container)).toEqual([HERO_CAROUSEL_IMAGES[2].src]);
    expect(container.querySelector('[data-src]')).not.toBeNull();
  });

  it('probes each slide once per mount, not once per render', () => {
    const probes: string[] = [];
    jest.spyOn(window, 'Image').mockImplementation((() => {
      const img = { onload: null, onerror: null, src: '' } as unknown as HTMLImageElement;
      Object.defineProperty(img, 'src', {
        get() {
          return '';
        },
        set(v: string) {
          probes.push(v);
        },
      });
      return img;
    }) as unknown as (width?: number, height?: number) => HTMLImageElement);

    const { rerender } = render(<HeroImageCarousel reducedMotion={false} intervalMs={8000} />);
    expect(probes).toHaveLength(HERO_CAROUSEL_IMAGES.length);

    // A new render with different props used to re-run the preload effect, because `images` was
    // rebuilt by `.slice()` on every pass: four fresh `Image()` probes and four more network
    // requests per re-render, in low-bandwidth mode of all places. The slide list is a module
    // constant now, so the effect's dependency is stable.
    rerender(<HeroImageCarousel reducedMotion={false} intervalMs={8000} paused />);
    rerender(<HeroImageCarousel reducedMotion={false} intervalMs={8000} />);
    expect(probes).toHaveLength(HERO_CAROUSEL_IMAGES.length);
  });

  it('resolves a slide’s painted URL once for the page load, not once per mount', () => {
    // `paintedUrl` reads a media-scoped custom property via `getComputedStyle`, which forces style
    // resolution; the answer is a property of the viewport, so a module-level cache answers later
    // asks without touching the DOM. The mount below is the one that pays; every mount after it —
    // and this file mounts the carousel several times — must be free.
    const warmUp = render(<HeroImageCarousel reducedMotion />);
    warmUp.unmount();

    const spy = jest.spyOn(window, 'getComputedStyle');
    const { rerender, unmount } = render(<HeroImageCarousel reducedMotion />);
    rerender(<HeroImageCarousel reducedMotion paused />);
    unmount();

    expect(spy.mock.calls).toHaveLength(0);
  });

  it('is memoised, so a parent re-render with equal props stops at the boundary', () => {
    // `React.memo` marks its result with a well-known symbol; a plain function component has none.
    // Asserted structurally because the spy route is closed here: the TS transform copies named
    // imports off the `react` namespace object at load time, so a `jest.spyOn(React, 'useMemo')`
    // installed later never sees the component's call. The behavioural half of this guard — the
    // frame loop re-rendering the backdrop without touching the carousel — lives in
    // `HeroCinematicBackground.renders.test.tsx`, which fails if the boundary is removed.
    const exported = HeroImageCarousel as unknown as { $$typeof?: symbol; type?: unknown };
    expect(exported.$$typeof).toBe(Symbol.for('react.memo'));
    // …and the memo wraps the real component, not a stub that lost its behaviour.
    expect(typeof exported.type).toBe('function');
    // The named export stays the unwrapped component, which is what every other test renders.
    expect(NamedHeroImageCarousel).not.toBe(HeroImageCarousel);
    expect(typeof NamedHeroImageCarousel).toBe('function');
  });
});
