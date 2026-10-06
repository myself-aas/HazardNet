/**
 * Remotion Motion Graphics Design System Theme
 * 
 * Single source of truth for motion design tokens, color grades, and easing curves
 * based on the Remotion Motion Graphics craft guidelines.
 * @see https://github.com/haidrrrry/claude-remotion-skill/blob/main/remotion-motion-graphics/SKILL.md
 */

export const remotionTheme = {
  colors: {
    // Deep cosmic space void base
    bg: '#05070E',
    bgAlt: '#0A0E1A',
    
    // THE hero colors — directed visual hierarchy
    primary: '#0066cc',      // NASA Blue
    primaryShade: '#0f3a7a', // Deep NASA Blue
    accent: '#22D3EE',       // Atmospheric cyan telemetry
    accentGlow: 'rgba(34, 211, 238, 0.35)',
    heroGlow: 'rgba(28, 103, 227, 0.45)',
    
    // High-contrast text & telemetry
    text: '#FFFFFF',
    textDim: '#A1A1AA',
    textTelemetry: '#e0e0e0',
    
    // Telemetry and HUD accents
    hudBorder: 'rgba(255, 255, 255, 0.12)',
    hudActive: '#0066cc',
  },
  
  // Custom non-linear easing curves (Rule 1: NEVER use linear interpolation)
  ease: {
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',      // Smooth decelerate
    inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',   // Symmetrical organic ease
    snappy: 'cubic-bezier(0.25, 1, 0.5, 1)',   // Fast punchy entrance
    breathe: 'cubic-bezier(0.4, 0, 0.2, 1)',   // Gentle sin-wave approximation
  },

  /* The hero's color grade used to live here as `grade` and `vignette`. It moved to
     `lib/heroGrade.ts` on 2026-10-06, because the *page* paints it too (`HeroCinematicBackground`)
     and a grade that only the export knows about is a grade the page drifts away from. This file
     keeps the graphics palette and the easing curves; there is one hero grade and it is not here. */
} as const;
