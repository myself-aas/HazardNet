/**
 * HeroCinematicBackground — the hero's backdrop, three layers and no loop of its own.
 *
 *   1. the photograph   the self-hosted carousel, cross-fading (see HeroImageCarousel)
 *   2. the grade        soft-light wash + exposure curve, which is what makes white type readable
 *   3. the vignette     an ellipse that pulls the eye to the middle
 *
 * **Distilled 2026-10-28.** The animated orbital-glow mesh that used to sit behind the
 * photograph is gone. It cost a 420-frame `useWebFrame` loop and a large blurred layer, but
 * the opaque poster/carousel above it covered the whole hero, so in the normal render the
 * loop animated a layer the reader could not see. The carousel's own cross-fade and slow
 * push-in are now the hero's only motion; this component just composes still surfaces.
 *
 * Earlier simplification (2026-10-05) had already removed the telemetry HUD, procedural film
 * grain and second mesh blob. What remains each has a job: show the illustrative scene, make
 * the copy legible over it, and keep the edges from competing with the claim.
 */

import React from 'react';
import { useReducedMotion } from 'framer-motion';
import { EARTH_HERO_POSTER_CSS } from '../lib/heroMedia';
import HeroImageCarousel from './HeroImageCarousel';
import { Interactive } from './interactive/Interactive';
import { readLowBandwidth } from '../lib/bandwidth';

export const HeroCinematicBackground: React.FC<{ paused?: boolean }> = ({ paused = false }) => {
  const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
  const reduceMotion = useReducedMotion();
  /*
   * Low-bandwidth mode is a document-level decision (`html[data-low-bandwidth='true']`, written
   * by `main.tsx` before first paint and kept in sync by `useBandwidthMode`). CSS already
   * zeroes durations and drops backdrop filters; this read is what tells the carousel to keep
   * only its first frame. Reading the attribute at render keeps this component free of a
   * hook dependency, and mount-time is enough: arriving from another route remounts it.
   */
  const lowBandwidth = readLowBandwidth();

  return (
    <Interactive.Div
      name="Hero cinematic background — 3-layer"
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
      {/* ── Layer 1: the photograph ──────────────────────────────────────
          Contextual image carousel, cross-fading local frames. The slides are self-hosted
          files, so the hero makes zero remote requests. The poster behind the carousel keeps
          the hero on the Earth scene if every carousel file were missing, rather than
          falling back to the container's near-black fill. Under reduced motion the carousel
          collapses to a single static frame. */}
      <Interactive.Div
        name="Hero photograph"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          // Must be the CSS-encoded form: the attribute form of this data URI contains
          // quotes and newlines, which make the browser reject the declaration outright.
          backgroundImage: `url("${EARTH_HERO_POSTER_CSS}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <HeroImageCarousel paused={paused} reducedMotion={!!reduceMotion || isTest} lowBandwidth={lowBandwidth} />
      </Interactive.Div>

      {/* ── Layer 2: Cinematic Color Grade Overlay (Grade) ───────────── */}
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

      {/* ── Layer 3: Vignette ─────────────────────────────────────────── */}
      <Interactive.Div
        name="Vignette — dual-zone elliptical"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 6,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse at center, transparent 38%, color-mix(in srgb, var(--ap-black) 55%, transparent) 75%, color-mix(in srgb, var(--ap-black) 95%, transparent) 100%)',
        }}
      />
    </Interactive.Div>
  );
};

export default HeroCinematicBackground;
