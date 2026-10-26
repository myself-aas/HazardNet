/**
 * Remotion motion-graphics theme.
 *
 * The keys are stable because the compositions read them; the values are the design
 * system, not a second palette. This object used to carry a NASA-era "cosmic void" world
 * (`#05070E` ground, `#22D3EE` cyan accent, its own blues) that no page used and that
 * contradicted the Apple tokens the rest of the product draws from. A composition is
 * still a branded surface: it takes the same ink, accent and status colours.
 */

import { APPLE_COLORS, APPLE_SEVERITY } from '@hazardnet/design-system';

export const remotionTheme = {
  colors: {
    /** The OLED ground a film opens on — the product's own black. */
    bg: APPLE_COLORS.surfaceBlack,
    bgAlt: APPLE_COLORS.surfaceTile1,

    /** Action Blue. The one accent. */
    primary: APPLE_COLORS.primary,
    primaryShade: APPLE_COLORS.primaryFocus,
    /** Sky Link Blue is the accent at dark-surface contrast; there is no cyan. */
    accent: APPLE_COLORS.primaryOnDark,
    accentGlow: `color-mix(in srgb, ${APPLE_COLORS.primaryOnDark} 35%, transparent)`,
    heroGlow: `color-mix(in srgb, ${APPLE_COLORS.primary} 45%, transparent)`,

    /** Text on the dark ground. */
    text: APPLE_COLORS.onDark,
    textDim: APPLE_COLORS.bodyMuted,
    textTelemetry: APPLE_COLORS.helper,

    /** Telemetry and HUD rules. */
    hudBorder: `color-mix(in srgb, ${APPLE_COLORS.onDark} 12%, transparent)`,
    hudActive: APPLE_COLORS.primary,
  },

  /** Non-linear easing curves (never linear interpolation). */
  ease: {
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',      // smooth decelerate
    inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',   // symmetrical organic ease
    snappy: 'cubic-bezier(0.25, 1, 0.5, 1)',   // fast, punchy entrance
    breathe: 'cubic-bezier(0.4, 0, 0.2, 1)',   // gentle sin-wave approximation
  },

  /** Grade presets — five-layer stack, all derived from the same black. */
  grade: {
    softLightOpacity: 0.20,
    linearGradient:
      `linear-gradient(180deg, color-mix(in srgb, ${APPLE_COLORS.surfaceBlack} 32%, transparent) 0%, ` +
      `color-mix(in srgb, ${APPLE_COLORS.surfaceBlack} 18%, transparent) 32%, ` +
      `color-mix(in srgb, ${APPLE_COLORS.surfaceBlack} 68%, transparent) 72%, ` +
      `color-mix(in srgb, ${APPLE_COLORS.surfaceBlack} 92%, transparent) 100%)`,
  },

  vignette: {
    radial:
      `radial-gradient(ellipse at center, transparent 38%, ` +
      `color-mix(in srgb, ${APPLE_COLORS.surfaceBlack} 55%, transparent) 75%, ` +
      `color-mix(in srgb, ${APPLE_COLORS.surfaceBlack} 95%, transparent) 100%)`,
  },

  /** Data encodings a composition may draw. */
  severity: APPLE_SEVERITY,
} as const;
