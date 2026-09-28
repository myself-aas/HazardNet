/**
 * HeroImageCarousel — the hero's backdrop, a slow cross-fade across self-hosted frames.
 *
 * Two constraints shape this component and both come from real failures earlier in this
 * project's life:
 *
 *   - The slides are local files, served same-origin, so the hero makes zero remote
 *     requests. The E2E suite (`e2e/full-app-qa.spec.ts`) fails the build on any failing
 *     request on a covered route, which is exactly what ended the stock-video playlist.
 *
 *   - The slides are painted with CSS `background-image` on divs, **not** `<img>` tags.
 *     `frontend/src/pages/__tests__/FrontDoor.test.tsx` pins "carries no map and no
 *     image: the console stays at /live" by asserting the page has no `<img>` elements —
 *     imagery is meant to live at `/live`. The hero has always been allowed a non-`<img>`
 *     backdrop (the old `<video>`, then a `<canvas>`, and the poster is a CSS background),
 *     so a CSS-background carousel is consistent with that rule rather than a dodge of it.
 *
 * Motion discipline, matching the rest of this page:
 *   - `reducedMotion` draws a single static frame and never starts the timer; both the
 *     cross-fade and the slow zoom are off.
 *   - `paused` (the hero's pause control) freezes advancement but keeps the frame.
 *   - The zoom is a gentle scale on the active slide only, so it composites on the GPU.
 *
 * A missing file is caught by preloading each slide through an `Image` and dropping any
 * that errors, so a broken asset removes its slide instead of painting a blank.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { HERO_CAROUSEL_IMAGES } from '../lib/heroCarouselImages';

interface HeroImageCarouselProps {
  /** Freeze advancement; the current frame stays. */
  paused?: boolean;
  /** One static frame, no fade, no zoom, no timer. */
  reducedMotion?: boolean;
  /** How long each slide holds before the cross-fade. */
  intervalMs?: number;
  style?: React.CSSProperties;
}

const SLIDE_FADE_MS = 1600;

export const HeroImageCarousel: React.FC<HeroImageCarouselProps> = ({
  paused = false,
  reducedMotion = false,
  intervalMs = 8000,
  style,
}) => {
  const images = HERO_CAROUSEL_IMAGES;
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  const usable = useMemo(() => images.filter(({ src }) => !failed.has(src)), [images, failed]);

  /*
   * Preload every slide through an Image so a missing or broken file is known here and
   * its slide removed, rather than surfacing as a blank layer behind the copy.
   */
  useEffect(() => {
    for (const { src } of images) {
      const probe = new Image();
      probe.onerror = () => setFailed((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
      probe.src = src;
    }
  }, [images]);

  /*
   * Advance on a timer. Guarded so a hero with fewer than two usable slides, or one under
   * reduced motion / pause, never burns a timer.
   */
  useEffect(() => {
    if (reducedMotion || paused) return undefined;
    if (usable.length < 2) return undefined;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % images.length), intervalMs);
    return () => window.clearInterval(id);
  }, [paused, reducedMotion, intervalMs, images.length, usable.length]);

  /* If the active slide turns out to be a failed one, fall forward. */
  useEffect(() => {
    if (failed.has(images[index]?.src ?? '')) setIndex((i) => (i + 1) % images.length);
  }, [failed, images, index]);

  return (
    <div
      data-testid="hero-image-carousel"
      aria-hidden="true"
      role="presentation"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden', ...style }}
    >
      {images.map(({ src }, i) => {
        if (failed.has(src)) return null;
        const active = i === index;
        return (
          <div
            key={src}
            data-testid="hero-slide"
            data-src={src}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${src})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: active ? 1 : 0,
              // The active slide gets a slow push-in for the time it is on screen; the
              // rest sit at the base scale so a returning slide does not jump. Reduced
              // motion pins the scale and drops the transition entirely.
              transform: !reducedMotion && active ? 'scale(1.06)' : 'scale(1.0)',
              transition: reducedMotion
                ? 'none'
                : `opacity ${SLIDE_FADE_MS}ms ease-in-out, transform ${intervalMs + SLIDE_FADE_MS}ms linear`,
              willChange: !reducedMotion && active ? 'opacity, transform' : undefined,
            }}
          />
        );
      })}
    </div>
  );
};

export default HeroImageCarousel;
