/**
 * RunVisual — artifact-driven card, interactive per best practices
 * Shows coverage bar, honesty notes, with scale/translate inline interpolate.
 */

import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Interactive } from 'remotion';

export const RunVisualComposition: React.FC<{
  coverage?: string;
  status?: string;
}> = ({ coverage = '64 / 64', status = 'NOMINAL' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#fafafc',
        padding: 40,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <Interactive.Div
        name="RunVisual card"
        style={{
          backgroundColor: 'white',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: '#e0e0e0',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          opacity: interpolate(frame, [0, fps * 0.4], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          translate: interpolate(frame, [0, fps * 0.4], ['0px 12px', '0px 0px'], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          scale: interpolate(frame, [0, fps * 0.4], [0.98, 1], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            output: 'perceptual-scale',
          }),
        }}
      >
        <Interactive.Div
          name="Coverage header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            opacity: interpolate(frame, [fps * 0.2, fps * 0.5], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#1d1d1f',
            }}
          >
            Coverage
          </span>
          <span
            style={{
              fontFamily: 'DM Mono, monospace',
              fontSize: 12,
              color: '#6e6e73',
            }}
          >
            {status}
          </span>
        </Interactive.Div>

        <Interactive.Div
          name="Coverage value"
          style={{
            fontFamily: 'DM Mono, monospace',
            fontSize: 32,
            fontWeight: 900,
            color: '#1d1d1f',
            opacity: interpolate(frame, [fps * 0.3, fps * 0.6], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
            translate: interpolate(frame, [fps * 0.3, fps * 0.6], ['0px 8px', '0px 0px'], {
              easing: Easing.spring({ damping: 200 }),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          {coverage}
        </Interactive.Div>

        <Interactive.Div
          name="Coverage bar track"
          style={{
            height: 8,
            backgroundColor: '#fafafc',
            borderRadius: 999,
            overflow: 'hidden',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: 'rgba(209,209,209,0.6)',
          }}
        >
          <Interactive.Div
            name="Coverage bar fill"
            style={{
              height: '100%',
              backgroundColor: '#1d7a3e',
              borderRadius: 999,
              width: `${interpolate(frame, [fps * 0.5, fps * 1.2], [0, 86], {
                easing: Easing.bezier(0.16, 1, 0.3, 1),
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              })}%`,
            }}
          />
        </Interactive.Div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
