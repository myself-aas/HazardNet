/**
 * Remotion Root — Composition metadata inline (best practice)
 *
 * Keep width, height, fps, durationInFrames and defaultProps inline on <Composition>.
 * Dynamic values go in calculateMetadata(). No type assertions, no extracted defaultProps.
 *
 * Performance: 60fps where needed, perceptual-scale for scale, clamp extrapolation.
 */

import React from 'react';
import { Composition } from 'remotion';
import { HeroComposition } from './compositions/HeroComposition';
import { RunVisualComposition } from './compositions/RunVisualComposition';
import { LiveStatusComposition } from './compositions/LiveStatusComposition';
import { HazardNetBrandComposition } from './compositions/HazardNetBrandComposition';
import { HazardAlertStory } from './compositions/HazardAlertStory';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Mobile Social Warning Story — 9:16 vertical video format (1080x1920) */}
      <Composition
        id="HazardNet-AlertStory"
        component={HazardAlertStory}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          district: 'Sylhet',
          hazardType: 'Flash Flood Early Warning',
          severityScore: 0.88,
          date: '2026-09-22',
          affectedPeopleText: '42,000+ Agricultural Households At Risk',
        }}
      />
      {/* Hero — 16:9, cinematic, web hero preview */}
      <Composition
        id="HazardNet-Hero"
        component={HeroComposition}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: 'HazardNet — NASA-Inspired Global Observatory',
          accent: '#1c67e3',
        }}
      />
      {/* RunVisual — card showcase */}
      <Composition
        id="HazardNet-RunVisual"
        component={RunVisualComposition}
        durationInFrames={120}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{
          coverage: '64 / 64',
          status: 'NOMINAL',
        }}
      />
      {/* LiveStatus — strip preview */}
      <Composition
        id="HazardNet-LiveStatus"
        component={LiveStatusComposition}
        durationInFrames={90}
        fps={30}
        width={1920}
        height={400}
        defaultProps={{
          published: 0,
          assessed: 74,
        }}
      />
      {/* Brand */}
      <Composition
        id="HazardNet-Brand"
        component={HazardNetBrandComposition}
        durationInFrames={60}
        fps={30}
        width={800}
        height={400}
        defaultProps={{
          wordmark: 'HazardNet',
        }}
      />
    </>
  );
};
