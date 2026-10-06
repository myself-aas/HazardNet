/**
 * HeroCinematicBackground — the hero's backdrop, three layers, one arc.
 *
 *   1. the mesh         one brand-blue orbital glow, breathing on a slow sine
 *   2. the photograph   the self-hosted carousel, cross-fading (see HeroImageCarousel)
 *   3. the grade        soft-light wash + exposure curve + vignette, which is what makes white
 *                       type readable over a bright frame (`lib/heroGrade.ts`)
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
 * **Simplified again 2026-10-06.** Four changes, all of them "fewer places for the hero to
 * disagree with itself", none of them a thing you can see go away:
 *
 *   · the grade's four values moved out of this file into `lib/heroGrade.ts`, which the Remotion
 *     export now reads as well. The page and the MP4 were two hand-kept copies of the same three
 *     gradients; there is one copy now, and `components/__tests__/HeroCinematicBackground.test.tsx` pins it. Nothing in this file
 *     paints a colour literal any more (it left the colour-discipline exemption list with them).
 *   · the exposure curve and the vignette were two full-bleed nodes stacked on each other. They
 *     are one node with two background layers — the vignette listed first, so it still paints on
 *     top. Two gradients that never move relative to each other do not need two elements to
 *     composite, and on the 2 GB device class this page targets that is one less layer.
 *   · the mesh's own clipping wrapper is gone too: the root clips, and the wrapper was a second
 *     `overflow: hidden` inside the first.
 *   · the three mesh interpolations now share a single arc over the frame budget (`fps * 14`, mid
 *     key at `fps * 7`) instead of running 8 s, 14 s and 9 s against each other — and the drift used
 *     to hold at -10px for the rest of the page's life, because `useWebFrame` counts up to
 *     `maxFrames` and stops. One breath that starts and ends at rest is what "ambient" means here.
 *
 * **Simplified a third time 2026-10-06, for re-render cost (Vercel React guidance).** The frame
 * loop used to live in this component's body, which meant every one of the 420 frames of the
 * animation re-rendered *the whole backdrop*: the four-slide carousel, its four style objects, the
 * poster wrapper and the two grade layers — ~14 s × 30 fps of work on the 2 GB Android devices
 * this page is built for, to animate one blurred circle. Two rules fix that:
 *
 *   · `HeroMeshGlow` is a leaf that owns the frame loop. State lives where it is consumed, so a
 *     frame re-renders the glow and nothing else; this component renders once per `paused` change.
 *   · the three static layers (poster wrapper, wash, grade) are hoisted module-level elements
 *     instead of being re-created on every render — they have no state and no props.
 *
 * `HeroCinematicBackground.renders.test.tsx` asserts it behaviourally: with the real loop running,
 * the carousel stub renders once while the glow's own style keeps changing.
 *
 * The grade is also a little deeper than it was (see `lib/heroGrade.ts` for the numbers and for
 * the audit finding behind them). That is the same change the audit asked for on the copy panel
 * that used to cover this photograph.
 *
 * Strictly follows https://github.com/remotion-dev/remotion/blob/main/packages/docs/docs/studio/interactivity-best-practices.mdx
 * - Interactive elements have descriptive name
 * - All CSS styles inline, plain object, no spreading, no constants, no math outside interpolate
 * - Animate via interpolate(frame, [...], [...], {easing, extrapolateLeft/Right, output}) inline, hardcoded
 * - Use scale / translate / rotate (never transform)
 * - Effects inline, hardcoded; composition metadata inline in Root.tsx
 * - Respects prefers-reduced-motion, paused, test — no animation drain
 *
 * The one exception to "no constants" is the *hoisted static elements* above: the contract is about
 * animated values, and a layer that is never animated has no frame to interpolate from.
 *
 * Performance: GPU-only (scale, translate, opacity), will-change only on the animating layer,
 * 60fps rAF via useWebFrame, LazyMotion domAnimation in App.tsx.
 */

import React from 'react';
import { useReducedMotion } from 'framer-motion';
import { EARTH_HERO_POSTER_CSS } from '../lib/heroMedia';
import HeroImageCarousel from './HeroImageCarousel';
import { Interactive } from './interactive/Interactive';
import { useWebFrame, useWebVideoConfig, interpolate, Easing } from '../lib/motion-interpolate';
import { readLowBandwidth } from '../lib/bandwidth';
import { HERO_GRADE } from '../lib/heroGrade';

/** Hoisted: the test environment renders every animated layer at its resting value. */
const IS_TEST = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

/**
 * Layer 1 — the mesh. Owns the only frame loop in the backdrop, so the frame state re-renders this
 * node alone. Brand blue orbital glow: breathing opacity + scale + translate drift, all three
 * properties on one arc so the glow comes to rest when the frame budget does.
 *
 * Low-bandwidth mode is a document-level decision (`html[data-low-bandwidth='true']`, written by
 * `main.tsx` before first paint and kept in sync by `useBandwidthMode`). The CSS side of it already
 * zeroes durations and drops every `backdrop-filter`, but a frame loop is JavaScript and CSS cannot
 * stop it — this read is what stops it. Reading the attribute at render keeps this component free
 * of a hook dependency, and mount-time is enough: the only writer on this route is boot, and
 * arriving from `/live` remounts the backdrop.
 */
const HeroMeshGlow: React.FC<{ paused: boolean }> = ({ paused }) => {
  const reduceMotion = useReducedMotion();
  const lowBandwidth = readLowBandwidth();
  const shouldAnimate = !reduceMotion && !paused && !IS_TEST && !lowBandwidth;
  const frame = useWebFrame(30, 420);
  const { fps } = useWebVideoConfig();

  return (
    <Interactive.Div
      name="Primary orbital glow"
      style={{
        position: 'absolute',
        top: '-25%',
        left: '-15%',
        width: 1100,
        height: 1100,
        borderRadius: '50%',
        background: HERO_GRADE.meshGlow,
        opacity: shouldAnimate
          ? interpolate(frame, [0, fps * 7, fps * 14], [0.3, 0.44, 0.32], {
              easing: Easing.bezier(0.4, 0, 0.2, 1),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          : 0.32,
        scale: shouldAnimate
          ? interpolate(frame, [0, fps * 7, fps * 14], [1, 1.05, 1], {
              easing: Easing.bezier(0.65, 0, 0.35, 1),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              output: 'perceptual-scale',
            })
          : 1,
        translate: shouldAnimate
          ? interpolate(frame, [0, fps * 7, fps * 14], ['0px 0px', '0px -9px', '0px 0px'], {
              easing: Easing.bezier(0.4, 0, 0.2, 1),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          : '0px 0px',
        filter: 'blur(var(--hero-glow-blur-primary))',
        willChange: shouldAnimate ? 'transform, opacity' : undefined,
      }}
    />
  );
};

/**
 * Layer 2's wrapper — the photograph. Painted *behind* the carousel: if every image were missing,
 * this keeps the hero on the Earth scene rather than the container's near-black fill — the
 * silent-blank failure this layer has had twice before.
 *
 * Must be the CSS-encoded form: the attribute form of this data URI contains quotes and newlines,
 * which make the browser reject the declaration outright.
 */
const PhotographLayer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Interactive.Div
    name="Hero photograph"
    style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      backgroundImage: `url("${EARTH_HERO_POSTER_CSS}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }}
  >
    {children}
  </Interactive.Div>
);

/**
 * Layer 3 — the grade. The exposure curve and the vignette are one node with two background
 * layers, vignette first so it still paints on top. These are the two layers the copy leans on:
 * the curve darkens towards the foot of the hero where the type sits, the ellipse darkens the
 * corners. Hoisted: no props, no state, no frame.
 */
const GradeLayer = (
  <Interactive.Div
    name="Grade — exposure curve + vignette"
    style={{
      position: 'absolute',
      inset: 0,
      zIndex: 4,
      pointerEvents: 'none',
      background: `${HERO_GRADE.vignette}, ${HERO_GRADE.exposure}`,
    }}
  />
);

/**
 * The blend-mode wash has to stay its own node: `mix-blend-mode` applies to the element against its
 * backdrop, so it cannot be one layer of a stack. Hoisted for the same reason as `GradeLayer`.
 */
const WashLayer = (
  <Interactive.Div
    name="Soft-light grade"
    style={{
      position: 'absolute',
      inset: 0,
      zIndex: 3,
      pointerEvents: 'none',
      backgroundColor: HERO_GRADE.gradeWash,
      mixBlendMode: 'soft-light',
    }}
  />
);

export const HeroCinematicBackground: React.FC<{ paused?: boolean }> = ({ paused = false }) => {
  const reduceMotion = useReducedMotion();
  /* Read once to hand the carousel its low-bandwidth prop; the glow reads it for itself. */
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
      <HeroMeshGlow paused={paused} />

      <PhotographLayer>
        <HeroImageCarousel
          paused={paused}
          reducedMotion={!!reduceMotion || IS_TEST}
          lowBandwidth={lowBandwidth}
        />
      </PhotographLayer>

      {WashLayer}
      {GradeLayer}
    </Interactive.Div>
  );
};

export default HeroCinematicBackground;
