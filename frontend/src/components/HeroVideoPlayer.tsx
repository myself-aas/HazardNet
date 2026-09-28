/**
 * HeroVideoPlayer — the hero's video layer with random selection and failover.
 *
 * Plays one clip drawn at random from `PLAYABLE_HERO_VIDEO_SOURCES` and walks
 * down the shuffled order when a clip cannot be played, ending on the inline
 * SVG poster if every clip fails. Extracted from `HeroCinematicBackground` so
 * the failover chain is a component of its own: the hero only renders the video
 * layer when motion is allowed, which in jsdom is never, so leaving this inline
 * would have made the whole chain untestable.
 *
 * The clip is loaded through the element's own `src` (not `<source>` children)
 * and the element is keyed on the clip id, so advancing to the next candidate
 * mounts a fresh media element rather than relying on `load()` after mutating
 * the source list — the latter is exactly where `<source>`-based failover
 * usually silently stalls.
 */

import React from 'react';

import { EARTH_HERO_POSTER } from '../lib/heroMedia';
import type { HeroVideoSource } from '../lib/heroVideoPlaylist';
import { useHeroVideoSource } from '../hooks/useHeroVideoSource';

export interface HeroVideoPlayerProps {
  /** Candidate list; defaults to the playable catalogue. */
  sources?: readonly HeroVideoSource[];
  /** Injectable RNG so tests can drive the draw deterministically. */
  random?: () => number;
  /** Per-candidate load ceiling in ms. */
  timeoutMs?: number;
  /** When false the load timeout is not armed. */
  enabled?: boolean;
  /** Applied to whichever element is rendered (video or poster). */
  style?: React.CSSProperties;
}

export const HeroVideoPlayer: React.FC<HeroVideoPlayerProps> = ({
  sources,
  random,
  timeoutMs,
  enabled = true,
  style,
}) => {
  const { source, status, attempts, totalCandidates, onSourceFailed, onSourcePlayable } = useHeroVideoSource({
    sources,
    random,
    timeoutMs,
    enabled,
  });

  const sharedStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    ...style,
  };

  // Every candidate failed (or the browser is offline): hold the poster rather
  // than leaving a black rectangle behind the hero copy.
  if (status === 'exhausted' || !source) {
    return (
      <div
        data-testid="hero-video-poster"
        data-hero-video-status="exhausted"
        data-hero-video-attempts={attempts}
        data-hero-video-candidates={totalCandidates}
        role="presentation"
        style={{
          ...sharedStyle,
          backgroundImage: `url("${EARTH_HERO_POSTER}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
    );
  }

  return (
    <video
      // Keyed on the clip id: failing over mounts a fresh element, which is
      // what actually makes the browser fetch the next URL.
      key={source.id}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      controls={false}
      aria-hidden="true"
      tabIndex={-1}
      poster={EARTH_HERO_POSTER}
      src={source.src}
      data-testid="hero-video"
      data-hero-video-id={source.id}
      data-hero-video-provider={source.provider}
      data-hero-video-status={status}
      data-hero-video-attempts={attempts}
      data-hero-video-candidates={totalCandidates}
      data-hero-video-page={source.pageUrl}
      // Only `error` is a hard failure. `stalled` is deliberately not wired up:
      // it fires on transient fetch hiccups that usually recover, and skipping a
      // healthy clip over one stall costs a re-download. Silence is already
      // covered by the hook's load timeout.
      onError={onSourceFailed}
      onCanPlay={onSourcePlayable}
      onPlaying={onSourcePlayable}
      style={sharedStyle}
    />
  );
};

export default HeroVideoPlayer;
