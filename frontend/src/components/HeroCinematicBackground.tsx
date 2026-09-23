/**
 * HeroCinematicBackground — 5-layer motion graphics (Remotion interactivity best practices)
 *
 * Strictly follows https://github.com/remotion-dev/remotion/blob/main/packages/docs/docs/studio/interactivity-best-practices.mdx
 * - Interactive elements have descriptive name
 * - All CSS styles inline, plain object, no spreading, no constants, no math outside interpolate
 * - Animate via interpolate(frame, [...], [...], {easing, extrapolateLeft/Right, output}) inline, hardcoded
 * - Use scale / translate / rotate (never transform)
 * - Effects inline, hardcoded; composition metadata inline in Root.tsx
 * - Respects prefers-reduced-motion, paused, test — no animation drain
 *
 * Performance: GPU-only (scale, translate, opacity), will-change only on animating layers,
 * 60fps rAF via useWebFrame, LazyMotion domAnimation in App.tsx.
 */

import React from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  EARTH_HERO_VIDEO_1080P,
  EARTH_HERO_VIDEO_720P,
  EARTH_HERO_VIDEO_540P,
  EARTH_HERO_VIDEO_BACKUP_MP4,
  EARTH_HERO_POSTER,
} from '../lib/heroMedia';
import { Interactive } from './interactive/Interactive';
import { useWebFrame, useWebVideoConfig, interpolate, Easing } from '../lib/motion-interpolate';

export const HeroCinematicBackground: React.FC<{ paused?: boolean }> = ({ paused = false }) => {
  const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
  const reduceMotion = useReducedMotion();
  const shouldAnimate = !reduceMotion && !paused && !isTest;
  const frame = useWebFrame(30);
  const { fps } = useWebVideoConfig();

  // shouldPlayVideo is hardcoded — no computed effects array
  const shouldPlayVideo = shouldAnimate;

  return (
    <Interactive.Div
      name="Hero cinematic background — 5-layer"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        userSelect: 'none',
        backgroundColor: '#05070E',
      }}
    >
      {/* ── Layer 1: Background Mesh (BgMesh) ────────────────────────── */}
      <Interactive.Div
        name="BgMesh container"
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
        }}
      >
        {/* Primary NASA Blue orbital glow — breathing scale + translate drift */}
        <Interactive.Div
          name="Primary orbital glow"
          style={{
            position: 'absolute',
            top: '-25%',
            left: '-15%',
            width: 1100,
            height: 1100,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #1c67e355 0%, #0f3a7a22 50%, transparent 70%)',
            opacity: shouldAnimate
              ? interpolate(frame, [0, fps * 4, fps * 8], [0.35, 0.45, 0.35], {
                  easing: Easing.bezier(0.4, 0, 0.2, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : 0.4,
            scale: shouldAnimate
              ? interpolate(frame, [0, fps * 7, fps * 14], [1, 1.04, 1], {
                  easing: Easing.bezier(0.65, 0, 0.35, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  output: 'perceptual-scale',
                })
              : 1,
            translate: shouldAnimate
              ? interpolate(frame, [0, fps * 9], ['0px 0px', '0px -10px'], {
                  easing: Easing.bezier(0.4, 0, 0.2, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : '0px 0px',
            filter: 'blur(var(--hero-glow-blur-primary))',
            willChange: shouldAnimate ? 'transform, opacity' : undefined,
          }}
        />

        {/* Secondary atmospheric cyan — slower drift */}
        <Interactive.Div
          name="Secondary cyan reflection"
          style={{
            position: 'absolute',
            bottom: '-20%',
            right: '-10%',
            width: 900,
            height: 900,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #22D3EE44 0%, transparent 68%)',
            opacity: 0.3,
            filter: 'blur(var(--hero-glow-blur-secondary))',
            scale: shouldAnimate
              ? interpolate(frame, [0, fps * 8], [0.96, 1.02], {
                  easing: Easing.bezier(0.4, 0, 0.2, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  output: 'perceptual-scale',
                })
              : 1,
            translate: shouldAnimate
              ? interpolate(frame, [0, fps * 10], ['0px 0px', '0px 8px'], {
                  easing: Easing.bezier(0.65, 0, 0.35, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : '0px 0px',
            willChange: shouldAnimate ? 'transform' : undefined,
          }}
        />
      </Interactive.Div>

      {/* ── Layer 2: Video Asset (HeroVideoAsset with Idle Breathing) ── */}
      {shouldPlayVideo ? (
        <Interactive.Div
          name="Hero video asset — idle breathing"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            scale: shouldAnimate
              ? interpolate(frame, [0, fps * 7, fps * 14], [1.02, 1.04, 1.02], {
                  easing: Easing.bezier(0.4, 0, 0.2, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  output: 'perceptual-scale',
                })
              : 1.02,
            willChange: shouldAnimate ? 'transform' : undefined,
          }}
        >
          <video
            autoPlay
            loop
            muted
            playsInline
            poster={EARTH_HERO_POSTER}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          >
            <source src={EARTH_HERO_VIDEO_1080P} type="video/mp4" media="(min-width: 1024px)" />
            <source src={EARTH_HERO_VIDEO_720P} type="video/mp4" media="(min-width: 640px)" />
            <source src={EARTH_HERO_VIDEO_540P} type="video/mp4" />
            <source src={EARTH_HERO_VIDEO_BACKUP_MP4} type="video/mp4" />
          </video>
        </Interactive.Div>
      ) : (
        <Interactive.Div
          name="Poster fallback — reduced-motion"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            backgroundImage: `url("${EARTH_HERO_POSTER}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}

      {/* ── Layer 3: Observatory Telemetry HUD (Graphics / Type) ────── */}
      <Interactive.Div
        name="Telemetry HUD container"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          fontFamily: 'DM Mono, monospace',
          fontSize: 10,
          letterSpacing: '0.08em',
          color: 'rgba(255,255,255,0.3)',
          userSelect: 'none',
          display: shouldAnimate || !isTest ? 'block' : 'none',
        }}
      >
        {/* Top-left GEO-SYNC */}
        <Interactive.Div
          name="HUD GEO-SYNC label"
          style={{
            position: 'absolute',
            top: 80,
            left: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            opacity: shouldAnimate
              ? interpolate(frame, [fps * 0.3, fps * 0.9], [0, 1], {
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : 1,
            translate: shouldAnimate
              ? interpolate(frame, [fps * 0.3, fps * 0.9], ['0px 6px', '0px 0px'], {
                  easing: Easing.spring({ damping: 200 }),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : '0px 0px',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#38BDF8',
              opacity: shouldAnimate
                ? interpolate(frame, [0, fps * 0.6, fps * 1.2], [0.7, 1, 0.7], {
                    easing: Easing.bezier(0.4, 0, 0.2, 1),
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  })
                : 1,
              scale: shouldAnimate
                ? interpolate(frame, [0, fps * 0.6, fps * 1.2], [0.9, 1.3, 0.9], {
                    easing: Easing.bezier(0.4, 0, 0.2, 1),
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                    output: 'perceptual-scale',
                  })
                : 1,
            }}
          />
          <span
            style={{
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            GEO-SYNC · 23°42&#39;N 90°22&#39;E · APEX 35,786 KM
          </span>
        </Interactive.Div>

        {/* Top-right stream */}
        <Interactive.Div
          name="HUD optical stream status"
          style={{
            position: 'absolute',
            top: 80,
            right: 32,
            textAlign: 'right',
            color: 'rgba(255,255,255,0.5)',
            opacity: shouldAnimate
              ? interpolate(frame, [fps * 0.5, fps * 1.1], [0, 1], {
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : 1,
            translate: shouldAnimate
              ? interpolate(frame, [fps * 0.5, fps * 1.1], ['0px 6px', '0px 0px'], {
                  easing: Easing.spring({ damping: 200 }),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : '0px 0px',
          }}
        >
          OPTICAL SENSOR STREAM · 30 FPS · RES-ADAPTIVE
        </Interactive.Div>

        {/* Reticles — four corners, scale in */}
        <Interactive.Div
          name="Reticle top-left"
          style={{
            position: 'absolute',
            top: 96,
            left: 24,
            color: 'rgba(255,255,255,0.2)',
            fontSize: 12,
            opacity: shouldAnimate
              ? interpolate(frame, [fps * 0.8, fps * 1.2], [0, 1], {
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : 1,
            scale: shouldAnimate
              ? interpolate(frame, [fps * 0.8, fps * 1.2], [0.8, 1], {
                  easing: Easing.spring({ damping: 200 }),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  output: 'perceptual-scale',
                })
              : 1,
          }}
        >
          +
        </Interactive.Div>
        <Interactive.Div
          name="Reticle top-right"
          style={{
            position: 'absolute',
            top: 96,
            right: 32,
            color: 'rgba(255,255,255,0.2)',
            fontSize: 12,
            opacity: shouldAnimate
              ? interpolate(frame, [fps * 0.8, fps * 1.2], [0, 1], {
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : 1,
            scale: shouldAnimate
              ? interpolate(frame, [fps * 0.8, fps * 1.2], [0.8, 1], {
                  easing: Easing.spring({ damping: 200 }),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  output: 'perceptual-scale',
                })
              : 1,
          }}
        >
          +
        </Interactive.Div>
        <Interactive.Div
          name="Reticle bottom-left"
          style={{
            position: 'absolute',
            bottom: 64,
            left: 24,
            color: 'rgba(255,255,255,0.2)',
            fontSize: 12,
            opacity: shouldAnimate
              ? interpolate(frame, [fps * 0.9, fps * 1.3], [0, 1], {
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : 1,
            scale: shouldAnimate
              ? interpolate(frame, [fps * 0.9, fps * 1.3], [0.8, 1], {
                  easing: Easing.spring({ damping: 200 }),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  output: 'perceptual-scale',
                })
              : 1,
          }}
        >
          +
        </Interactive.Div>
        <Interactive.Div
          name="Reticle bottom-right"
          style={{
            position: 'absolute',
            bottom: 64,
            right: 32,
            color: 'rgba(255,255,255,0.2)',
            fontSize: 12,
            opacity: shouldAnimate
              ? interpolate(frame, [fps * 0.9, fps * 1.3], [0, 1], {
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : 1,
            scale: shouldAnimate
              ? interpolate(frame, [fps * 0.9, fps * 1.3], [0.8, 1], {
                  easing: Easing.spring({ damping: 200 }),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  output: 'perceptual-scale',
                })
              : 1,
          }}
        >
          +
        </Interactive.Div>

        {/* Horizon reference line — opacity in */}
        <Interactive.Div
          name="Horizon reference line"
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            width: '100%',
            height: 1,
            background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.07), transparent)',
            opacity: shouldAnimate
              ? interpolate(frame, [fps * 1, fps * 1.6], [0, 1], {
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : 1,
          }}
        />
      </Interactive.Div>

      {/* ── Layer 4: Cinematic Color Grade Overlay (Grade) ──────────── */}
      <Interactive.Div
        name="Soft-light grade"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 3,
          pointerEvents: 'none',
          backgroundColor: '#0f3a7a',
          opacity: 0.2,
          mixBlendMode: 'soft-light',
        }}
      />
      <Interactive.Div
        name="Exposure curve"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 4,
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(5,7,14,0.18) 32%, rgba(5,7,14,0.68) 72%, rgba(5,7,14,0.92) 100%)',
        }}
      />

      {/* ── Layer 5: Procedural Film Grain & Vignette ────────────────── */}
      <Interactive.Div
        name="Film grain — SVG fractal noise"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 5,
          pointerEvents: 'none',
          opacity: 0.04,
          mixBlendMode: 'overlay',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E")`,
          backgroundSize: '220px 220px',
        }}
      />

      <Interactive.Div
        name="Vignette — dual-zone elliptical"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 6,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse at center, transparent 38%, rgba(5,7,14,0.55) 75%, rgba(5,7,14,0.95) 100%)',
        }}
      />
    </Interactive.Div>
  );
};

export default HeroCinematicBackground;
