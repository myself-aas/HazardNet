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
import { act, cleanup, render } from '@testing-library/react';
import HeroImageCarousel from '../HeroImageCarousel';
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
});
