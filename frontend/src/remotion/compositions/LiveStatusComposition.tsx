import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Interactive } from 'remotion';

export const LiveStatusComposition: React.FC<{
  published?: number;
  assessed?: number;
}> = ({ published = 0, assessed = 74 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#f6f6f6',
        padding: 32,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <Interactive.Div
        name="Live status strip"
        style={{
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: '#d1d1d1',
          backgroundColor: '#e3e3e3',
          padding: 20,
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          opacity: interpolate(frame, [0, fps * 0.5], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          translate: interpolate(frame, [0, fps * 0.5], ['0px 10px', '0px 0px'], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        <Interactive.Div
          name="Published label"
          style={{
            fontFamily: 'DM Mono, monospace',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: '#77777a',
            opacity: interpolate(frame, [fps * 0.2, fps * 0.6], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          Published now — {published} alerts
        </Interactive.Div>
        <Interactive.Div
          name="Assessed value"
          style={{
            fontFamily: 'DM Mono, monospace',
            fontSize: 14,
            fontWeight: 800,
            color: '#17171b',
            scale: interpolate(frame, [fps * 0.3, fps * 0.7], [0.9, 1], {
              easing: Easing.spring({ damping: 200 }),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              output: 'perceptual-scale',
            }),
          }}
        >
          {assessed} assessed
        </Interactive.Div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
