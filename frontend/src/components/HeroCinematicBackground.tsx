/**
 * HeroCinematicBackground — the hero's backdrop, four layers, one loop.
 *
 *   1. the mesh         one brand-blue orbital glow, breathing on a slow sine
 *   2. the photograph   the self-hosted carousel, cross-fading (see HeroImageCarousel)
 *   3. the grade        soft-light wash + exposure curve, which is what makes white type readable
 *   4. the vignette     an ellipse that pulls the eye to the middle
 *
 * **Simplified 2026-10-05.** This was a five-layer build with nine nodes. Three of them are gone:
 *
 *   · the telemetry HUD (four corner reticles and a horizon rule) — pure decoration that the
 *     landing-page audit listed as "delete before the port" (`docs/audits/2026-10-03-landing-live-hero-audit.md`
 *     §4). It was `aria-hidden` and printed no invented numbers any more, which is why it survived
 *     this long; deleting it costs nothing and removes 150 lines of positioning that had to be
 *     re-checked on every viewport.
 *   · the procedural film grain (an SVG `feTurbulence` data URI at 0.04 opacity) — a full-bleed
 *     filter layer for a texture nobody can see, on devices the page is explicitly built for
 *     (2 GB Android, §2 of the same audit).
 *   · the second mesh blob (a cyan 900x900 at 100px blur) — two blurred blobs for one brand hue
 *     was a second thing to keep in step; the blue glow carries the identity on its own.
 *
 * What is left is four layers and six nodes, and the composition reads the same: a blue-lit
 * photograph, graded down, vignetted, with a photograph and copy on top.
 *
 * Strictly follows https://github.com/remotion-dev/remotion/blob/main/packages/docs/docs/studio/interactivity-best-practices.mdx
 * - Interactive elements have descriptive name
 * - All CSS styles inline, plain object, no spreading, no constants, no math outside interpolate
 * - Animate via interpolate(frame, [...], [...], {easing, extrapolateLeft/Right, output}) inline, hardcoded
 * - Use scale / translate / rotate (never transform)
 * - Effects inline, hardcoded; composition metadata inline in Root.tsx
 * - Respects prefers-reduced-motion, paused, test — no animation drain
 *
 * Performance: GPU-only (scale, translate, opacity), will-change only on animating layers,
 * 60fps rAF via useWebFrame, LazyMotion domAnimation in App.tsx.
 */

import React from 'react';
import { useReducedMotion } from 'framer-motion';
import { EARTH_HERO_POSTER_CSS } from '../lib/heroMedia';
import HeroImageCarousel from './HeroImageCarousel';
import { Interactive } from './interactive/Interactive';
import { useWebFrame, useWebVideoConfig, interpolate, Easing } from '../lib/motion-interpolate';
import { readLowBandwidth } from '../lib/bandwidth';

export const HeroCinematicBackground: React.FC<{ paused?: boolean }> = ({ paused = false }) => {
  const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
  const reduceMotion = useReducedMotion();
  /*
   * Low-bandwidth mode is a document-level decision (`html[data-low-bandwidth='true']`, written
   * by `main.tsx` before first paint and kept in sync by `useBandwidthMode`). The CSS side of it
   * already zeroes durations and drops every `backdrop-filter`, but the frame loop and the
   * carousel timer are JavaScript and CSS cannot stop them - this read is what stops them.
   * Reading the attribute at render keeps this component free of a hook dependency, and
   * mount-time is enough: the only writer on this route is boot, and arriving from `/live`
   * remounts this component.
   */
  const lowBandwidth = readLowBandwidth();
  const shouldAnimate = !reduceMotion && !paused && !isTest && !lowBandwidth;
  const frame = useWebFrame(30, 420);
  const { fps } = useWebVideoConfig();

  return (
    <Interactive.Div
      name="Hero cinematic background — 4-layer"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        userSelect: 'none',
        backgroundColor: 'var(--color-carbon-90)',
      }}
    >
      {/* ── Layer 1: Background Mesh (BgMesh) ────────────────────────── */}
      <Interactive.Div
        name="BgMesh container"
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
        }}
      >
        {/* Brand blue orbital glow — breathing scale + translate drift */}
        <Interactive.Div
          name="Primary orbital glow"
          style={{
            position: 'absolute',
            top: '-25%',
            left: '-15%',
            width: 1100,
            height: 1100,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #1c67e355 0%, #0f3a7a22 50%, transparent 70%)',
            opacity: shouldAnimate
              ? interpolate(frame, [0, fps * 4, fps * 8], [0.35, 0.45, 0.35], {
                  easing: Easing.bezier(0.4, 0, 0.2, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : 0.4,
            scale: shouldAnimate
              ? interpolate(frame, [0, fps * 7, fps * 14], [1, 1.04, 1], {
                  easing: Easing.bezier(0.65, 0, 0.35, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  output: 'perceptual-scale',
                })
              : 1,
            translate: shouldAnimate
              ? interpolate(frame, [0, fps * 9], ['0px 0px', '0px -10px'], {
                  easing: Easing.bezier(0.4, 0, 0.2, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : '0px 0px',
            filter: 'blur(var(--hero-glow-blur-primary))',
            willChange: shouldAnimate ? 'transform, opacity' : undefined,
          }}
        />
      </Interactive.Div>

      {/* ── Layer 2: the photograph ────────────────────────────────────
             Contextual image carousel, cross-fading local frames. Replaces the stock-video
             playlist and the procedural canvas. The slides are self-hosted files, so the hero
             makes zero remote requests — the gate that killed both previous backdrops. See
             lib/heroCarouselImages.ts for the reasoning and the note on licensing.

             The wrapper used to carry its own breathing `scale` on top of the carousel's
             per-slide zoom: two transforms animating the same pixels at two rates. Gone; the
             carousel's own slow push-in is the motion.

             Under reduced motion the carousel collapses to a single static frame. ── */}
      <Interactive.Div
        name="Hero photograph"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          // Painted *behind* the carousel. If every image were missing, this keeps the
          // hero on the Earth scene rather than the container's near-black fill — the
          // silent-blank failure this layer has had twice before.
          //
          // Must be the CSS-encoded form: the attribute form of this data URI contains
          // quotes and newlines, which make the browser reject the declaration outright.
          backgroundImage: `url("${EARTH_HERO_POSTER_CSS}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <HeroImageCarousel paused={paused} reducedMotion={!!reduceMotion || isTest} lowBandwidth={lowBandwidth} />
      </Interactive.Div>

      {/* ── Layer 3: Cinematic Color Grade Overlay (Grade) ──────────── */}
      <Interactive.Div
        name="Soft-light grade"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 3,
          pointerEvents: 'none',
          backgroundColor: '#0f3a7a',
          opacity: 0.2,
          mixBlendMode: 'soft-light',
        }}
      />
      <Interactive.Div
        name="Exposure curve"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 4,
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(5,7,14,0.18) 32%, rgba(5,7,14,0.68) 72%, rgba(5,7,14,0.92) 100%)',
        }}
      />

      {/* ── Layer 4: Vignette ────────────────────────────────────────── */}
      <Interactive.Div
        name="Vignette — dual-zone elliptical"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 6,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse at center, transparent 38%, rgba(5,7,14,0.55) 75%, rgba(5,7,14,0.95) 100%)',
        }}
      />
    </Interactive.Div>
  );
};

export default HeroCinematicBackground;
