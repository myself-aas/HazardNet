/**
 * HazardNet Global Design System (HDS v2.2) Tokens
 * Shared Token Engine & Cross-Platform Parity Contract (React PWA + React Native / Expo + RN Windows)
 *
 * Compliant with NASA Horizon Design System (HDS v2.2), WCAG AAA Contrast,
 * Google Material 3 Expressive, and Apple HIG / Android Material touch target standards.
 *
 * NOTE: This file exports two parallel token sets:
 *   - `HDS_TOKENS` — existing bento/expressive tokens used by Windows/Bento surfaces (preserved for back-compat).
 *   - `HDS_NASA_TOKENS` — canonical NASA Horizon Design System tokens matching DESIGN.md (square corners,
 *     hairline rules, carbon neutrals, NASA red for navigation, NASA blue for interaction). The React
 *     web and React Native mobile apps MUST use these for all safety-critical UI.
 *   - `ALERT_LEVELS` — the 4-step policy taxonomy (NO_ALERT / WATCH / WARNING / SEVERE) shared by the
 *     alert engine, web, and mobile. Do NOT map severities to the 5-step expressive scale.
 */

// ---------------------------------------------------------------------------
// Existing HDS 2.2 tokens (expressive / bento). Preserved for back-compat.
// ---------------------------------------------------------------------------

export const HDS_TOKENS = {
  brand: {
    name: 'HazardNet',
    version: '2.2.0',
    platform: 'Multi-Platform (React PWA & React Native & RN Windows)',
  },

  // Color Palette & Semantic Roles
  colors: {
    // NASA HDS Core Brand Colors
    primaryRed: '#f64137',
    primaryRedShade: '#b60109', // 7.0:1 AAA contrast against white
    nasaBlue: '#1c67e3',
    nasaBlueShade: '#0b3b95', // 9.9:1 AAA contrast against white
    nasaOrange: '#ea6f24',
    nasaGreen: '#16a34a',

    // Surfaces & Canvas
    surfaceCanvas: '#f6f6f6',
    surfaceWhite: '#ffffff',
    surfaceSunken: '#e5e5e5',
    surfaceDark: '#0e0e11',
    surfaceDarkCard: '#17171b',

    // Glassmorphism Surfaces (Web + Mobile Backdrop)
    glassLight: 'rgba(255, 255, 255, 0.88)',
    glassDark: 'rgba(14, 14, 17, 0.88)',
    glassBorderLight: 'rgba(23, 23, 27, 0.12)',
    glassBorderDark: 'rgba(255, 255, 255, 0.15)',

    // Ink / Typography Colors
    inkPrimary: '#17171b', // 17.4:1 contrast ratio on canvas
    inkSoft: '#2e2e32',    // 7.1:1 AAA contrast micro-copy
    inkMuted: '#52525b',   // 4.5:1 AA contrast secondary text
    inkInverse: '#f6f6f6',

    // Multi-Hazard Severity Scale (5-Step Agricultural Climate Scale)
    severity: {
      low: {
        label: 'Low / Normal',
        color: '#16a34a',
        surface: '#dcfce7',
        border: '#86efac',
      },
      moderate: {
        label: 'Moderate Advisory',
        color: '#ea6f24',
        surface: '#ffedd5',
        border: '#fdba74',
      },
      high: {
        label: 'High Watch',
        color: '#dc2626',
        surface: '#fee2e2',
        border: '#fca5a5',
      },
      veryHigh: {
        label: 'Very High Warning',
        color: '#b60109',
        surface: '#fee2e2',
        border: '#f87171',
      },
      extreme: {
        label: 'Extreme Critical',
        color: '#7f1d1d',
        surface: '#fecdd3',
        border: '#fda4af',
      },
    },
  },

  // Touch Ergonomics & Component Dimensions
  touch: {
    minTargetSize: 44,    // 44pt x 44pt hit target minimum (Apple HIG & WCAG 2.5.8)
    minTargetSizeAndroid: 48, // 48dp x 48dp hit target minimum (Google Play Store & Material 3)
    fabSize: 60,          // 60px x 60px circular Floating Action Button
    fabIconSize: 32,      // 32px vector icon inside FAB
    headerHeight: 56,     // 56px compact mobile top bar
    bottomSheetSnapMin: 180, // Collapsed bottom sheet height
    bottomSheetSnapMax: 540, // Expanded bottom sheet height
  },

  // Corner Radii & Micro-Surfaces
  radii: {
    sharp: 0,
    control: 2,   // NASA HDS 2px control radius
    card: 16,     // Soft rounded cards (Mobile Bento Grid)
    sheet: 28,    // Glassmorphic drag sheet top corners
    pill: 9999,   // Full rounded badges and action chips
  },

  // Cross-Platform Shadow Definitions
  shadows: {
    flat: 'none',
    card: '0 4px 12px rgba(0, 0, 0, 0.05)',
    elevated: '0 12px 24px -4px rgba(0, 0, 0, 0.12)',
    fab: '0 12px 20px -5px rgba(0, 0, 0, 0.30), 0 6px 12px rgba(28, 103, 227, 0.25)',
  },

  // Bilingual Typography Stacks & Weights
  typography: {
    weights: {
      regular: 400,
      medium: 500,
      semibold: 600, // Standardized weight for buttons and triggers
      bold: 700,
    },
    lineHeights: {
      tight: 1.2,
      heading: 1.3,
      body: 1.62,
      bengali: 1.35, // Mandatory safety floor for Bengali script rendering
    },
    families: {
      sans: "'Plus Jakarta Sans', 'Public Sans Web', 'Noto Sans Bengali', sans-serif",
      heading: "'Instrument Sans', 'Plus Jakarta Sans', 'Anek Bangla', 'Inter', sans-serif",
      display: "'Plus Jakarta Sans', 'Baloo Da 2', sans-serif",
      bengali: "'Noto Sans Bengali', 'Anek Bangla', sans-serif",
      mono: "'DM Mono', monospace",
    },
  },

  // Z-Index Stack Order (Strict Contract)
  zIndex: {
    base: 0,
    mapLayer: 10,
    mapControls: 20,
    stickyHeader: 40,
    bottomSheet: 50,
    modal: 60,
    toast: 70,
    fab: 80,
  },

  // Motion Springs & Easing Specs (Framer Motion + React Native Reanimated)
  motion: {
    springFast: { stiffness: 400, damping: 28 },
    springStandard: { stiffness: 300, damping: 30 },
    springSlow: { stiffness: 200, damping: 32 },
    easeEmphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    easeStandard: 'cubic-bezier(0.2, 0, 0.2, 1)',
    durationFastMs: 150,
    durationBaseMs: 300,
  },
} as const;

export type HDSTokenType = typeof HDS_TOKENS;

/**
 * Returns severity token properties based on a numeric score [0.0 - 1.0]
 * @deprecated Use `alertLevelForScore` + `ALERT_LEVELS` for safety-critical UI (matches the 4-step policy).
 */
export function getSeverityTokenScore(score: number) {
  if (score >= 0.85) return HDS_TOKENS.colors.severity.extreme;
  if (score >= 0.70) return HDS_TOKENS.colors.severity.veryHigh;
  if (score >= 0.50) return HDS_TOKENS.colors.severity.high;
  if (score >= 0.30) return HDS_TOKENS.colors.severity.moderate;
  return HDS_TOKENS.colors.severity.low;
}

/**
 * Helper to convert HDS tokens into React Native StyleSheets / Inline Style objects.
 */
export function getReactNativeTokenStyle(tokenPath: keyof typeof HDS_TOKENS.colors) {
  return {
    color: HDS_TOKENS.colors[tokenPath],
  };
}

// ---------------------------------------------------------------------------
// Canonical NASA Horizon Design System tokens (per DESIGN.md)
// These are the tokens the React web and React Native mobile apps MUST use.
// Square corners, hairline rules, carbon neutrals, NASA red = navigate/emergency,
// NASA blue = on-page action, orange = status emphasis, green = active/fresh only.
// ---------------------------------------------------------------------------

/**
 * Canonical NASA HDS palette. Documented in DESIGN.md ("colors" frontmatter).
 * Web uses these as CSS custom properties (--hds-*, --hn-hds-*).
 * Mobile imports HDS_NASA_TOKENS.colors directly.
 */
export const HDS_NASA_TOKENS = {
  brand: {
    name: 'HazardNet',
    version: '2.2.0+nasa-hds',
  },

  colors: {
    // Brand / semantic action colors
    nasaRed: '#f64137',            // "go somewhere": navigate, emergency CTAs, SEVERE
    nasaRedTint: '#ff5c52',        // hover, error highlight
    nasaRedShade: '#b60109',       // 7.0:1 AAA on white — error text, pressed red button
    nasaBlue: '#1c67e3',           // "do something here": controls, toggles, info
    nasaBlueTint: '#288bff',       // active, dark-scheme links
    nasaBlueShade: '#0b3d91',      // 9.9:1 AAA on white — link text on light
    internationalOrange: '#ea6f24', // status emphasis / decorative marker (NOT primary action)
    activeGreen: '#47da84',        // fresh/active/confirmed indicator (never large bg)

    // Carbon neutrals (single ramp, no slate/zinc/grey)
    carbon05: '#f6f6f6',   // page background
    carbon10: '#e3e3e3',   // sunken surface, table rules
    carbon20: '#d1d1d1',   // hairline borders, dividers
    carbon30: '#b9b9bb',   // stronger hairline, disabled outlines
    carbon40: '#959599',   // icons and non-text marks only
    carbon50: '#77777a',   // borders/icons; ~4.46:1 on white — just under AA for text
    carbon60: '#58585b',   // smallest grey that clears AA for text (7.1:1)
    carbon70: '#444447',   // secondary body text
    carbon80: '#2e2e32',   // dark-scheme raised surface
    carbon90: '#17171b',   // body text on light, page ground on dark
    carbonBlack: '#000000', // max contrast, focus ring
    spacesuitWhite: '#ffffff', // cards, inputs, max-contrast text on dark

    // Sequential ramps for caution and hazard shading
    seqYellow10: '#feebbe',
    seqYellow20: '#ffcb47',
    seqYellow30: '#f5af0c',
    seqOrange10: '#fce3ca',  // caution fill; text = seqOrange90
    seqOrange50: '#d96a00',
    seqOrange60: '#b25600',  // 5.5:1 on white — caution text
    seqOrange80: '#5c2b00',
    seqOrange90: '#3b1b00',  // text on seqOrange10
    seqOrange100: '#241000', // dark-scheme caution fill

    // Semantic aliases
    background: '#f6f6f6',     // = carbon05 (light)
    surface: '#ffffff',        // = spacesuitWhite (light)
    surfaceDark: '#17171b',    // = carbon90 (dark page ground)
    surfaceRaisedDark: '#2e2e32', // = carbon80
    textPrimary: '#17171b',    // = carbon90
    textSecondary: '#444447',  // = carbon70
    textTertiary: '#58585b',   // = carbon60
    textMuted: '#77777a',      // = carbon50 — borders/icons ONLY, not body text
    borderHairline: '#d1d1d1', // = carbon20
    borderStrong: '#b9b9bb',   // = carbon30
    focusRing: '#000000',      // = carbonBlack, dashed 1px
  },

  // Spacing (8pt grid — matches NASA HDS scale)
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    base: 16,
    lg: 20,
    xl: 24,
    x2l: 32,
    x3l: 48,
    x4l: 64,
    x5l: 72,
  },

  // Radius (NASA HDS rule: 0 for cards/buttons/modals/sheets; 2 for controls only)
  radius: {
    none: 0,
    control: 2,
  },

  // Border widths
  borderWidth: {
    hairline: 1,  // cards, inputs, table rules
    emphasis: 2,  // accent edges, chip outlines, selected rings
  },

  // Touch targets (platform minima)
  touch: {
    iosMinPt: 44,        // Apple HIG
    androidMinDp: 48,    // Material 3 / Google Play
    targetSeparation: 8, // min gap between adjacent targets
    criticalMinDp: 56,   // primary CTAs, emergency actions
  },

  // Typography (numeric scale, platform renders with system fonts)
  // iOS: SF Pro Text <20pt / SF Pro Display >=20pt
  // Android: Roboto family, sp units
  typeScale: {
    largeTitle: { size: 34, weight: '700', lineHeight: 41 },
    title1:     { size: 28, weight: '700', lineHeight: 34 },
    title2:     { size: 22, weight: '700', lineHeight: 28 },
    title3:     { size: 20, weight: '600', lineHeight: 25 },
    headline:   { size: 17, weight: '600', lineHeight: 22 },
    body:       { size: 17, weight: '400', lineHeight: 22 },
    callout:    { size: 16, weight: '400', lineHeight: 21 },
    subhead:    { size: 15, weight: '400', lineHeight: 20 },
    footnote:   { size: 13, weight: '400', lineHeight: 18 },
    caption1:   { size: 12, weight: '400', lineHeight: 16 },
    caption2:   { size: 11, weight: '400', lineHeight: 13 },
    metadata:   { size: 12, weight: '700', lineHeight: 21, letterSpacing: 0.4 }, // 0.025em = 0.3pt at 12pt; rounded
    mono:       { size: 14, weight: '400', lineHeight: 21 }, // DM Mono on web, SF Mono / Roboto Mono on native
  },

  // Motion (NASA HDS — decelerate, no bounces/springs/loops for operations surfaces)
  motion: {
    easeEmphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    easeStandard: 'cubic-bezier(0.2, 0, 0.2, 1)',
    durationFast: 150,
    durationBase: 300,
  },

  // Z-Index (mobile-suitable)
  zIndex: {
    base: 0,
    mapLayer: 10,
    mapControls: 20,
    stickyBanner: 30,
    stickyHeader: 40,
    bottomSheet: 50,
    modal: 60,
    toast: 70,
    fab: 80,
  },
} as const;

export type HDSNasaTokenType = typeof HDS_NASA_TOKENS;

// ---------------------------------------------------------------------------
// Alert levels — canonical 4-step policy taxonomy
// Matches api/v1/alerts/policy.js, frontend/src/lib/alerts.ts and the web UI.
// DO NOT confuse with the 5-step expressive/bento severity scale.
// ---------------------------------------------------------------------------

export type AlertLevel = 'NO_ALERT' | 'WATCH' | 'WARNING' | 'SEVERE';

export interface AlertLevelTokens {
  /** Stable enum value, matches AlertItemSchema.level */
  level: AlertLevel;
  /** User-facing label (English; localized via i18n in app code) */
  label: string;
  /** User-facing short imperative ("Monitor" / "Prepare" / "Act") */
  imperative: string;
  /** Fill color for the primary surface/chip */
  color: string;
  /** Text color to place on color */
  onColor: string;
  /** Tinted background for the caution/info card */
  surface: string;
  /** Text color to place on the tinted surface */
  onSurface: string;
  /** Left-border color (2px edge) */
  edge: string;
  /** Numeric severity threshold for the level (policy §thresholds) */
  minSeverity: number;
  /** Icon name (SF Symbol on iOS, Material icon on Android — platform layer maps) */
  iconName: { ios: string; android: string };
  /** Haptic feedback profile when this alert becomes active */
  haptic: 'none' | 'selection' | 'warning' | 'error' | 'critical';
  /** Whether this level plays sound / breaks through quiet hours */
  notification: {
    channel: 'info' | 'watch' | 'warning' | 'critical';
    playsSound: boolean;
    bypassQuietHours: boolean; // iOS critical requires entitlement
  };
}

/**
 * Canonical alert levels as specified by alert-policy/1.0.0:
 *   NO_ALERT  — Nothing unusual for the season.
 *   WATCH     — Monitor: conditions favourable for a hazard. Auto-publishable.
 *   WARNING   — Prepare: a damaging event is plausible. Requires duty-officer review.
 *   SEVERE    — Act: an event is imminent or likely. Requires duty-officer review.
 */
export const ALERT_LEVELS: Record<AlertLevel, AlertLevelTokens> = {
  NO_ALERT: {
    level: 'NO_ALERT',
    label: 'No Alert',
    imperative: 'All Clear',
    color: HDS_NASA_TOKENS.colors.activeGreen,
    onColor: HDS_NASA_TOKENS.colors.carbon90,
    surface: '#ffffff',
    onSurface: HDS_NASA_TOKENS.colors.carbon90,
    edge: HDS_NASA_TOKENS.colors.activeGreen,
    minSeverity: 0,
    iconName: { ios: 'checkmark.circle.fill', android: 'check_circle' },
    haptic: 'none',
    notification: { channel: 'info', playsSound: false, bypassQuietHours: false },
  },
  WATCH: {
    level: 'WATCH',
    label: 'Watch',
    imperative: 'Monitor',
    color: HDS_NASA_TOKENS.colors.seqYellow30,
    onColor: HDS_NASA_TOKENS.colors.seqOrange90,
    surface: HDS_NASA_TOKENS.colors.seqYellow10,
    onSurface: HDS_NASA_TOKENS.colors.seqOrange90,
    edge: HDS_NASA_TOKENS.colors.seqYellow30,
    minSeverity: 0.40, // policy: Watch ≥40% severity, AND severity ≥55%
    iconName: { ios: 'eye.fill', android: 'visibility' },
    haptic: 'selection',
    notification: { channel: 'watch', playsSound: false, bypassQuietHours: false },
  },
  WARNING: {
    level: 'WARNING',
    label: 'Warning',
    imperative: 'Prepare',
    color: HDS_NASA_TOKENS.colors.seqOrange50,
    onColor: HDS_NASA_TOKENS.colors.spacesuitWhite,
    surface: HDS_NASA_TOKENS.colors.seqOrange10,
    onSurface: HDS_NASA_TOKENS.colors.seqOrange90,
    edge: HDS_NASA_TOKENS.colors.internationalOrange,
    minSeverity: 0.65, // policy: Warning ≥65%
    iconName: { ios: 'exclamationmark.triangle.fill', android: 'warning' },
    haptic: 'warning',
    notification: { channel: 'warning', playsSound: true, bypassQuietHours: false },
  },
  SEVERE: {
    level: 'SEVERE',
    label: 'Severe',
    imperative: 'Act Now',
    color: HDS_NASA_TOKENS.colors.nasaRed,
    onColor: HDS_NASA_TOKENS.colors.spacesuitWhite,
    surface: '#fde2e2', // light red-tinted surface (not pure white)
    onSurface: HDS_NASA_TOKENS.colors.nasaRedShade,
    edge: HDS_NASA_TOKENS.colors.nasaRedShade,
    minSeverity: 0.80, // NOTE: policy §1.6 requires duty-officer review for WARNING+;
                       // threshold above WATCH ceiling of 0.65; exact value is policy-defined.
    iconName: { ios: 'exclamationmark.octagon.fill', android: 'dangerous' },
    haptic: 'critical',
    notification: { channel: 'critical', playsSound: true, bypassQuietHours: true },
  },
};

/** Ordered list from least to most severe (useful for iteration). */
export const ALERT_LEVEL_ORDER: AlertLevel[] = ['NO_ALERT', 'WATCH', 'WARNING', 'SEVERE'];

/**
 * Map a numeric severity score in [0,1] to an AlertLevel, applying the policy thresholds
 * documented in alert-policy/1.0.0 and on the /alerts page.
 *
 * Note: the policy also requires (a) model_version stamping for auto-publish above WATCH
 * and (b) duty-officer review for WARNING/SEVERE. That gating is a server-side concern
 * (see api/v1/alerts/policy.js). This function only maps numeric severity to the four
 * display buckets; callers should NOT promote a client-computed score to WARNING/SEVERE
 * unless the server has actually published such an alert.
 */
export function alertLevelForScore(severity: number): AlertLevel {
  const s = Math.max(0, Math.min(1, severity));
  if (s >= ALERT_LEVELS.SEVERE.minSeverity) return 'SEVERE';
  if (s >= ALERT_LEVELS.WARNING.minSeverity) return 'WARNING';
  if (s >= ALERT_LEVELS.WATCH.minSeverity) return 'WATCH';
  return 'NO_ALERT';
}

/**
 * Data freshness states used by web Status page and mobile banners.
 * See docs/MOBILE_AUDIT_AND_REDESIGN.md §7 "The 12 states".
 */
export type DataState =
  | 'loading'
  | 'loaded'               // fresh + no events
  | 'loadedActive'         // fresh + active events
  | 'partial'              // some sources missing
  | 'stale'                // > TTL but < 2× TTL
  | 'delayed'              // > 2× TTL
  | 'offlineCached'        // offline with cached data
  | 'offlineNoCache'       // offline without cached data
  | 'permissionDenied'
  | 'serviceUnavailable'   // 5xx / API down
  | 'sourceFailure'        // specific source down
  | 'appError';

export const DATA_STATE_LABELS: Record<DataState, { bannerTone: 'neutral' | 'blue' | 'amber' | 'red' | 'green'; priority: number }> = {
  loading:           { bannerTone: 'neutral', priority: 0 },
  loaded:            { bannerTone: 'green',   priority: 0 },
  loadedActive:      { bannerTone: 'red',     priority: 1 },
  partial:           { bannerTone: 'amber',   priority: 2 },
  stale:             { bannerTone: 'amber',   priority: 3 },
  delayed:           { bannerTone: 'amber',   priority: 4 },
  offlineCached:     { bannerTone: 'blue',    priority: 3 },
  offlineNoCache:    { bannerTone: 'red',     priority: 5 },
  permissionDenied:  { bannerTone: 'neutral', priority: 2 },
  serviceUnavailable:{ bannerTone: 'red',     priority: 5 },
  sourceFailure:     { bannerTone: 'amber',   priority: 2 },
  appError:          { bannerTone: 'red',     priority: 6 },
};
