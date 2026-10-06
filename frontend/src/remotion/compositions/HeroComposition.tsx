/**
 * HazardNet Hero — Motion graphics showcase (Remotion best practices)
 *
 * - Interactive elements have descriptive name
 * - All CSS inline, plain object, no spreading, no constants, no math
 * - Animate via interpolate(frame, [...], [...], {easing, extrapolate, output}) inline, hardcoded
 * - Use scale / translate / rotate (never transform)
 * - Effects array inline, hardcoded — except the hero grade, which is a design token from
 *   `lib/heroGrade.ts` so the page and this export cannot disagree about it
 * - Composition metadata inline in Root.tsx
 *
 * Layers: BgMesh → Title → Grade (matching the web hero, and reading its grade from
 * `lib/heroGrade.ts` rather than carrying a second copy of the stops)
 *
 * **Simplified 2026-10-05, to match `components/HeroCinematicBackground.tsx`.** This composition
 * is the 16:9 export of the web hero (Root.tsx calls it "web hero preview"), so when the web hero
 * dropped its decorative HUD and its second glow, this file kept painting a hero that no longer
 * exists — including two readouts the repository cannot support
 * ("GEO-SYNC · 23°42'N 90°22'E · APEX 35,786 KM" and "OPTICAL SENSOR STREAM · 30 FPS ·
 * RES-ADAPTIVE"; docs/audits/2026-10-03-landing-live-hero-audit.md H-P0-1). An exported MP4
 * leaves the building, so the same rule applies here as on the page: no number that traces to
 * nothing. The two HUD lines and the corner reticles are gone, the secondary cyan glow is gone
 * (one brand hue, one glow), and the vignette the web hero has is now here too.
 */

import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Interactive } from 'remotion';
import { HERO_GRADE } from '../../lib/heroGrade';

/**
 * Defaults are the front door's own words, not a slogan: the h1 and the coverage facts are the
 * strings `/` renders from `content/site-routes.json` and `data/bangladeshDistricts`. A preview
 * video that invents its own headline is one more place for the product to describe itself
 * differently from the product.
 */
export const HeroComposition: React.FC<{
  title?: string;
  accent?: string;
}> = ({ title = 'A forecast you can check, not just read', accent = '#0066cc' }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#05070E',
        overflow: 'hidden',
      }}
    >
      {/* Layer 1: BgMesh — primary glow, breathing scale */}
      <Interactive.Div
        name="Primary orbital glow"
        style={{
          position: 'absolute',
          top: '-25%',
          left: '-15%',
          width: 1100,
          height: 1100,
          borderRadius: '50%',
          backgroundColor: '#0066cc',
          opacity: interpolate(frame, [0, fps * 4, fps * 8], [0.35, 0.45, 0.35], {
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          scale: interpolate(frame, [0, fps * 4], [0.92, 1], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            output: 'perceptual-scale' as unknown as string,
          } as never),
          translate: interpolate(frame, [0, durationInFrames], ['0px 0px', '0px -12px'], {
            easing: Easing.bezier(0.65, 0, 0.35, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      />

      {/* Layer: Title — spring scale + translate */}
      <Interactive.Div
        name="Hero title"
        style={{
          position: 'absolute',
          top: '42%',
          left: '8%',
          right: '8%',
          color: 'white',
          fontFamily: 'Inter, sans-serif',
          fontSize: 64,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: '-0.03em',
          opacity: interpolate(frame, [fps * 0.2, fps * 0.8], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          translate: interpolate(frame, [fps * 0.2, fps * 0.8], ['0px 24px', '0px 0px'], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          scale: interpolate(frame, [fps * 0.2, fps * 0.8], [0.98, 1], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            output: 'perceptual-scale',
          }),
        }}
      >
        {title}
        <div
          style={{
            marginTop: 16,
            fontFamily: 'Public Sans, sans-serif',
            fontSize: 20,
            fontWeight: 400,
            lineHeight: 1.5,
            color: 'rgba(255,255,255,0.85)',
            opacity: interpolate(frame, [fps, fps * 1.5], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          Bangladesh: 64 districts · 7 &amp; 15 days · Every number traces to a file
        </div>
      </Interactive.Div>

      {/* Layer: Grade — soft-light wash, then the exposure curve + vignette the page paints.
          The four values come from `lib/heroGrade.ts`; this composition used to carry its own
          copies of the three gradients, which is how the export and the page drift apart. */}
      <Interactive.Div
        name="Cinematic soft-light grade"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: HERO_GRADE.gradeWash,
          mixBlendMode: 'soft-light' as const,
        }}
      />
      <Interactive.Div
        name="Grade — exposure curve + vignette"
        style={{
          position: 'absolute',
          inset: 0,
          background: `${HERO_GRADE.vignette}, ${HERO_GRADE.exposure}`,
        }}
      />

    </AbsoluteFill>
  );
};
