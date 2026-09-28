/**
 * useHeroVideoSource — random draw + failover state machine for the hero video.
 *
 * On mount it shuffles the playable catalogue once and hands back the first
 * clip. When that clip reports an error, stalls past `timeoutMs`, or the
 * browser is offline, it advances to the next clip in the shuffled order. When
 * every clip has been tried it reports `exhausted`, and the caller renders the
 * SVG poster instead of a black hero.
 *
 * Deliberately framework-light: no media element here, just the order, the
 * cursor, and the two callbacks the `<video>` element wires up. That keeps the
 * whole failover chain testable in jsdom, which has no media stack at all.
 */

import { useCallback, useEffect, useState } from 'react';

import { shuffleHeroSources, PLAYABLE_HERO_VIDEO_SOURCES, type HeroVideoSource } from '../lib/heroVideoPlaylist';

/**
 * How long a candidate may sit unplayed before it is treated as failed.
 *
 * These are multi-megabyte CDN clips, so this is a "the network is not going to
 * answer" ceiling rather than a latency budget — it must stay well above a slow
 * 4G first-byte, otherwise a healthy clip on a poor connection gets abandoned
 * and the user pays for the bytes twice.
 */
export const HERO_VIDEO_LOAD_TIMEOUT_MS = 12000;

export type HeroVideoStatus = 'loading' | 'playing' | 'exhausted';

export interface UseHeroVideoSourceOptions {
  /** Candidate list; defaults to the playable catalogue. */
  sources?: readonly HeroVideoSource[];
  /** Injectable RNG so tests can drive the draw deterministically. */
  random?: () => number;
  /** Per-candidate load ceiling in ms. */
  timeoutMs?: number;
  /** When false the load timeout is not armed (used while the hero is paused). */
  enabled?: boolean;
}

export interface UseHeroVideoSourceResult {
  /** The clip to play now, or `null` once the order is spent. */
  source: HeroVideoSource | null;
  status: HeroVideoStatus;
  /** How many clips have been tried, including the current one. */
  attempts: number;
  totalCandidates: number;
  /** Wire to the media element's `error`. */
  onSourceFailed: () => void;
  /** Wire to `canplay`/`playing` — cancels the load timeout. */
  onSourcePlayable: () => void;
  /** Re-draw from the top of the same order (used when the network returns). */
  retry: () => void;
}

interface HeroVideoState {
  index: number;
  /** Whether the clip at `index` has started playing. */
  phase: 'loading' | 'playing';
}

export function useHeroVideoSource(options: UseHeroVideoSourceOptions = {}): UseHeroVideoSourceResult {
  const {
    sources = PLAYABLE_HERO_VIDEO_SOURCES,
    random = Math.random,
    timeoutMs = HERO_VIDEO_LOAD_TIMEOUT_MS,
    enabled = true,
  } = options;

  // Shuffled once per mount — this is what makes each refresh play a different
  // clip. Lazy initialiser, so the draw happens on the first render only and
  // never re-runs when the component re-renders.
  const [order] = useState<HeroVideoSource[]>(() => shuffleHeroSources(sources, random));
  const [state, setState] = useState<HeroVideoState>({ index: 0, phase: 'loading' });

  const totalCandidates = order.length;
  const exhausted = state.index >= totalCandidates;
  const source = exhausted ? null : order[state.index];

  const status: HeroVideoStatus = exhausted ? 'exhausted' : state.phase;
  const attempts = Math.min(state.index + 1, Math.max(totalCandidates, 1));

  const onSourceFailed = useCallback(() => {
    setState((current) =>
      // Guard: a late error from an unmounted clip must not push the cursor
      // past the end and re-open a spent order.
      current.index >= totalCandidates ? current : { index: current.index + 1, phase: 'loading' },
    );
  }, [totalCandidates]);

  const onSourcePlayable = useCallback(() => {
    setState((current) => (current.phase === 'playing' ? current : { ...current, phase: 'playing' }));
  }, []);

  const retry = useCallback(() => {
    setState({ index: 0, phase: 'loading' });
  }, []);

  // Failover on silence: a clip that neither errors nor plays (blocked CDN,
  // captive portal, hung socket) must not pin the hero on the poster forever.
  useEffect(() => {
    if (!enabled || exhausted || state.phase === 'playing') return;
    const timer = setTimeout(onSourceFailed, timeoutMs);
    return () => clearTimeout(timer);
  }, [enabled, exhausted, state.phase, state.index, timeoutMs, onSourceFailed]);

  // Offline: skip the whole order instead of burning `timeoutMs` per clip, and
  // start over the moment the connection returns.
  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return;

    if (!navigator.onLine) {
      setState((current) =>
        current.index >= totalCandidates ? current : { index: totalCandidates, phase: 'loading' },
      );
    }

    const handleOnline = () => {
      if (navigator.onLine) retry();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [totalCandidates, retry]);

  return {
    source,
    status,
    attempts,
    totalCandidates,
    onSourceFailed,
    onSourcePlayable,
    retry,
  };
}

export default useHeroVideoSource;
