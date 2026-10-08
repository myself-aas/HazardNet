/**
 * Apple design system — React Native / Windows shape.
 *
 * Same system, different units. The web consumes Apple through CSS custom properties; React
 * Native has no custom properties, no `color-mix()`, no media queries and no cascade, so a
 * native surface needs the resolved numbers and a theme object it can switch by hand.
 *
 * This file RESOLVES `apple.ts`; it never redefines it. Every colour here is either a literal
 * re-export of an Apple token or a pre-computed mix that CSS would have done at paint time. If a
 * value exists in both places and they disagree, `apple.ts` is right and this file is a bug —
 * `__tests__/appleParity.test.js` asserts exactly that.
 *
 * Two deliberate native divergences, both documented:
 *   · Touch floor is 48, not 44. Apple's HIG says 44pt; Android's Material spec says 48dp. A
 *     cross-platform control takes the stricter number. The iOS tab bar keeps its system 49pt.
 *   · Radii are rounded to whole units. Apple's 5/8/11/18 survive; nothing in RN benefits from
 *     a fractional corner.
 */

import {
  APPLE_COLORS,
  APPLE_FONTS,
  APPLE_MOTION,
  APPLE_NEUTRAL,
  APPLE_RADII,
  APPLE_SEVERITY,
  APPLE_SPACE,
  APPLE_TOUCH,
  APPLE_TYPE,
} from './apple';

/* ────────────────────────────────────────────────────────────────────────────
   Colour
   ──────────────────────────────────────────────────────────────────────────── */

export const APPLE_NATIVE_COLORS = {
  /** Surfaces */
  surfaceWhite: APPLE_COLORS.canvas,
  surfaceCanvas: APPLE_COLORS.canvas,
  surfaceSunken: APPLE_COLORS.canvasParchment,
  surfaceRaised: APPLE_COLORS.surfacePearl,
  surfaceTile1: APPLE_COLORS.surfaceTile1,
  surfaceTile2: APPLE_COLORS.surfaceTile2,
  surfaceTile3: APPLE_COLORS.surfaceTile3,
  surfaceBlack: APPLE_COLORS.surfaceBlack,

  /** Ink */
  inkPrimary: APPLE_COLORS.ink,
  inkSoft: APPLE_NEUTRAL['60'],
  inkMuted: APPLE_NEUTRAL['50'],
  inkDisabled: APPLE_NEUTRAL['40'],
  onDark: APPLE_COLORS.bodyOnDark,
  onDarkMuted: APPLE_COLORS.bodyMuted,

  /** The single accent. */
  primary: APPLE_COLORS.primary,
  primaryOnDark: APPLE_COLORS.primaryOnDark,
  primaryFocus: APPLE_COLORS.primaryFocus,
  onPrimary: APPLE_COLORS.onPrimary,

  /** Hairlines */
  hairline: APPLE_COLORS.hairline,
  hairlineSoft: APPLE_COLORS.dividerSoft,
  hairlineStrong: APPLE_NEUTRAL['30'],
  darkHairline: '#3a3a3c',

  /** Frosted material, pre-resolved — RN has no backdrop-filter, so a native
   *  "frosted" bar is an opaque approximation plus a BlurView where available. */
  glassLight: 'rgba(245, 245, 247, 0.8)',
  glassBorderLight: 'rgba(0, 0, 0, 0.08)',
  glassDark: 'rgba(39, 39, 41, 0.8)',
  glassBorderDark: 'rgba(255, 255, 255, 0.12)',

  severity: {
    low: {
      color: APPLE_SEVERITY.low.text,
      surface: APPLE_SEVERITY.low.surface,
      border: '#a5d8bb',
      onDark: APPLE_SEVERITY.low.onDark,
      label: APPLE_SEVERITY.low.label,
    },
    moderate: {
      color: APPLE_SEVERITY.moderate.text,
      surface: APPLE_SEVERITY.moderate.surface,
      border: '#e4c489',
      onDark: APPLE_SEVERITY.moderate.onDark,
      label: APPLE_SEVERITY.moderate.label,
    },
    high: {
      color: APPLE_SEVERITY.high.text,
      surface: APPLE_SEVERITY.high.surface,
      border: '#f0b69c',
      onDark: APPLE_SEVERITY.high.onDark,
      label: APPLE_SEVERITY.high.label,
    },
    veryHigh: {
      color: APPLE_SEVERITY.veryHigh.text,
      surface: APPLE_SEVERITY.veryHigh.surface,
      border: '#f0a3a3',
      onDark: APPLE_SEVERITY.veryHigh.onDark,
      label: APPLE_SEVERITY.veryHigh.label,
    },
    extreme: {
      color: APPLE_SEVERITY.extreme.text,
      surface: APPLE_SEVERITY.extreme.surface,
      border: '#dba3b9',
      onDark: APPLE_SEVERITY.extreme.onDark,
      label: APPLE_SEVERITY.extreme.label,
    },
  },
} as const;

/* ────────────────────────────────────────────────────────────────────────────
   Geometry — Apple's radii and spacing as numbers
   ──────────────────────────────────────────────────────────────────────────── */

export const APPLE_NATIVE_RADIUS = {
  none: 0,
  /** 5 — image thumbs, small media. */
  xs: APPLE_RADII.xs,
  /** 12 — inputs and utility controls. */
  control: APPLE_RADII.input,
  /** 12 — chips and pearl capsules. */
  chip: APPLE_RADII.md,
  /** 20 — cards. Sheets take the 24px `xl` radius below. */
  card: APPLE_RADII.card,
  media: APPLE_RADII.sm,
  feature: APPLE_RADII.lg,
  sheet: APPLE_RADII.xl,
  pill: 9999,
  full: 9999,
} as const;

export const APPLE_NATIVE_SPACE = {
  xxs: APPLE_SPACE.xxs,
  xs: APPLE_SPACE.xs,
  sm: APPLE_SPACE.sm,
  md: APPLE_SPACE.md,
  lg: APPLE_SPACE.lg,
  xl: APPLE_SPACE.xl,
  xxl: APPLE_SPACE.xxl,
  section: APPLE_SPACE.section,
} as const;

/* ────────────────────────────────────────────────────────────────────────────
   Type
   ──────────────────────────────────────────────────────────────────────────── */

export const APPLE_NATIVE_TYPE = {
  families: {
    /** RN resolves `System` to SF on iOS and Roboto on Android — the same
     *  substitution DESIGN.md sanctions for the web. */
    text: 'System',
    display: 'System',
    mono: APPLE_FONTS.mono,
    bengali: 'NotoSansBengali-Regular',
  },
  /** The named styles, as numbers. Line height is resolved from the ratio. */
  scale: Object.fromEntries(
    Object.entries(APPLE_TYPE).map(([name, style]) => [
      name,
      {
        fontSize: style.size,
        // RN wants an absolute line height, not a ratio.
        lineHeight: style.line,
        // The web scale stores tracking in em; RN takes px.
        letterSpacing: Math.round(style.track * style.size * 100) / 100,
        fontWeight: String(style.weight) as '400' | '500' | '600' | '700',
      },
    ]),
  ) as Record<
    keyof typeof APPLE_TYPE,
    { fontSize: number; lineHeight: number; letterSpacing: number; fontWeight: '400' | '500' | '600' | '700' }
  >,
} as const;

/* ────────────────────────────────────────────────────────────────────────────
   Ergonomics & motion
   ──────────────────────────────────────────────────────────────────────────── */

export const APPLE_NATIVE_TOUCH = {
  /** See the header: 48, not Apple's 44, because Android's floor is stricter. */
  min: 48,
  appleMin: APPLE_TOUCH.min,
  tabBarIOS: 49,
  tabBarAndroid: 80,
  navBar: APPLE_TOUCH.navHeight,
  largeTitleIOS: 34,
  bottomSheetHandle: 24,
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
} as const;

export const APPLE_NATIVE_MOTION = {
  pressScale: APPLE_MOTION.pressScale,
  fastMs: APPLE_MOTION.duration.press,
  normalMs: APPLE_MOTION.duration.base,
  slowMs: 350,
  /** The cubic-bezier from `apple.ts`, as the control points RN Easing wants. */
  easing: [0.25, 1, 0.5, 1] as [number, number, number, number],
  /** Critically damped — Apple's sheets settle, they do not bounce. */
  spring: APPLE_MOTION.springStandard,
} as const;

export const APPLE_NATIVE_BORDER = {
  hairline: 1,
  accent: 2,
  ring: 2,
} as const;

/* ────────────────────────────────────────────────────────────────────────────
   Themes

   Three, not two. `highContrast` is a real accessibility mode on both iOS and
   Android, and it is NOT "dark with more contrast": it is the light palette
   pushed to pure black on pure white, which is why it gets its own object.
   ──────────────────────────────────────────────────────────────────────────── */

export interface AppleNativeTheme {
  backgroundBase: string;
  backgroundGrouped: string;
  backgroundElevated: string;
  label: string;
  labelSecondary: string;
  labelTertiary: string;
  hairline: string;
  /** Alias of `hairline`, for call sites that speak UIKit. */
  separator: string;
  /** Text drawn ON `label` used as a fill (an inverted chip). */
  labelForeground: string;
  /** The one accent, on this ground. */
  action: string;
  actionForeground: string;
  link: string;
  focusRing: string;
}

export const APPLE_NATIVE_THEMES = {
  light: {
    backgroundBase: APPLE_COLORS.canvas,
    backgroundGrouped: APPLE_COLORS.canvasParchment,
    backgroundElevated: APPLE_COLORS.surfacePearl,
    label: APPLE_COLORS.ink,
    labelSecondary: APPLE_NEUTRAL['60'],
    labelTertiary: APPLE_NEUTRAL['50'],
    hairline: APPLE_COLORS.hairline,
    separator: APPLE_COLORS.hairline,
    labelForeground: APPLE_COLORS.canvas,
    action: APPLE_COLORS.primary,
    actionForeground: APPLE_COLORS.onPrimary,
    link: APPLE_COLORS.primary,
    focusRing: APPLE_COLORS.primaryFocus,
  },
  dark: {
    backgroundBase: APPLE_COLORS.surfaceBlack,
    backgroundGrouped: APPLE_COLORS.surfaceTile1,
    backgroundElevated: APPLE_COLORS.surfaceTile2,
    label: APPLE_COLORS.bodyOnDark,
    labelSecondary: APPLE_COLORS.bodyMuted,
    labelTertiary: '#9a9a9f',
    hairline: '#3a3a3c',
    separator: '#3a3a3c',
    labelForeground: APPLE_COLORS.surfaceTile3,
    action: APPLE_COLORS.primaryOnDark,
    actionForeground: APPLE_COLORS.surfaceBlack,
    link: APPLE_COLORS.primaryOnDark,
    focusRing: APPLE_COLORS.primaryOnDark,
  },
  highContrast: {
    backgroundBase: APPLE_COLORS.canvas,
    backgroundGrouped: APPLE_COLORS.canvas,
    backgroundElevated: APPLE_COLORS.canvas,
    label: APPLE_COLORS.surfaceBlack,
    labelSecondary: APPLE_COLORS.surfaceBlack,
    labelTertiary: APPLE_NEUTRAL['70'],
    hairline: APPLE_COLORS.surfaceBlack,
    separator: APPLE_COLORS.surfaceBlack,
    labelForeground: APPLE_COLORS.canvas,
    /** Darkened Action Blue: 7.0:1 on white, where the standard 5.57:1 is only AA. */
    action: '#0a4a99',
    actionForeground: APPLE_COLORS.canvas,
    link: '#0a4a99',
    focusRing: APPLE_COLORS.surfaceBlack,
  },
} as const satisfies Record<string, AppleNativeTheme>;

export type AppleNativeThemeName = keyof typeof APPLE_NATIVE_THEMES;

/** Everything, in one object, for consumers that would rather destructure once. */
export const APPLE_NATIVE = {
  colors: APPLE_NATIVE_COLORS,
  radii: APPLE_NATIVE_RADIUS,
  spacing: APPLE_NATIVE_SPACE,
  typography: APPLE_NATIVE_TYPE,
  touch: APPLE_NATIVE_TOUCH,
  motion: APPLE_NATIVE_MOTION,
  border: APPLE_NATIVE_BORDER,
  themes: APPLE_NATIVE_THEMES,
  brand: { platform: 'HazardNet', version: '4.0.0', system: 'Apple' },
} as const;

/* ────────────────────────────────────────────────────────────────────────────
   Severity from a score
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Maps a 0–1 hazard score onto the severity set.
 *
 * The thresholds are the product's, not Apple's, and they are inclusive at the bottom of each
 * band: ≥0.8 extreme, ≥0.6 very high, ≥0.4 high, ≥0.2 moderate, below that low. These are the
 * same cut points the pre-Apple token set used, so no district changes tier in this migration.
 * A score outside 0–1 is clamped rather than rejected, because a model that returns 1.04 should
 * still raise the alarm.
 */
export function getSeverityTokenScore(score: number) {
  const clamped = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
  if (clamped >= 0.8) return APPLE_NATIVE_COLORS.severity.extreme;
  if (clamped >= 0.6) return APPLE_NATIVE_COLORS.severity.veryHigh;
  if (clamped >= 0.4) return APPLE_NATIVE_COLORS.severity.high;
  if (clamped >= 0.2) return APPLE_NATIVE_COLORS.severity.moderate;
  return APPLE_NATIVE_COLORS.severity.low;
}

/* ────────────────────────────────────────────────────────────────────────────
   Data-visualisation ramps

   Sequential ramps for charts and alert tiers. Like severity, these are a DATA
   layer, not chrome — they encode magnitude, so they are allowed hues the
   single-accent rule would otherwise forbid. They are generated from the
   severity hues so a chart, a badge and a map legend agree.
   ──────────────────────────────────────────────────────────────────────────── */

export const APPLE_NATIVE_DATAVIZ = {
  seqYellow10: APPLE_SEVERITY.moderate.surface,
  seqYellow20: '#f5b73d',
  seqYellow30: '#d99a1f',
  seqOrange10: APPLE_SEVERITY.high.surface,
  seqOrange20: '#ffb08a',
  seqOrange50: '#e05a1f',
  seqOrange60: APPLE_SEVERITY.high.text,
  seqOrange70: '#93340c',
  seqOrange80: '#702709',
  seqOrange90: '#4d1b06',
  /** Categorical series — the single accent first, then the severity ramp. */
  seriesA: APPLE_COLORS.primary,
  seriesB: APPLE_SEVERITY.low.text,
  seriesC: APPLE_SEVERITY.moderate.text,
  seriesD: APPLE_SEVERITY.high.text,
  seriesE: APPLE_SEVERITY.extreme.text,
  /** "All clear" / nominal state. */
  activeGreen: APPLE_SEVERITY.low.text,
} as const;
