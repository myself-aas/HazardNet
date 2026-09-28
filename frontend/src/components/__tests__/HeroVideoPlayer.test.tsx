import '@testing-library/jest-dom';
/// <reference types="jest" />
/**
 * The hero's video layer, exercised end to end in jsdom.
 *
 * jsdom has no media stack: it will not fetch a clip, decode it, or fire the
 * events a real browser derives from doing so. That is exactly why the failover
 * logic lives behind props rather than inside a `<video>` tag in the hero — here
 * we fire the events a browser *would* fire (`error`, `canplay`) and drive the
 * clock, and assert the player walks its order and lands on the poster.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';

import HeroVideoPlayer from '../HeroVideoPlayer';
import { PLAYABLE_HERO_VIDEO_SOURCES, type HeroVideoSource } from '../../lib/heroVideoPlaylist';

/* ── fixtures ──────────────────────────────────────────────────────────────── */

const source = (id: string): HeroVideoSource => ({
  id,
  provider: 'pixabay',
  pageUrl: `https://pixabay.com/videos/${id}/`,
  src: `https://cdn.pixabay.com/video/2024-01-01/${id}.mp4`,
  probe: 'http-200',
});

const THREE = [source('alpha'), source('bravo'), source('charlie')];

/** A draw that never varies, so each test sees the same order. */
const fixedDraw = () => 0;

const currentVideo = () => screen.getByTestId('hero-video') as HTMLVideoElement;

describe('<HeroVideoPlayer />', () => {
  it('plays a clip and exposes which one it drew', () => {
    render(<HeroVideoPlayer sources={THREE} random={fixedDraw} />);

    const video = currentVideo();
    expect(video.tagName).toBe('VIDEO');
    expect(THREE.map((candidate) => candidate.src)).toContain(video.getAttribute('src'));
    expect(video).toHaveAttribute('data-hero-video-status', 'loading');
    expect(video).toHaveAttribute('data-hero-video-attempts', '1');
    expect(video).toHaveAttribute('data-hero-video-candidates', '3');
    // Decorative background: it must never enter the accessibility tree.
    expect(video).toHaveAttribute('aria-hidden', 'true');
    // Passed through a spread to get around the @types/react omission — assert it
    // survives, because a type workaround that stops working drops it silently.
    expect(video.getAttribute('referrerpolicy')).toBe('no-referrer');
    // React sets `muted` as a property, not an attribute; the effect sets it too.
    expect(video.muted).toBe(true);
  });

  it('draws from the real catalogue when no list is supplied', () => {
    render(<HeroVideoPlayer random={fixedDraw} />);

    const playable = PLAYABLE_HERO_VIDEO_SOURCES.map((candidate) => candidate.src);
    expect(playable).toContain(currentVideo().getAttribute('src'));
    expect(currentVideo()).toHaveAttribute('data-hero-video-candidates', String(PLAYABLE_HERO_VIDEO_SOURCES.length));
  });

  it('falls over to a different clip when the current one errors', () => {
    render(<HeroVideoPlayer sources={THREE} random={fixedDraw} timeoutMs={60_000} />);

    const first = currentVideo().getAttribute('data-hero-video-id');
    fireEvent.error(currentVideo());

    const second = currentVideo();
    expect(second.getAttribute('data-hero-video-id')).not.toBe(first);
    expect(second.getAttribute('data-hero-video-attempts')).toBe('2');
    expect(second.getAttribute('data-hero-video-status')).toBe('loading');
  });

  it('walks the whole order and lands on the poster when every clip fails', () => {
    render(<HeroVideoPlayer sources={THREE} random={fixedDraw} timeoutMs={60_000} />);

    const tried = new Set<string>();
    for (let attempt = 0; attempt < THREE.length; attempt += 1) {
      const video = currentVideo();
      tried.add(video.getAttribute('data-hero-video-id') as string);
      fireEvent.error(video);
    }

    // Each of the three was tried exactly once — no clip repeated, none skipped.
    expect(tried.size).toBe(3);
    expect(screen.queryByTestId('hero-video')).not.toBeInTheDocument();

    const poster = screen.getByTestId('hero-video-poster');
    expect(poster).toBeInTheDocument();
    expect(poster).toHaveAttribute('data-hero-video-status', 'exhausted');
    expect(poster).toHaveAttribute('data-hero-video-attempts', '3');
    expect(poster).toHaveAttribute('data-hero-video-candidates', '3');
  });

  it('marks the clip playing once it can play', () => {
    render(<HeroVideoPlayer sources={THREE} random={fixedDraw} timeoutMs={60_000} />);

    fireEvent.canPlay(currentVideo());
    expect(currentVideo()).toHaveAttribute('data-hero-video-status', 'playing');
  });

  it('fails over when a clip goes silent past the timeout', () => {
    jest.useFakeTimers();
    try {
      render(<HeroVideoPlayer sources={THREE} random={fixedDraw} timeoutMs={1000} />);

      const first = currentVideo().getAttribute('data-hero-video-id');
      expect(first).toBeTruthy();

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(currentVideo().getAttribute('data-hero-video-id')).not.toBe(first);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not fail over a clip that already started playing', () => {
    jest.useFakeTimers();
    try {
      render(<HeroVideoPlayer sources={THREE} random={fixedDraw} timeoutMs={1000} />);

      fireEvent.canPlay(currentVideo());
      const playing = currentVideo().getAttribute('data-hero-video-id');

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      expect(currentVideo().getAttribute('data-hero-video-id')).toBe(playing);
      expect(currentVideo()).toHaveAttribute('data-hero-video-status', 'playing');
    } finally {
      jest.useRealTimers();
    }
  });

  it('holds the poster while offline instead of burning a timeout per clip', () => {
    const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false });
    try {
      render(<HeroVideoPlayer sources={THREE} random={fixedDraw} timeoutMs={60_000} />);

      expect(screen.queryByTestId('hero-video')).not.toBeInTheDocument();
      expect(screen.getByTestId('hero-video-poster')).toBeInTheDocument();
    } finally {
      if (original) Object.defineProperty(Navigator.prototype, 'onLine', original);
    }
  });
});
