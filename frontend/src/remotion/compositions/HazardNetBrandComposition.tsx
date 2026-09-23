import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Interactive } from 'remotion';

export const HazardNetBrandComposition: React.FC<{
  wordmark?: string;
}> = ({ wordmark = 'HazardNet' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#05070E',
        justifyContent: 'center',
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Interactive.Div
        name="Brand wordmark"
        style={{
          color: 'white',
          fontFamily: 'Inter, sans-serif',
          fontSize: 72,
          fontWeight: 900,
          letterSpacing: '-0.03em',
          opacity: interpolate(frame, [0, fps * 0.6], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          scale: interpolate(frame, [0, fps * 0.6], [0.92, 1], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            output: 'perceptual-scale',
          }),
          translate: interpolate(frame, [0, fps * 0.6], ['0px 12px', '0px 0px'], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        {wordmark}
      </Interactive.Div>
      <Interactive.Div
        name="Tagline"
        style={{
          marginTop: 8,
          color: '#22D3EE',
          fontFamily: 'DM Mono, monospace',
          fontSize: 14,
          letterSpacing: '0.14em',
          opacity: interpolate(frame, [fps * 0.4, fps], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        BANGLADESH · NASA HDS · VERIFIED
      </Interactive.Div>
    </AbsoluteFill>
  );
};
