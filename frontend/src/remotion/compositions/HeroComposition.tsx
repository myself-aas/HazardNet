/**
 * HazardNet Hero — Motion graphics showcase (Remotion best practices)
 *
 * - Interactive elements have descriptive name
 * - All CSS inline, plain object, no spreading, no constants, no math
 * - Animate via interpolate(frame, [...], [...], {easing, extrapolate, output}) inline, hardcoded
 * - Use scale / translate / rotate (never transform)
 * - Effects array inline, hardcoded
 * - Composition metadata inline in Root.tsx
 *
 * Layers: BgMesh → Video → HUD → Grade → Grain+Vignette (5-layer stack)
 */

import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Interactive } from 'remotion';

export const HeroComposition: React.FC<{
  title?: string;
  accent?: string;
}> = ({ title = 'HazardNet — NASA-Inspired Global Observatory', accent = '#1c67e3' }) => {
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
          backgroundColor: '#1c67e3',
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

      {/* Layer 1b: secondary cyan glow — translate drift */}
      <Interactive.Div
        name="Secondary cyan reflection"
        style={{
          position: 'absolute',
          bottom: '-20%',
          right: '-10%',
          width: 900,
          height: 900,
          borderRadius: '50%',
          backgroundColor: '#22D3EE',
          opacity: interpolate(frame, [0, fps], [0, 0.3], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          scale: interpolate(frame, [0, fps * 5], [0.96, 1.04], {
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            output: 'perceptual-scale',
          }),
        }}
      />

      {/* Layer 3: HUD — staggered opacity + translate */}
      <Interactive.Div
        name="HUD telemetry GEO-SYNC"
        style={{
          position: 'absolute',
          top: 80,
          left: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'DM Mono, monospace',
          fontSize: 10,
          letterSpacing: '0.08em',
          color: 'rgba(255,255,255,0.5)',
          opacity: interpolate(frame, [fps * 0.5, fps], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          translate: interpolate(frame, [fps * 0.5, fps], ['0px 8px', '0px 0px'], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        GEO-SYNC · 23°42&#39;N 90°22&#39;E · APEX 35,786 KM
      </Interactive.Div>

      <Interactive.Div
        name="HUD optical stream"
        style={{
          position: 'absolute',
          top: 80,
          right: 32,
          fontFamily: 'DM Mono, monospace',
          fontSize: 10,
          letterSpacing: '0.08em',
          color: 'rgba(255,255,255,0.5)',
          opacity: interpolate(frame, [fps * 0.7, fps * 1.2], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          translate: interpolate(frame, [fps * 0.7, fps * 1.2], ['0px 8px', '0px 0px'], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        OPTICAL SENSOR STREAM · 30 FPS · RES-ADAPTIVE
      </Interactive.Div>

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
          Bangladesh — 64 districts · 7 &amp; 15 days · Verified artifacts
        </div>
      </Interactive.Div>

      {/* Layer 4: Grade — soft-light + linear */}
      <Interactive.Div
        name="Cinematic soft-light grade"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#0f3a7a',
          opacity: 0.2,
          mixBlendMode: 'soft-light' as const,
        }}
      />
      <Interactive.Div
        name="Exposure curve"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(5,7,14,0.18) 32%, rgba(5,7,14,0.68) 72%, rgba(5,7,14,0.92) 100%)',
        }}
      />

      {/* Reticles — scale in */}
      <Interactive.Div
        name="Reticle TL"
        style={{
          position: 'absolute',
          top: 96,
          left: 24,
          color: 'rgba(255,255,255,0.2)',
          fontSize: 12,
          opacity: interpolate(frame, [fps * 1.2, fps * 1.6], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          scale: interpolate(frame, [fps * 1.2, fps * 1.6], [0.8, 1], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            output: 'perceptual-scale',
          }),
        }}
      >
        +
      </Interactive.Div>
      <Interactive.Div
        name="Reticle TR"
        style={{
          position: 'absolute',
          top: 96,
          right: 32,
          color: 'rgba(255,255,255,0.2)',
          fontSize: 12,
          opacity: interpolate(frame, [fps * 1.2, fps * 1.6], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          scale: interpolate(frame, [fps * 1.2, fps * 1.6], [0.8, 1], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            output: 'perceptual-scale',
          }),
        }}
      >
        +
      </Interactive.Div>
    </AbsoluteFill>
  );
};
