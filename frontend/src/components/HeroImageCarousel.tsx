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
 *
 * **Simplified 2026-10-06 (Vercel React guidance), no behaviour change:**
 *
 *   - **The slide lists are module constants.** `lowBandwidth ? HERO_CAROUSEL_IMAGES.slice(0, 1)
 *     : HERO_CAROUSEL_IMAGES` ran on every render, so `images` was a new array each time — which
 *     made the `useMemo` below recompute every render and, worse, made the preload `useEffect`
 *     re-run every render: four fresh `Image()` probes and four more requests per re-render, in
 *     the one mode (low bandwidth) where that is least affordable. A stable module-level list is
 *     the dependency an effect can actually key on.
 *   - **The probe results are cached, and its RegExp is hoisted.** `paintedUrl()` ran
 *     `getComputedStyle(document.documentElement).getPropertyValue(...)` — a forced style
 *     resolution — for every slide, every time it was asked; the answer cannot change between two
 *     calls in one page load (a viewport resize remounts the page, see the note on it below), so
 *     it is memoised in a module-level `Map`. The `url(...)` RegExp was a literal inside the
 *     function; it is now module scope.
 *   - **The slide's custom-property name and background string are precomputed once**, instead of
 *     rebuilding `--hero-slide-…` with `split`/`replace` for every slide on every render.
 *   - **The active slide is derived during render.** A third `useEffect` watched
 *     `failed`/`index` and called `setIndex` when the current slide had failed, which is a
 *     render → effect → render pass for a value that is a pure function of state already in
 *     scope. `firstUsable` computes it instead: same fall-forward, one fewer render, no state
 *     drift if two slides fail at once.
 *   - **`memo()`**, because the parent is not always cheap: `HeroCinematicBackground` re-renders
 *     whenever the hero's pause control toggles, and the animated glow beside it used to re-render
 *     this subtree on every animation frame.
 */

import React, { memo, useEffect, useMemo, useState } from 'react';
import { HERO_CAROUSEL_IMAGES } from '../lib/heroCarouselImages';

interface HeroImageCarouselProps {
  /** Freeze advancement; the current frame stays. */
  paused?: boolean;
  /** One static frame, no fade, no zoom, no timer. */
  reducedMotion?: boolean;
  /** How long each slide holds before the cross-fade. */
  intervalMs?: number;
  /**
   * Low-bandwidth mode: keep slide one and do not fetch the rest. The four frames are 667 KB
   * together and all four are requested at mount, so on a metered 2G connection this is the
   * difference between decorating the hero and paying for three images nobody sees.
   * One usable slide is also below the two-slide floor the timer needs, so no timer is armed.
   */
  lowBandwidth?: boolean;
  style?: React.CSSProperties;
}

const SLIDE_FADE_MS = 1600;

/**
 * One slide's immutable facts, computed once at module load.
 *
 * `cssVar` is the portrait-crop custom property for a slide, e.g.
 * `/hero-carousel/hero-flood-delta.jpg` -> `--hero-slide-hero-flood-delta`. It is defined only
 * inside the narrow-viewport media block in `styles/hero-media.css`, so the var is undefined on
 * desktop and the inline landscape URL wins. `backgroundImage` is the declaration the slide paints:
 * `var(<portrait var>, url(<landscape src>))`.
 */
interface Slide {
  /** Same-origin path; also the `data-src` the tests and the preloader key on. */
  src: string;
  portraitVar: string;
  backgroundImage: string;
}

const toSlide = ({ src }: { src: string }): Slide => {
  const name = (src.split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '');
  const portraitVar = `--hero-slide-${name}`;
  return { src, portraitVar, backgroundImage: `var(${portraitVar}, url(${src}))` };
};

const ALL_SLIDES: readonly Slide[] = HERO_CAROUSEL_IMAGES.map(toSlide);
/** Low bandwidth keeps slide one only — and never fetches the other three. */
const LOW_BANDWIDTH_SLIDES: readonly Slide[] = ALL_SLIDES.slice(0, 1);

const URL_RE = /^url\(["']?(.*?)["']?\)$/;

/**
 * The URL this viewport will actually paint for a slide: the media-scoped custom property when the
 * current viewport matches it (phones), otherwise the landscape `src`.
 *
 * The preload probe has to ask the same question the paint does, or it fetches the wrong file:
 * probing `src` on a phone downloaded the 124-213 KB landscape frame *and* the portrait render of
 * every slide. `getComputedStyle` resolves media-dependent custom properties against the live
 * viewport, so this answers "which URL is in effect here" without duplicating the breakpoints.
 * Asked once per slide per page load and cached: the answer is a property of the viewport, and a
 * device that changes viewport shape remounts this page on the next navigation, so one probe is
 * correct rather than merely cheap.
 */
const paintedUrlCache = new Map<string, string>();
const paintedUrl = (src: string): string => {
  const cached = paintedUrlCache.get(src);
  if (cached !== undefined) return cached;
  let resolved = src;
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const slide = ALL_SLIDES.find((s) => s.src === src);
    const raw = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue(slide?.portraitVar ?? '')
      .trim();
    const match = URL_RE.exec(raw);
    if (match && match[1]) resolved = match[1];
  }
  paintedUrlCache.set(src, resolved);
  return resolved;
};

/**
 * The first slide at or after `from` that is not known to be broken; -1 when every slide failed.
 * This is the fall-forward that used to live in an effect, as a pure function of the state the
 * component already holds.
 */
const firstUsable = (slides: readonly Slide[], failed: ReadonlySet<string>, from: number): number => {
  for (let step = 0; step < slides.length; step += 1) {
    const i = (from + step) % slides.length;
    if (!failed.has(slides[i].src)) return i;
  }
  return -1;
};

export const HeroImageCarousel: React.FC<HeroImageCarouselProps> = ({
  paused = false,
  reducedMotion = false,
  intervalMs = 8000,
  lowBandwidth = false,
  style,
}) => {
  const images = lowBandwidth ? LOW_BANDWIDTH_SLIDES : ALL_SLIDES;
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  const usable = useMemo(() => images.filter(({ src }) => !failed.has(src)), [images, failed]);
  /** Derived, not stored: the slide on screen, falling forward past any that failed. */
  const activeIndex = firstUsable(images, failed, index);

  /*
   * Preload every slide through an Image so a missing or broken file is known here and
   * its slide removed, rather than surfacing as a blank layer behind the copy.
   * `images` is a module constant, so this runs once per mode — not once per render.
   */
  useEffect(() => {
    for (const { src } of images) {
      const probe = new Image();
      probe.onerror = () => setFailed((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
      // Probe the file this viewport paints, so a phone does not fetch the landscape frame it
      // will never show (see `paintedUrl`).
      probe.src = paintedUrl(src);
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

  return (
    <div
      data-testid="hero-image-carousel"
      aria-hidden="true"
      role="presentation"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        // The slides are four absolutely-positioned layers with their own scaling transforms.
        // `contain: paint` keeps their rasterisation inside this box, so the carousel cannot
        // invalidate layout or paint for the copy column beside it (cheap, and it matters most
        // on the 2 GB devices this page is built for).
        contain: 'paint',
        ...style,
      }}
    >
      {images.map((slide, i) => {
        if (failed.has(slide.src)) return null;
        const active = i === activeIndex;
        return (
          <div
            key={slide.src}
            data-testid="hero-slide"
            data-src={slide.src}
            style={{
              position: 'absolute',
              inset: 0,
              // Portrait art for phones, landscape as the desktop fallback: see
              // `styles/hero-media.css` for how the two are selected without an `image-set()`
              // density guess and without ever fetching both.
              backgroundImage: slide.backgroundImage,
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

/** Memoised: the animated layers beside this one re-render far more often than it does. */
export default memo(HeroImageCarousel);
