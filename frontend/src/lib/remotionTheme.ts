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
    primary: '#1c67e3',      // NASA Blue
    primaryShade: '#0f3a7a', // Deep NASA Blue
    accent: '#22D3EE',       // Atmospheric cyan telemetry
    accentGlow: 'rgba(34, 211, 238, 0.35)',
    heroGlow: 'rgba(28, 103, 227, 0.45)',
    
    // High-contrast text & telemetry
    text: '#FFFFFF',
    textDim: '#A1A1AA',
    textTelemetry: '#d1d1d1',
    
    // Telemetry and HUD accents
    hudBorder: 'rgba(255, 255, 255, 0.12)',
    hudActive: '#38BDF8',
  },
  
  // Custom non-linear easing curves (Rule 1: NEVER use linear interpolation)
  ease: {
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',      // Smooth decelerate
    inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',   // Symmetrical organic ease
    snappy: 'cubic-bezier(0.25, 1, 0.5, 1)',   // Fast punchy entrance
    breathe: 'cubic-bezier(0.4, 0, 0.2, 1)',   // Gentle sin-wave approximation
  },

  // Color grade presets (Rule 5: Five-layer stack)
  grade: {
    softLightOpacity: 0.20,
    linearGradient:
      'linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(5,7,14,0.18) 32%, rgba(5,7,14,0.68) 72%, rgba(5,7,14,0.92) 100%)',
  },

  // Vignette gradient
  vignette: {
    radial:
      'radial-gradient(ellipse at center, transparent 38%, rgba(5,7,14,0.55) 75%, rgba(5,7,14,0.95) 100%)',
  },
} as const;
