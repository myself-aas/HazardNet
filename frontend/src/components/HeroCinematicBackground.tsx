import React from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  EARTH_HERO_VIDEO_1080P,
  EARTH_HERO_VIDEO_720P,
  EARTH_HERO_VIDEO_540P,
  EARTH_HERO_VIDEO_BACKUP_MP4,
  EARTH_HERO_POSTER,
} from '../lib/heroMedia';
import { remotionTheme } from '../lib/remotionTheme';

/**
 * HeroCinematicBackground
 *
 * Implements the 5-layer motion graphics compositing stack from the Remotion Motion Graphics craft:
 * 1. Background Mesh (`BgMesh`): Organic floating radial gradient mesh (never flat solid black).
 * 2. Video Asset (`HeroVideoAsset`): Resolution-adaptive Earth & Moon video with idle breathing micro-motion.
 * 3. Observatory Telemetry HUD (`HeroTelemetryHud`): Geostationary orbital coordinates, reticles, and stream status.
 * 4. Cinematic Color Grade (`Grade`): Soft-light atmospheric color grading and vertical exposure curve.
 * 5. Procedural Grain & Vignette (`Grain + Vignette`): Zero-asset SVG fractal noise film grain and dual-zone elliptical vignette.
 *
 * @see https://github.com/haidrrrry/claude-remotion-skill/blob/main/remotion-motion-graphics/SKILL.md
 */
export const HeroCinematicBackground: React.FC<{ paused?: boolean }> = ({ paused = false }) => {
  const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
  const reduceMotion = useReducedMotion();
  const shouldAnimate = !reduceMotion && !paused && !isTest;
  const shouldPlayVideo = shouldAnimate;

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none bg-[#05070E]"
    >
      {/* ── Layer 1: Background Mesh (BgMesh) ────────────────────────── */}
      {/* Two radiant orbital light spheres with organic floating breathing drift */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Primary NASA Blue orbital glow (top-left towards center) */}
        <div
          className={`absolute -top-[25%] -left-[15%] w-[850px] h-[850px] sm:w-[1100px] sm:h-[1100px] rounded-full opacity-40 pointer-events-none ${shouldAnimate ? 'animate-pulse' : ''}`}
          style={{
            background: `radial-gradient(circle, ${remotionTheme.colors.primary}55 0%, ${remotionTheme.colors.primaryShade}22 50%, transparent 70%)`,
            filter: 'blur(var(--hero-glow-blur-primary))',
            animationDuration: shouldAnimate ? '9s' : undefined,
          }}
        />
        {/* Atmospheric Cyan secondary reflection (bottom-right) */}
        <div
          className="absolute -bottom-[20%] -right-[10%] w-[700px] h-[700px] sm:w-[900px] sm:h-[900px] rounded-full opacity-30 pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${remotionTheme.colors.accent}44 0%, transparent 68%)`,
            filter: 'blur(var(--hero-glow-blur-secondary))',
          }}
        />
      </div>

      {/* ── Layer 2: Video Asset (HeroVideoAsset with Idle Breathing) ── */}
      {shouldPlayVideo ? (
        <div className={`absolute inset-0 w-full h-full transform scale-[1.02] transition-transform duration-1000 ${shouldAnimate ? 'motion-safe:animate-[pulse_14s_ease-in-out_infinite]' : ''}`}>
          <video
            autoPlay
            loop
            muted
            playsInline
            poster={EARTH_HERO_POSTER}
            className="w-full h-full object-cover"
          >
            <source src={EARTH_HERO_VIDEO_1080P} type="video/mp4" media="(min-width: 1024px)" />
            <source src={EARTH_HERO_VIDEO_720P} type="video/mp4" media="(min-width: 640px)" />
            <source src={EARTH_HERO_VIDEO_540P} type="video/mp4" />
            <source src={EARTH_HERO_VIDEO_BACKUP_MP4} type="video/mp4" />
          </video>
        </div>
      ) : (
        /* Poster fallback: reduced-motion, paused, or test — no video decode, no motion drain */
        <div
          className="absolute inset-0 w-full h-full bg-cover bg-center"
          style={{ backgroundImage: `url("${EARTH_HERO_POSTER}")` }}
        />
      )}

      {/* ── Layer 3: Observatory Telemetry HUD (Graphics / Type) ────── */}
      <div className="absolute inset-0 z-[2] font-mono text-[10px] tracking-wider text-white/30 select-none pointer-events-none hidden md:block">
        {/* Top-left Telemetry Coordinates: Bangladesh Geostationary Apex */}
        <div className="absolute top-20 left-6 flex items-center gap-2">
          <span className={`inline-block w-1.5 h-1.5 bg-sky-400 rounded-full ${shouldAnimate ? 'animate-ping' : ''}`} />
          <span className="text-white/50">GEO-SYNC · 23°42&apos;N 90°22&apos;E · APEX 35,786 KM</span>
        </div>

        {/* Top-right Optical Stream Status */}
        <div className="absolute top-20 right-8 text-right text-white/50">
          <span>OPTICAL SENSOR STREAM · 30 FPS · RES-ADAPTIVE</span>
        </div>

        {/* Reticle Corner Crosshairs */}
        <div className="absolute top-24 left-6 text-white/20 text-xs">+</div>
        <div className="absolute top-24 right-8 text-white/20 text-xs">+</div>
        <div className="absolute bottom-16 left-6 text-white/20 text-xs">+</div>
        <div className="absolute bottom-16 right-8 text-white/20 text-xs">+</div>

        {/* Subtle Horizontal Horizon Reference Line */}
        <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
      </div>

      {/* ── Layer 4: Cinematic Color Grade Overlay (Grade) ──────────── */}
      {/* Soft-light atmospheric NASA Blue tint */}
      <div
        className="absolute inset-0 z-[3] pointer-events-none mix-blend-soft-light"
        style={{
          backgroundColor: remotionTheme.colors.primaryShade,
          opacity: remotionTheme.grade.softLightOpacity,
        }}
      />
      {/* Multi-stop vertical exposure curve: anchors hero typography while preserving cosmic vista */}
      <div
        className="absolute inset-0 z-[4] pointer-events-none"
        style={{ background: remotionTheme.grade.linearGradient }}
      />

      {/* ── Layer 5: Procedural Film Grain & Vignette ────────────────── */}
      {/* Zero-asset procedural SVG fractal noise film grain to prevent banding */}
      <div
        className="absolute inset-0 z-[5] pointer-events-none opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E")`,
          backgroundSize: '220px 220px',
        }}
      />

      {/* Dual-zone elliptical vignette focusing attention on Earth & Moon */}
      <div
        className="absolute inset-0 z-[6] pointer-events-none"
        style={{ background: remotionTheme.vignette.radial }}
      />
    </div>
  );
};

export default HeroCinematicBackground;
