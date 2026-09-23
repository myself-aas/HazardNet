/**
 * Motion Config — Centralized motion system for HazardNet (performance-first)
 *
 * Follows Remotion interactivity best practices + web performance:
 * - Only GPU-compositor props: opacity, scale, translate, rotate (never width, height, left, top, transform)
 * - Easing: Never linear — use spring or cubic-bezier
 * - Duration: 150-300ms for UI, 400-600ms for hero, 14s breathing for ambient
 * - Reduced motion: useReducedMotion everywhere, no animation when true
 * - 60fps via rAF, will-change only while animating, LazyMotion domAnimation
 *
 * Tokens are inline where used per best practices — this file documents them,
 * but individual components keep values hardcoded in interpolate() calls.
 */

export const motionTokens = {
  fps: 30,
  duration: {
    fast: 150,
    base: 300,
    hero: 600,
    ambient: 14000,
  },
  easing: {
    // Mirrors remotionTheme.ease but as CSS cubic-bezier for web
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',
    inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
    snappy: 'cubic-bezier(0.25, 1, 0.5, 1)',
    breathe: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: { damping: 200 } as const,
  },
  // For interpolate() — keep output ranges hardcoded per best practices
  scale: {
    subtle: [0.98, 1] as const,
    pop: [0.92, 1] as const,
    ping: [0.6, 1.8] as const,
  },
  translate: {
    up: ['0px 8px', '0px 0px'] as const,
    down: ['0px -8px', '0px 0px'] as const,
  },
} as const;
