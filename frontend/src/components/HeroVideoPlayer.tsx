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

import React, { useEffect, useRef } from 'react';

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

  const videoRef = useRef<HTMLVideoElement | null>(null);

  /*
   * Drive mutedness and play() explicitly rather than trusting the `autoPlay` attribute.
   *
   * React applies `muted` as a DOM *property*, not an attribute — rendering the hero and
   * inspecting it shows `autoplay` present and no `muted` attribute. The autoplay gate
   * reads mutedness at the moment playback would begin, so prop ordering alone is a coin
   * flip across browsers. Calling play() ourselves also makes a refusal *observable*, and
   * the two failure modes must not share a path: a clip the autoplay policy rejects will
   * never load, so failing over would burn the entire order and end on the poster anyway.
   * Only a real load error advances the cursor.
   */
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    try {
      const started = el.play();
      if (started && typeof started.catch === 'function') {
        // Refused autoplay (data saver, battery saver, a user preference) is not a dead
        // clip: the poster is already showing, so leave the cursor where it is.
        started.catch(() => undefined);
      }
    } catch {
      // No media stack at all (jsdom, an exotic engine). Nothing to recover from.
    }
  }, [source?.id]);

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
      ref={videoRef}
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
      // The catalogue's reachability was verified with plain GETs that carried no
      // Referer; a browser sends one. If a CDN enforces a referer allowlist it would
      // reject the browser request while the verified probe still returned 200, so make
      // the two requests the same shape. These clips need no referrer for attribution —
      // the credit and page URL ride on the data attributes below.
      //
      // Goes in through a spread because @types/react omits `referrerPolicy` from
      // VideoHTMLAttributes even though react-dom renders it as `referrerpolicy`; a
      // direct prop fails typecheck and the behaviour would silently be dropped.
      {...{ referrerPolicy: 'no-referrer' }}
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
      onLoadedData={onSourcePlayable}
      onPlaying={onSourcePlayable}
      style={sharedStyle}
    />
  );
};

export default HeroVideoPlayer;
