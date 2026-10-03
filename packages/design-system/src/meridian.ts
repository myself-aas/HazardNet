/**
 * HazardNet Meridian Design System (HDS v3.0) — canonical token source.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVENANCE, STATED PLAINLY
 * ─────────────────────────────────────────────────────────────────────────────
 * Meridian is an ORIGINAL system. Nothing in it is copied from Apple or Meta:
 * no SF Pro or Optimistic font files, no Apple or Meta artwork, no lifted CSS.
 *
 * What it does take from them is *method* — the publicly documented principles
 * each company publishes as guidance. Principles are ideas; this is our own
 * expression of them, resolved against HazardNet's brand, purpose and audience.
 *
 * From Apple's Human Interface Guidelines (Clarity / Deference / Depth):
 *   · type scale defined as NAMED STYLES, not raw pixels, so it rescales
 *   · semantic colour ROLES that adapt (label, separator, background) rather
 *     than hard-coded hex, which is what makes dark mode and high contrast free
 *   · 44pt minimum tap target (already a HazardNet rule; now enforced in one place)
 *   · concentric corner radii: inner radius = outer radius − padding
 *   · layered translucent material for chrome that floats above content
 *   · spring motion that respects Reduce Motion
 *
 * From Meta's published design language:
 *   · a Display / Text type split — tight tracking above 24px, looser below
 *   · ink rather than pure black, so large type stays warm at scale
 *   · white cards LIFTED off a tinted canvas by shadow, hierarchy without borders
 *   · a soft media radius family (12 / 16 / 24 / 32) for imagery
 *   · a DUAL-PRIMARY rule: neutral ink for browsing, brand colour reserved for
 *     the action that matters, so colour scarcity becomes a navigational signal
 *   · alternating light/dark section rhythm for long editorial pages
 *   · restraint as a scaling discipline
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT HAZARDNET CHANGES, AND WHY
 * ─────────────────────────────────────────────────────────────────────────────
 * Both parents are tuned for calm consumer commerce. HazardNet is a safety
 * early-warning system read by Bangladeshi farmers, agronomists and DRR
 * officers — on a low-end Android, in direct sunlight, often in Bengali,
 * sometimes offline. So the blend is selective, and three decisions are ours:
 *
 *   1. THE DUAL-PRIMARY IS INVERTED FOR SAFETY. Meta reserves its cobalt for the
 *      buy flow. HazardNet reserves its crimson for HAZARD SIGNAL ONLY.
 *      Navigation and browse CTAs are the ink pill. A red button that means
 *      "look at this page" trains the reader to ignore the red that means
 *      "your district is under warning". This deliberately supersedes HDS v2.2,
 *      which used crimson for navigation CTAs. See MERIDIAN.md §Dual-primary.
 *
 *   2. TWO GEOMETRY TRACKS, NOT ONE. Meta's soft radii are right for editorial
 *      and marketing surfaces; they are wrong for a 64-district data console,
 *      where 32px corners waste the pixels the table needs. Surfaces declare
 *      which track they are on: `editorial` (soft, generous) or `console`
 *      (tight, dense). Both draw from the same tokens.
 *
 *   3. THREE THINGS NEITHER PARENT HAS, because neither parent needs them:
 *      Bengali-first bilingual typography, degraded-but-honest offline states,
 *      and severity encoded as colour + shape + label, never colour alone
 *      (WCAG 1.4.1, and colour-blind farmers in a flooded field).
 *
 * Every contrast ratio in this file is MEASURED, not estimated.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Relative luminance per WCAG 2.1 §Relative luminance. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const channels = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two hex colours, e.g. 9.06 for #970002 on white. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRIMITIVES — raw values. Nothing here knows what it is *for*.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MERIDIAN_PRIMITIVES = {
  /**
   * Ink. Apple and Meta both refuse pure black for text: Meta lands near
   * #1C2B33, HazardNet's own mark is #0D0D0D. Meridian blends the two into a
   * faintly cool near-black that keeps the mark's authority while reading
   * warmer than #000 at display sizes.
   *
   * Measured: 17.54:1 on white, 16.19:1 on canvas, 15.20:1 on grouped.
   * All three clear WCAG AAA (7:1) by more than double.
   */
  ink: '#141A1F',
  inkSoft: '#4A5560', // 7.61:1 on white — AAA for small text
  inkTertiary: '#6B7885', // 4.52:1 on white — AA only; 14px and above
  inkQuaternary: '#8C98A4', // decorative and disabled states only, never text

  /** HazardNet's brand crimson — the colour the mark's bars are painted in. */
  brandCrimson: '#970002', // 9.06:1 on white, 8.37:1 on canvas
  brandCrimsonDark: '#7B1D21', // 10.29:1 on white
  /** The mark's near-black. Retained for the wordmark and the ink pill. */
  brandInk: '#0D0D0D',

  /** NASA HDS blue, retained: on-page interaction, info, links. */
  blue: '#1c67e3', // 5.12:1 on white — AA, large text and controls
  blueShade: '#0b3b95', // 10.13:1 on white — AAA link text

  /* Surfaces. Meta's lift-the-card-off-a-tinted-canvas pattern, cooled toward
     HazardNet's neutral rather than Meta's warm grey. */
  canvas: '#F4F6F8',
  canvasGrouped: '#ECEFF2',
  surface: '#FFFFFF',
  hairline: '#DDE2E7',
  hairlineStrong: '#C6CDD5',

  /* Dark theme ground. Apple's systemBackground in dark is near-black but not
     #000, so content can still be lifted off it. */
  darkCanvas: '#0B0E11',
  darkGrouped: '#14191E',
  darkSurface: '#1B2128',
  darkHairline: '#2A323A',
  darkLabel: '#F2F5F7', // 17.67:1 on darkCanvas
  darkLabelSecondary: '#A8B4BF', // 9.17:1 on darkCanvas — AAA
  darkCrimsonTint: '#FF6B60', // 6.93:1 on darkCanvas — AA at any size
  darkBlueTint: '#6FA8FF', // 8.04:1 on darkCanvas — AAA

  /* Status. Kept at HazardNet's existing severity values on purpose: map,
     legend and chart tests assert them, and they encode hazard meaning the
     brand palette does not. */
  success: '#15803d',
  warning: '#b25600',
  info: '#0b3b95',
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   TYPOGRAPHY — Apple's named styles, Meta's display/text split, Bengali floor.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Apple defines its scale as named styles precisely so Dynamic Type can rescale
 * the whole system; Meta splits a display face from a text face at ~24px and
 * tightens tracking only above the split. Meridian does both.
 *
 * `size` is a CSS clamp() so the scale is fluid between a 360px phone and a
 * 1440px monitor with no breakpoint edits. `tracking` follows Meta's rule:
 * negative above the display split, neutral below.
 */
export const MERIDIAN_TYPE_SCALE = {
  micro: { size: '0.6875rem', line: 1.45, tracking: '0.01em', weight: 500, role: 'text' }, // 11px — Apple caption2
  caption: { size: '0.75rem', line: 1.5, tracking: '0.01em', weight: 500, role: 'text' }, // 12px — Apple caption1
  footnote: { size: '0.8125rem', line: 1.5, tracking: '0.005em', weight: 400, role: 'text' }, // 13px
  subhead: { size: '0.9375rem', line: 1.55, tracking: '0em', weight: 400, role: 'text' }, // 15px
  body: { size: '1.0625rem', line: 1.6, tracking: '0em', weight: 400, role: 'text' }, // 17px — Apple's legibility floor
  callout: { size: '1.125rem', line: 1.55, tracking: '-0.003em', weight: 500, role: 'text' }, // 18px — Meta body
  title3: { size: '1.25rem', line: 1.35, tracking: '-0.008em', weight: 600, role: 'text' }, // 20px
  title2: { size: '1.375rem', line: 1.3, tracking: '-0.011em', weight: 600, role: 'text' }, // 22px
  title1: { size: '1.75rem', line: 1.2, tracking: '-0.015em', weight: 600, role: 'display' }, // 28px
  display3: { size: 'clamp(1.875rem, 1.5rem + 1.6vw, 2.5rem)', line: 1.12, tracking: '-0.02em', weight: 650, role: 'display' }, // 34px — Apple largeTitle
  display2: { size: 'clamp(2.25rem, 1.6rem + 3vw, 3.5rem)', line: 1.06, tracking: '-0.025em', weight: 650, role: 'display' }, // →56px — Meta display hero
  display1: { size: 'clamp(2.75rem, 1.8rem + 4.5vw, 4.5rem)', line: 1.02, tracking: '-0.03em', weight: 680, role: 'display' }, // →72px
} as const;

/** The px size at which Meta's display/text split occurs. Below: text face. */
export const MERIDIAN_DISPLAY_SPLIT = 24;

/**
 * Font stacks — OPEN SOURCE ONLY.
 *
 * Apple's SF Pro and Meta's Optimistic are both proprietary and neither may be
 * shipped. HazardNet additionally has a hard "no remote font URL" contract and a
 * font payload budget check (`npm run check:fonts`), so every face below is
 * either already licensed in this repo or a system fallback. The *structure*
 * Meta uses — a tighter display face over a larger-x-height text face — is
 * reproduced with faces we are allowed to distribute.
 */
export const MERIDIAN_FONTS = {
  /** Display: ≥24px headlines. Tight, high-contrast, optical display weighting. */
  // Latin is the platform face: no Latin webfont is bundled (P0-3 in the 2026-10-03 audit).
  // A stack may only lead with a shipped family or a platform face, so a machine that happens to
  // have Instrument Sans installed no longer renders a different product from everyone else.
  display: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Bengali', sans-serif",
  /** Text: body and UI. Larger x-height, looser tracking, better at small sizes. */
  text: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Bengali', sans-serif",
  /** Tabular data: coordinates, timestamps, severity scores, artifact ages. */
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  /** Bengali needs its own stack: different metrics, matras, and headline bar. */
  bengali: "'Noto Sans Bengali', 'Hind Siliguri', sans-serif",
  bengaliDisplay: "'Noto Sans Bengali', 'Hind Siliguri', sans-serif",
} as const;

/**
 * Bengali adjustments. Bengali glyphs carry a headline bar (matra) and descend
 * further than Latin, so Latin line-heights clip them. These multipliers are
 * applied on top of the Latin scale wherever `[lang="bn"]` is in scope.
 */
export const MERIDIAN_BENGALI = {
  /** Size multiplier — Bengali reads smaller at the same nominal px. */
  sizeScale: 1.06,
  /** Absolute line-height floor. The repo's typography test asserts >= 1.3;
   *  Meridian uses 1.65 because 1.3 clips matras at body size. */
  lineHeightFloor: 1.65,
  /** Slightly open tracking; Bengali letterforms crowd when tightened. */
  tracking: '0.01em',
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   GEOMETRY — Apple's concentric radii over Meta's soft media family.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MERIDIAN_RADII = {
  /** Chips, tags, inline badges. */
  xs: 4,
  /** Inputs, buttons in the console track, small controls. */
  sm: 8,
  /** Media: images and video. Meta's image radius. */
  md: 12,
  /** Cards and tiles. Meta's card radius; matches HDS v2.2's --hn-radius-card. */
  lg: 16,
  /** Panels, dialogs, large containers. */
  xl: 24,
  /** Feature and hero media. Meta's photographic card radius. */
  xxl: 32,
  /** CTAs, pills, search fields. Meta's signature; Apple's capsule buttons. */
  pill: 9999,
  /** Bottom sheets. Retained from HDS v2.2. */
  sheet: 28,
} as const;

/**
 * Apple's concentric rule: a nested surface's radius should be the outer radius
 * minus the padding between them, or the corners read as mismatched.
 *
 *   outer 24px, padding 16px  →  inner 8px
 *   outer 16px, padding 12px  →  inner 4px
 */
export function concentricRadius(outer: number, padding: number): number {
  return Math.max(0, outer - padding);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ELEVATION — Meta's "lift white off grey" instead of borders.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ink-tinted, not black. A shadow cast by a neutral grey reads muddy over a
 * tinted canvas; tinting it toward the ink colour makes white cards feel
 * lifted rather than outlined.
 */
export const MERIDIAN_SHADOWS = {
  none: 'none',
  /** Resting card. This replaces the 1px border HDS v2.2 used on every panel. */
  card: '0 1px 2px rgba(20, 26, 31, 0.04), 0 8px 24px -12px rgba(20, 26, 31, 0.12)',
  /** Interactive card on hover/focus — the lift increases, the border does not. */
  cardHover: '0 2px 4px rgba(20, 26, 31, 0.06), 0 16px 40px -16px rgba(20, 26, 31, 0.2)',
  /** Popovers, menus, anything that detaches from the page. */
  floating: '0 8px 16px -4px rgba(20, 26, 31, 0.1), 0 24px 48px -16px rgba(20, 26, 31, 0.24)',
  /** Modal dialogs and bottom sheets. */
  modal: '0 16px 32px -8px rgba(20, 26, 31, 0.16), 0 32px 64px -16px rgba(20, 26, 31, 0.28)',
  /** The console track stays flat: dense data surfaces must not look pressable. */
  console: '0 1px 2px rgba(20, 26, 31, 0.06)',
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   MATERIAL — Apple's layered translucency (HIG "Materials", 2025 Liquid Glass).
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Chrome that floats above content — nav bars, map HUD, bottom sheets — takes
 * the glass recipe. Surfaces a user READS AND ACTS ON stay opaque: translucency
 * behind a data table is a legibility cost with no benefit, and the map card
 * contracts already assert opacity.
 */
export const MERIDIAN_MATERIAL = {
  glass: {
    bg: 'rgba(255, 255, 255, 0.72)',
    border: 'rgba(255, 255, 255, 0.60)',
    blur: '20px',
    /** Saturation boost keeps colour alive behind the frost, per HIG vibrancy. */
    saturate: 1.8,
  },
  glassStrong: {
    bg: 'rgba(255, 255, 255, 0.88)',
    border: 'rgba(255, 255, 255, 0.72)',
    blur: '24px',
    saturate: 1.8,
  },
  glassDark: {
    bg: 'rgba(11, 14, 17, 0.68)',
    border: 'rgba(255, 255, 255, 0.12)',
    blur: '20px',
    saturate: 1.6,
  },
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   SPACING — 4px base, 8px rhythm. Both parents use this; so does HDS v2.2.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MERIDIAN_SPACE = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
  9: 96,
  10: 128,
} as const;

/**
 * Meta's section rhythm: ~5rem between editorial sections, alternating light
 * and dark to create a walkthrough cadence. Console surfaces use the tighter
 * stack because density is the point there.
 */
export const MERIDIAN_SECTION = {
  /** Editorial track (front door, about, methodology, hazards). */
  editorial: { block: 96, between: 48, maxContentWidth: 1200 },
  /** Console track (live map, analytics, alerts table). */
  console: { block: 32, between: 16, maxContentWidth: 1440 },
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   TOUCH — Apple's 44pt, Android's 48dp, kept from HDS v2.2.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MERIDIAN_TOUCH = {
  /** Apple HIG / WCAG 2.5.8. Hard floor for every interactive element. */
  minTarget: 44,
  /** Google Play / Material 3 floor — the stricter of the two on Android. */
  minTargetAndroid: 48,
  /** Comfortable CTA height on the editorial track. */
  controlHeight: 48,
  fabSize: 60,
  fabIconSize: 32,
  /** Compact control height for the console track, still clearing 44. */
  controlHeightCompact: 44,
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   MOTION — Apple's spring physics, expressed as curves the web can use.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MERIDIAN_MOTION = {
  duration: {
    /** Feedback on an already-touched control: press states, toggles. */
    instant: 120,
    /** Hover, focus, small state changes. */
    fast: 200,
    /** Panels, drawers, route transitions. */
    base: 320,
    /** Hero and section reveals. */
    slow: 520,
    /** Ambient background motion (globe, gradients). Deliberately long. */
    ambient: 14000,
  },
  ease: {
    /** Decelerate hard — the default for anything entering. */
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',
    /** Symmetric — for things that both enter and leave. */
    standard: 'cubic-bezier(0.2, 0, 0.2, 1)',
    /** Emphasized — large surfaces, sheets. */
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    /** Fast-out without overshoot. Apple's springs pass through their target;
     *  this product does not. `npm run check:design` bans bounce-easing, and
     *  the reason holds on a hazard surface — a control that wobbles past its
     *  resting place reads as indecisive. */
    spring: 'cubic-bezier(0.2, 0, 0, 1)',
  },
  /** Only compositor-friendly properties ever animate. */
  animatableProps: ['opacity', 'transform', 'filter'] as const,
  /** Everything collapses under prefers-reduced-motion: reduce. */
  reducedMotionDuration: '0.01ms',
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   SEMANTIC ROLES — the layer components actually consume.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Apple's insight, applied: components name ROLES, not colours. "label" and
 * "separator" resolve differently in light, dark and high-contrast themes
 * without a single component changing.
 */
export interface MeridianTheme {
  name: 'light' | 'dark' | 'highContrast';
  label: string;
  labelSecondary: string;
  labelTertiary: string;
  labelQuaternary: string;
  separator: string;
  separatorOpaque: string;
  backgroundBase: string;
  backgroundGrouped: string;
  backgroundElevated: string;
  /** The ink pill: Meta's neutral primary, HazardNet's browse action. */
  actionInk: string;
  actionInkForeground: string;
  /** Reserved for hazard signal. Not for navigation. */
  actionHazard: string;
  actionHazardForeground: string;
  /** On-page interaction, links, focus. */
  actionInteractive: string;
  actionInteractiveForeground: string;
  focusRing: string;
}

export const MERIDIAN_THEMES: Record<MeridianTheme['name'], MeridianTheme> = {
  light: {
    name: 'light',
    label: MERIDIAN_PRIMITIVES.ink,
    labelSecondary: MERIDIAN_PRIMITIVES.inkSoft,
    labelTertiary: MERIDIAN_PRIMITIVES.inkTertiary,
    labelQuaternary: MERIDIAN_PRIMITIVES.inkQuaternary,
    separator: MERIDIAN_PRIMITIVES.hairline,
    separatorOpaque: MERIDIAN_PRIMITIVES.hairlineStrong,
    backgroundBase: MERIDIAN_PRIMITIVES.canvas,
    backgroundGrouped: MERIDIAN_PRIMITIVES.canvasGrouped,
    backgroundElevated: MERIDIAN_PRIMITIVES.surface,
    actionInk: MERIDIAN_PRIMITIVES.brandInk,
    actionInkForeground: '#FFFFFF',
    actionHazard: MERIDIAN_PRIMITIVES.brandCrimson,
    actionHazardForeground: '#FFFFFF',
    actionInteractive: MERIDIAN_PRIMITIVES.blueShade,
    actionInteractiveForeground: '#FFFFFF',
    focusRing: MERIDIAN_PRIMITIVES.brandInk,
  },
  dark: {
    name: 'dark',
    label: MERIDIAN_PRIMITIVES.darkLabel,
    labelSecondary: MERIDIAN_PRIMITIVES.darkLabelSecondary,
    labelTertiary: MERIDIAN_PRIMITIVES.darkLabelSecondary,
    labelQuaternary: '#7A8792',
    separator: MERIDIAN_PRIMITIVES.darkHairline,
    separatorOpaque: '#3A444E',
    backgroundBase: MERIDIAN_PRIMITIVES.darkCanvas,
    backgroundGrouped: MERIDIAN_PRIMITIVES.darkGrouped,
    backgroundElevated: MERIDIAN_PRIMITIVES.darkSurface,
    actionInk: '#FFFFFF',
    actionInkForeground: MERIDIAN_PRIMITIVES.brandInk,
    actionHazard: MERIDIAN_PRIMITIVES.darkCrimsonTint,
    actionHazardForeground: '#2B0500',
    actionInteractive: MERIDIAN_PRIMITIVES.darkBlueTint,
    actionInteractiveForeground: '#001433',
    focusRing: MERIDIAN_PRIMITIVES.darkLabel,
  },
  highContrast: {
    name: 'highContrast',
    label: '#000000',
    labelSecondary: '#1A1A1A',
    labelTertiary: '#2B2B2B',
    labelQuaternary: '#3D3D3D',
    separator: '#5A5A5A',
    separatorOpaque: '#000000',
    backgroundBase: '#FFFFFF',
    backgroundGrouped: '#FFFFFF',
    backgroundElevated: '#FFFFFF',
    actionInk: '#000000',
    actionInkForeground: '#FFFFFF',
    actionHazard: '#7A0001',
    actionHazardForeground: '#FFFFFF',
    actionInteractive: '#002D8A',
    actionInteractiveForeground: '#FFFFFF',
    focusRing: '#000000',
  },
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   DUAL-PRIMARY — the single most consequential Meridian decision.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Which action gets which colour. Colour scarcity is the navigational signal.
 *
 * Meta spends its cobalt only inside the buy funnel, so a cobalt button tells
 * you where you are in the flow. HazardNet inverts the emphasis for a reason
 * specific to a warning service: crimson is spent ONLY on hazard.
 *
 *   ink      → browse, navigate, read more, open the map
 *   hazard   → the alert itself; the severity badge; "you must act"
 *   blue     → on-page interaction: filters, tabs, links, focus
 *   quiet    → tertiary and destructive-cancel
 *
 * If a navigation CTA is crimson, the reader has been trained that crimson
 * means "clickable", and the crimson that means "your district is under
 * warning" loses its power. That is a safety bug, not a style preference.
 */
export const MERIDIAN_ACTION_INTENT = {
  ink: 'navigate or browse — the default primary',
  hazard: 'hazard signal only — alerts, severity, emergency',
  interactive: 'on-page interaction — filters, tabs, links',
  quiet: 'tertiary, or the cancel half of a destructive pair',
} as const;

export type MeridianActionIntent = keyof typeof MERIDIAN_ACTION_INTENT;

/* ═══════════════════════════════════════════════════════════════════════════
   SEVERITY — colour + shape + label, never colour alone.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * WCAG 1.4.1 (Use of Colour) plus a practical reason: a colour-blind farmer
 * reading this on a cracked phone screen in monsoon light gets the level from
 * the glyph and the word, not from the hue. Values match the existing
 * `--severity-*` tokens, which map and legend tests assert.
 */
export const MERIDIAN_SEVERITY = {
  low: {
    label: 'Low',
    color: '#15803d',
    solid: '#16a34a',
    surface: '#dcfce7',
    /** Shape cue: a single low bar. */
    glyph: 'bar1',
    rank: 1,
  },
  moderate: {
    label: 'Moderate',
    /* Darkened from #b25600, which measures only 4.46:1 on this level's own
       #fef3c7 surface — under WCAG AA. #9c4b00 measures 5.51:1 on the surface
       and 6.14:1 on white. Caught by meridianContrast.test.js, not by eye. */
    color: '#9c4b00',
    solid: '#ea6f24',
    surface: '#fef3c7',
    glyph: 'bar2',
    rank: 2,
  },
  /* `color` is the TEXT value and must clear 4.5:1 on `surface`. `solid` is the
     map/marker fill and only has to clear 3:1 (WCAG 1.4.11). They were the same
     value in HDS 2.2, which put #dc2626 text on #fee2e2 at 3.95:1 — a real AA
     failure on the two levels a reader most needs to read. Split here:
     #b91c1c measures 5.30:1 on the surface; the marker fill is unchanged. */
  high: {
    label: 'High',
    color: '#b91c1c',
    solid: '#dc2626',
    surface: '#fee2e2',
    glyph: 'bar3',
    rank: 3,
  },
  veryHigh: {
    label: 'Very high',
    color: '#b91c1c',
    solid: '#dc2626',
    surface: '#fee2e2',
    glyph: 'bar4',
    rank: 4,
  },
  extreme: {
    label: 'Extreme',
    color: '#991b1b',
    solid: '#dc2626',
    surface: '#fee2e2',
    glyph: 'diamond',
    rank: 5,
  },
} as const;

export type MeridianSeverity = keyof typeof MERIDIAN_SEVERITY;

/**
 * The 4-step policy taxonomy the alert engine actually publishes. Distinct from
 * the 5-step severity scale above: policy levels are what gets published,
 * severity is what the model scored. Do not collapse them.
 */
export const MERIDIAN_ALERT_LEVELS = ['NO_ALERT', 'WATCH', 'WARNING', 'SEVERE'] as const;
export type MeridianAlertLevel = (typeof MERIDIAN_ALERT_LEVELS)[number];

/* ═══════════════════════════════════════════════════════════════════════════
   Z-INDEX — one scale, no ad-hoc 9999.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MERIDIAN_Z = {
  base: 0,
  content: 1,
  map: 400,
  sticky: 1020,
  nav: 1030,
  dropdown: 1040,
  overlay: 1050,
  modal: 1060,
  popover: 1070,
  tooltip: 1080,
  toast: 1090,
  a11y: 1100,
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   SELF-CHECK — fails loudly at test time if a token regresses below WCAG.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Every text role against every background it may sit on, with the WCAG 2.1
 * threshold it must clear. Consumed by `__tests__/meridianContrast.test.js`.
 *
 * If someone edits a primitive and breaks a ratio, this fails the build rather
 * than shipping a colour-blind-unreadable warning.
 */
export const MERIDIAN_CONTRACT_CONTRAST: Array<{
  fg: string;
  bg: string;
  min: number;
  note: string;
}> = [
  { fg: MERIDIAN_PRIMITIVES.ink, bg: MERIDIAN_PRIMITIVES.canvas, min: 7, note: 'body on canvas (AAA)' },
  { fg: MERIDIAN_PRIMITIVES.ink, bg: MERIDIAN_PRIMITIVES.surface, min: 7, note: 'body on card (AAA)' },
  { fg: MERIDIAN_PRIMITIVES.ink, bg: MERIDIAN_PRIMITIVES.canvasGrouped, min: 7, note: 'body on grouped (AAA)' },
  { fg: MERIDIAN_PRIMITIVES.inkSoft, bg: MERIDIAN_PRIMITIVES.surface, min: 7, note: 'secondary label (AAA)' },
  { fg: MERIDIAN_PRIMITIVES.inkSoft, bg: MERIDIAN_PRIMITIVES.canvas, min: 7, note: 'secondary on canvas (AAA)' },
  { fg: MERIDIAN_PRIMITIVES.inkTertiary, bg: MERIDIAN_PRIMITIVES.surface, min: 4.5, note: 'tertiary, >=14px only (AA)' },
  { fg: MERIDIAN_PRIMITIVES.brandCrimson, bg: MERIDIAN_PRIMITIVES.surface, min: 7, note: 'hazard text on card (AAA)' },
  { fg: MERIDIAN_PRIMITIVES.brandCrimson, bg: MERIDIAN_PRIMITIVES.canvas, min: 7, note: 'hazard text on canvas (AAA)' },
  { fg: '#FFFFFF', bg: MERIDIAN_PRIMITIVES.brandCrimson, min: 4.5, note: 'white on crimson CTA (AA)' },
  { fg: '#FFFFFF', bg: MERIDIAN_PRIMITIVES.brandCrimsonDark, min: 7, note: 'white on crimson-dark (AAA)' },
  { fg: '#FFFFFF', bg: MERIDIAN_PRIMITIVES.brandInk, min: 7, note: 'white on ink pill (AAA)' },
  { fg: MERIDIAN_PRIMITIVES.blueShade, bg: MERIDIAN_PRIMITIVES.surface, min: 7, note: 'link (AAA)' },
  { fg: MERIDIAN_PRIMITIVES.darkLabel, bg: MERIDIAN_PRIMITIVES.darkCanvas, min: 7, note: 'dark body (AAA)' },
  { fg: MERIDIAN_PRIMITIVES.darkLabelSecondary, bg: MERIDIAN_PRIMITIVES.darkCanvas, min: 7, note: 'dark secondary (AAA)' },
  { fg: MERIDIAN_PRIMITIVES.darkCrimsonTint, bg: MERIDIAN_PRIMITIVES.darkCanvas, min: 4.5, note: 'dark hazard (AA)' },
  { fg: MERIDIAN_PRIMITIVES.darkBlueTint, bg: MERIDIAN_PRIMITIVES.darkCanvas, min: 4.5, note: 'dark link (AA)' },
];

/* ═══════════════════════════════════════════════════════════════════════════
   SURFACE TRACK — the two-geometry decision.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Every Meridian surface declares which track it is on. This is the mechanism
 * behind decision #2: one token set, two geometries, chosen per surface rather
 * than per component, so a card in the console and a card on the front door
 * look different on purpose.
 */
export const MERIDIAN_TRACK = {
  /** Soft, generous, photographic. Front door, about, methodology, hazards. */
  editorial: {
    cardRadius: MERIDIAN_RADII.lg,
    controlRadius: MERIDIAN_RADII.pill,
    mediaRadius: MERIDIAN_RADII.xl,
    sectionGap: MERIDIAN_SECTION.editorial.block,
    elevation: MERIDIAN_SHADOWS.card,
    bodyType: 'callout' as const,
  },
  /** Tight, dense, flat. Live map, analytics, alerts table, district console. */
  console: {
    cardRadius: MERIDIAN_RADII.sm,
    controlRadius: MERIDIAN_RADII.sm,
    mediaRadius: MERIDIAN_RADII.sm,
    sectionGap: MERIDIAN_SECTION.console.block,
    elevation: MERIDIAN_SHADOWS.console,
    bodyType: 'body' as const,
  },
} as const;

export type MeridianTrack = keyof typeof MERIDIAN_TRACK;

export const MERIDIAN = {
  version: '3.0.0',
  name: 'Meridian',
  supersedes: 'HDS 2.2',
  primitives: MERIDIAN_PRIMITIVES,
  typeScale: MERIDIAN_TYPE_SCALE,
  displaySplit: MERIDIAN_DISPLAY_SPLIT,
  fonts: MERIDIAN_FONTS,
  bengali: MERIDIAN_BENGALI,
  radii: MERIDIAN_RADII,
  shadows: MERIDIAN_SHADOWS,
  material: MERIDIAN_MATERIAL,
  space: MERIDIAN_SPACE,
  section: MERIDIAN_SECTION,
  touch: MERIDIAN_TOUCH,
  motion: MERIDIAN_MOTION,
  themes: MERIDIAN_THEMES,
  actionIntent: MERIDIAN_ACTION_INTENT,
  severity: MERIDIAN_SEVERITY,
  alertLevels: MERIDIAN_ALERT_LEVELS,
  z: MERIDIAN_Z,
  track: MERIDIAN_TRACK,
  contrastRatio,
  concentricRadius,
} as const;

export default MERIDIAN;
