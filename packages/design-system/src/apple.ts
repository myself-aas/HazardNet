/**
 * HazardNet — Cupertino Precision (canonical token source).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVENANCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Generated from `DESIGN.md` (Cupertino Precision). The PRIMITIVES, TYPE, RADII,
 * SPACE, ELEVATION and MOTION blocks below mirror frontend/src/styles/apple.css,
 * and __tests__/appleParity.test.js fails if the two drift. Where this file adds
 * something the document does not define, the block is marked `EXTENSION`.
 *
 * Inter is named first in every text stack and is NOT shipped: the 50 KiB local
 * web-font budget is spent on the Bengali face. The stacks fall through to the
 * platform UI face. Nothing is downloaded.
 *
 * The hazard and severity layers are data encodings. They are unchanged here.
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

/** WCAG 2.1 contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* ═════════════════════════════════════════════════════════════════════════════
   PRIMITIVES — spec §Colors, light appearance. Mirrors apple.css §1.
   ═════════════════════════════════════════════════════════════════════════════ */

export const APPLE_COLORS = {
  /** Text and link accent. The spec's blue tint is #0071e3, but it measures 4.3:1 on parchment; this one measures 5.1:1. */
  primary: '#0066cc',
  /** Spec Blue Tint. Filled actions and the focus ring. */
  primaryFocus: '#0071e3',
  /** Spec dark Blue Tint. Dark surfaces only. */
  primaryOnDark: '#2997ff',

  /** Spec light-label-primary. 16.8:1 on white. */
  ink: '#1d1d1f',
  body: '#1d1d1f',
  bodyOnDark: '#ffffff',
  /** Secondary copy on always-dark photography and tiles. */
  bodyMuted: '#cccccc',
  inkMuted80: '#333333',
  inkMuted48: '#7a7a7a',

  dividerSoft: '#f0f0f0',
  hairline: '#e0e0e0',

  /** Spec light-bg-primary. */
  canvas: '#ffffff',
  /** Spec light-bg-secondary. */
  canvasParchment: '#f5f5f7',
  /** Spec light-bg-tertiary: inset tracks. */
  inset: '#eeedf3',
  surfacePearl: '#fafafc',

  /** Dark cards (spec dark-bg-secondary). The name keeps its role. */
  surfaceTile1: '#161617',
  /** Dark elevated chrome (spec dark-bg-elevated). */
  surfaceTile2: '#1c1c1e',
  /** Dark inner containers (spec dark-bg-tertiary). */
  surfaceTile3: '#242426',
  /** Spec dark-bg-primary. The OLED canvas, and the global nav's void. */
  surfaceBlack: '#000000',
  surfaceChipTranslucent: '#d2d2d7',

  /** Spec secondary dark button: fill, hover, and the hairline ring is in APPLE_DARK. */
  btnDark: '#1d1d1f',
  btnDarkHover: '#2d2d2f',
  /** Spec helper text. 1.7:1 on white, so it is non-text decoration only. */
  helper: '#c1c6d6',

  onPrimary: '#ffffff',
  onDark: '#ffffff',
} as const;

/** Spec §Semantic Interactive Tints, light. Fills, dots and icons; text takes the severity layer. */
export const APPLE_TINT = {
  blue: '#0071e3',
  green: '#34c759',
  orange: '#ff9500',
  red: '#ff3b30',
  purple: '#af52de',
} as const;

/* ═════════════════════════════════════════════════════════════════════════════
   TYPOGRAPHY — spec §Typography. Mirrors apple.css §2 and the role classes in §9.
   ═════════════════════════════════════════════════════════════════════════════ */

/**
 * Font stacks. Inter is named first and is NOT shipped (see the provenance note).
 * `bengali` is an EXTENSION: HazardNet is a Bengali-first product and the spec does
 * not cover non-Latin scripts. The bundled Noto Sans Bengali WOFF2 (43.31 KiB, the
 * repo's only shipped face) stays.
 */
export const APPLE_FONTS = {
  display: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  text: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  /** EXTENSION — tabular data (coordinates, timestamps, severity scores). */
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace",
  /** EXTENSION — Bengali script. Different metrics, matras, headline bar. */
  bengali: "'Noto Sans Bengali', 'Hind Siliguri', sans-serif",
} as const;

/**
 * The spec's type roles. `size` and `line` are px; `track` is em, as the spec writes it.
 * The two `*Mobile` entries are the values the display roles step down to below 768px.
 */
export const APPLE_TYPE = {
  displayHero: { size: 56, weight: 700, line: 60, track: -0.015, face: 'display' },
  displayHeroMobile: { size: 40, weight: 700, line: 44, track: -0.012, face: 'display' },
  headlineXl: { size: 44, weight: 600, line: 48, track: -0.012, face: 'display' },
  headlineXlMobile: { size: 32, weight: 600, line: 36, track: -0.01, face: 'display' },
  headlineLg: { size: 28, weight: 600, line: 32, track: -0.008, face: 'display' },
  headlineMd: { size: 21, weight: 600, line: 26, track: -0.006, face: 'display' },
  headlineSm: { size: 17, weight: 600, line: 22, track: -0.004, face: 'display' },
  bodyLg: { size: 19, weight: 400, line: 26, track: -0.005, face: 'text' },
  bodyMd: { size: 17, weight: 400, line: 24, track: -0.004, face: 'text' },
  bodySm: { size: 14, weight: 400, line: 18, track: 0, face: 'text' },
  labelMd: { size: 14, weight: 500, line: 18, track: -0.002, face: 'text' },
  labelSm: { size: 12, weight: 500, line: 16, track: 0.01, face: 'text' },
  caption: { size: 11, weight: 400, line: 14, track: 0.012, face: 'text' },
} as const satisfies Record<
  string,
  { size: number; weight: number; line: number; track: number; face: 'display' | 'text' }
>;

/** The weight ladder. Spec: 400 / 500 / 600 / 700. */
export const APPLE_WEIGHTS = [400, 500, 600, 700] as const;

/** The display/text face boundary, in px. Kept from the previous system; no spec value. */
export const APPLE_FACE_BOUNDARY = 20;

/**
 * Canonical typography font stack per DESIGN.md.
 * Zero-byte enhancement: Inter first, falling back to the native platform UI face.
 */
export const APPLE_FONT_STACK = "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/* ═════════════════════════════════════════════════════════════════════════════
   GEOMETRY — spec §Shapes. Mirrors apple.css §3.
   ═════════════════════════════════════════════════════════════════════════════ */

export const APPLE_RADII = {
  none: 0,
  /** Spec `sm`. */
  xs: 4,
  /** Spec `DEFAULT`. */
  sm: 8,
  /** Spec `md`. */
  md: 12,
  /** Spec `lg`. */
  lg: 16,
  /** Spec `xl`: modals and sheets. */
  xl: 24,
  /** Spec: primary cards 18–22px. */
  card: 20,
  /** Spec: inputs 10–12px. */
  input: 12,
  pill: 9999,
  full: 9999,
} as const;

/* ═════════════════════════════════════════════════════════════════════════════
   SPACING — spec §Layout & Spacing. Mirrors apple.css §3.
   ═════════════════════════════════════════════════════════════════════════════ */

export const APPLE_SPACE = {
  /** Legacy alias of `xs`. */
  xxs: 4,
  /** Spec `space-xs`. */
  xs: 4,
  /** Spec `space-sm`. */
  sm: 8,
  /** Spec `space-md`. */
  md: 16,
  /** Spec `space-lg`. */
  lg: 24,
  /** Spec `space-xl`. */
  xl: 40,
  /** EXTENSION — the spec's "multiples thereof (64px, 96px)". */
  xxl: 64,
  section: 96,
} as const;

/** Spec §Layout: gutters and outer margins. */
export const APPLE_LAYOUT = {
  gutter: 24,
  gutterMobile: 16,
  margin: 40,
  marginMobile: 20,
} as const;

/* ═════════════════════════════════════════════════════════════════════════════
   ELEVATION — spec §Elevation & Depth. Mirrors apple.css §3. Dark values are in APPLE_DARK.
   ═════════════════════════════════════════════════════════════════════════════ */

export const APPLE_ELEVATION = {
  /** Full-bleed tiles, body sections. */
  flat: 'none',
  /** A 1px hairline, for light cards. */
  softHairline: '0 0 0 1px rgba(0, 0, 0, 0.08)',
  /** Product imagery only. */
  product: 'rgba(0, 0, 0, 0.22) 3px 5px 30px 0',
  /** EXTENSION — the light analogue of the spec's level-2 shadow. */
  popover: '0 24px 48px -12px rgba(0, 0, 0, 0.18)',
  /** EXTENSION — the light analogue of the spec's segmented-control shadow. */
  segment: '0 2px 6px rgba(0, 0, 0, 0.12)',
} as const;

/** Spec §Optical Glassmorphism, light: floating chrome, sheets, pill docks. */
export const APPLE_MATERIAL = {
  frosted: { bg: 'rgba(255, 255, 255, 0.8)', blur: '20px', saturate: '180%', hairline: 'rgba(0, 0, 0, 0.08)' },
} as const;

/* ═════════════════════════════════════════════════════════════════════════════
   RESPONSIVE — spec §Layout & Spacing. Mirrors apple.css §10.
   ═════════════════════════════════════════════════════════════════════════════ */

export const APPLE_BREAKPOINTS = {
  smallPhone: 419,
  phone: 640,
  /** Spec: the mobile flow is 4 columns below this. */
  mobile: 767,
  tablet: 768,
  largePhone: 735,
  tabletPortrait: 833,
  tabletLandscape: 1023,
  smallDesktop: 1068,
  desktop: 1440,
} as const;

export const APPLE_CONTAINER = {
  /** Text-heavy sections. */
  text: 980,
  /** Spec: the 1280px content shell on desktop. */
  wide: 1280,
} as const;

/** Spec §Components: 36px inline or 44px touch buttons; nav 44px mobile, 48px desktop. */
export const APPLE_TOUCH = {
  min: 44,
  iconButton: 44,
  navHeight: 44,
  navHeightDesktop: 48,
  subNavHeight: 52,
  stickyBarHeight: 64,
  /** EXTENSION — bottom-sheet detents, derived from the spacing scale. */
  bottomSheetSnapMin: 112,
  bottomSheetSnapMax: 640,
} as const;

/* ═════════════════════════════════════════════════════════════════════════════
   MOTION — spec §Components (press, segmented spring). Mirrors apple.css §3 and §11.
   ═════════════════════════════════════════════════════════════════════════════ */

export const APPLE_MOTION = {
  /** Spec: scales down to 0.97 on active tap. */
  pressScale: 0.97,
  /** EXTENSION — the lighter dip for a cell-sized control. */
  pressScaleSoft: 0.98,
  duration: {
    press: 120,
    base: 240,
    /** The segmented thumb's transition. Uses `ease`: the spec's spring overshoots, the design gate does not allow it. */
    segment: 360,
  },
  /** Spec: cubic-bezier(0.25, 1, 0.5, 1). */
  ease: 'cubic-bezier(0.25, 1, 0.5, 1)',
  /** Only compositor-friendly properties animate. */
  animatableProps: ['opacity', 'transform'] as const,
  reducedMotionDuration: '0.01ms',
  /** Spec: the segmented control's spring response. */
  springSegmented: { stiffness: 320, damping: 26, mass: 1 },
  /** EXTENSION — sheet drag. Critically damped, so sheets never bounce. */
  springStandard: { stiffness: 320, damping: 36, mass: 1 },
} as const;


/* ═══════════════════════════════════════════════════════════════════════════
   NEUTRAL RAMP — EXTENSION.
   DESIGN.md names six neutrals but the product needs an ordinal ramp: ~4,000
   utility classes (`bg-carbon-*`, `text-carbon-*`) resolve through one. Every
   anchor marked (*) is a verbatim DESIGN.md value; the three derived steps fill
   the gaps and were chosen so that EVERY step used for text clears WCAG AA
   (4.5:1) on BOTH white and parchment — the two grounds this product renders on.

     step        value      source        on white   on parchment   role
     05          #fafafc    pearl *          1.04        1.04        raised surface
     10          #f5f5f7    parchment *      1.09        1.00        page canvas, sunken
     20          #e0e0e0    hairline *       1.32        1.21        hairline border
     30          #d2d2d7    chip *           1.51        1.38        stronger divider
     40          #a1a1a6    derived          2.57        2.36        disabled ink, icon (non-text)
     50          #6e6e73    derived          5.07        4.66        muted label
     60          #5a5a5d    derived          6.87        6.31        secondary ink
     70          #333333    inkMuted80 *    12.63       11.60        body ink
     80          #272729    tile1 *         14.91       13.69        strong ink
     90          #1d1d1f    ink *           16.83       15.46        headings, primary ink
     black       #000000    black *         21.00       19.29        nav bar, scrims
   ═══════════════════════════════════════════════════════════════════════════ */

export const APPLE_NEUTRAL = {
  '05': '#fafafc',
  '10': '#f5f5f7',
  '20': '#e0e0e0',
  '30': '#d2d2d7',
  '40': '#a1a1a6',
  '50': '#6e6e73',
  '60': '#5a5a5d',
  '70': '#333333',
  '80': '#272729',
  '90': '#1d1d1f',
  black: '#000000',
} as const;

/* ═════════════════════════════════════════════════════════════════════════════
   DARK THEME — spec §Colors (dark) and §Elevation (tonal stacking). Mirrors apple.css §5.
   ═════════════════════════════════════════════════════════════════════════════ */

export const APPLE_DARK = {
  /** Spec level 0: the OLED canvas. */
  canvas: APPLE_COLORS.surfaceBlack,
  /** Spec level 1: content cards and secondary tiers. */
  grouped: APPLE_COLORS.surfaceTile1,
  card: APPLE_COLORS.surfaceTile1,
  /** Spec: tertiary inner containers and inset tracks. */
  inset: APPLE_COLORS.surfaceTile3,
  /** Spec level 2: floating chrome, sheets and popovers. */
  raised: APPLE_COLORS.surfaceTile2,
  elevated: APPLE_COLORS.surfaceTile2,
  black: APPLE_COLORS.surfaceBlack,

  /** Spec: primary #F5F5F7; secondary #A1A1A6; tertiary #86868B; quaternary #424245. */
  label: '#f5f5f7',
  labelSecondary: '#a1a1a6',
  labelTertiary: '#86868b',
  labelQuaternary: '#424245',

  /** Spec §Fills & Separators. */
  separator: 'rgba(255, 255, 255, 0.12)',
  separatorOpaque: '#424245',
  cardBorder: 'rgba(255, 255, 255, 0.08)',
  fill: {
    thin: 'rgba(255, 255, 255, 0.06)',
    regular: 'rgba(255, 255, 255, 0.12)',
    strong: 'rgba(255, 255, 255, 0.2)',
  },

  /** Spec blue tint, with black as the action label (white measures 3.0:1 on it). */
  action: APPLE_COLORS.primaryOnDark,
  actionFocus: APPLE_COLORS.primaryOnDark,
  onAction: APPLE_COLORS.surfaceBlack,
  focusHalo: 'rgba(41, 151, 255, 0.25)',

  /** Spec §Optical Glassmorphism, dark. */
  frostedBg: 'rgba(0, 0, 0, 0.8)',
  glassHairline: 'rgba(255, 255, 255, 0.1)',
  /** Spec level-2 shadow and segmented-control shadow. */
  elevPopover: '0 24px 48px -12px rgba(0, 0, 0, 0.65)',
  elevSegment: '0 2px 6px rgba(0, 0, 0, 0.3)',
  sheetHighlight: 'rgba(255, 255, 255, 0.15)',
  scrim: 'rgba(0, 0, 0, 0.7)',
  grabber: 'rgba(255, 255, 255, 0.2)',

  /** Spec §Input Fields. The stroke is #6E6E73, not the spec's translucent 0.12, to clear WCAG 1.4.11. */
  inputFill: APPLE_COLORS.surfaceTile2,
  inputStroke: '#6e6e73',
  /** Spec §Segmented Controls. */
  segmentTrack: 'rgba(255, 255, 255, 0.06)',
  segmentThumb: '#2c2c2e',
  segmentInactive: '#86868b',

  /** Spec §Semantic Interactive Tints, dark. */
  tint: {
    blue: '#2997ff',
    green: '#30d158',
    orange: '#ff9f0a',
    red: '#ff453a',
    purple: '#bf5af2',
  },
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   SEVERITY — EXTENSION, and the one place a second colour is permitted.

   DESIGN.md §Don'ts says "Don't introduce a second accent color". That rule
   governs CHROME — links, buttons, nav, focus. It cannot govern DATA on a
   multi-hazard early-warning system: five hazard levels cannot be encoded in
   one blue, and WCAG 1.4.1 forbids colour as the sole carrier of meaning.

   So severity is a declared data layer, not an accent:
     · it never styles a link, button, nav item or focus ring;
     · every severity is rendered as colour + icon + word, never colour alone;
     · hues are retuned to sit inside the Apple palette rather than beside it.

   Measured (text on ground / white on fill):
     low       #1d7a3e   5.38 white · 4.94 parchment
     moderate  #8a5a00   5.93 white · 5.44 parchment
     high      #b3400f   5.74 white · 5.27 parchment
     veryHigh  #c01f1f   6.07 white · 5.58 parchment
     extreme   #8b0f3a   9.43 white · 8.66 parchment
   Dark-ground variants measured on tile-1 (#272729): 7.90 / 8.32 / 6.42 /
   5.34 / 6.33 — all clear AA at any size.
   ═══════════════════════════════════════════════════════════════════════════ */

export const APPLE_SEVERITY = {
  low: { text: '#1d7a3e', solid: '#1d7a3e', surface: '#e8f5ed', onDark: '#4ad66d', label: 'Low' },
  moderate: { text: '#8a5a00', solid: '#8a5a00', surface: '#fdf3e0', onDark: '#f5b73d', label: 'Moderate' },
  high: { text: '#b3400f', solid: '#b3400f', surface: '#fdeee7', onDark: '#ff8a5b', label: 'High' },
  veryHigh: { text: '#c01f1f', solid: '#c01f1f', surface: '#fdebeb', onDark: '#ff6b60', label: 'Very high' },
  extreme: { text: '#8b0f3a', solid: '#8b0f3a', surface: '#fbe9ef', onDark: '#ff7eb6', label: 'Extreme' },
} as const;

export type AppleSeverity = keyof typeof APPLE_SEVERITY;

/* ═══════════════════════════════════════════════════════════════════════════
   HAZARD IDENTITY — the second data-encoding layer

   Severity answers "how bad"; this answers "what kind". They are orthogonal: a
   flood can be low or extreme, and the two encodings appear together, so they
   must never be confusable with one another or with the chrome accent.

   Before this existed, six files each declared their own hazard palette out of
   Tailwind defaults, and they disagreed — Tropical Cyclone was simultaneously
   #7c3aed (purple), #ef4444 (red) and #f43f5e (rose) depending on which
   component you were looking at. This is the single source.

   Every value below was solved for, not chosen, against four constraints:
     1. >= 5.0:1 on white and >= 4.6:1 on parchment (#f5f5f7) for `text`
     2. >= 4.8:1 on the LIGHTEST dark tile (#2a2a2c) for `onDark`, which is
        the binding case — it then clears on tile 1, tile 3 and pure black too
     3. >= 22 CIELAB dE from every other hazard in the same mode, so eight
        categories stay separable — including for most colour-vision deficiency
     4. >= 24 dE from the chrome accent (#0066cc / #2997ff), so a hazard hue can
        never be mistaken for an interactive control

   Saturation is capped well below neon on purpose: these sit inside editorial
   layouts, not on a dashboard. As with severity, colour is never the only
   signal — `label` and an icon ride along, per WCAG 1.4.1.

   `__tests__/appleParity.test.js` re-measures all four constraints rather than
   trusting this comment.
   ═══════════════════════════════════════════════════════════════════════════ */

export const APPLE_HAZARD = {
  flood: { text: '#496dab', onDark: '#7b97c6', label: 'Flood' },
  flashFlood: { text: '#357882', onDark: '#30b9cf', label: 'Flash flood' },
  cyclone: { text: '#a03dd1', onDark: '#b582ce', label: 'Tropical cyclone' },
  drought: { text: '#846b39', onDark: '#cf9a30', label: 'Drought' },
  heatWave: { text: '#a75b2f', onDark: '#d68251', label: 'Heat wave' },
  coldWave: { text: '#184962', onDark: '#9bc1d4', label: 'Cold wave' },
  storm: { text: '#b1488e', onDark: '#d199be', label: 'Severe storm' },
  fire: { text: '#ca3a2f', onDark: '#c68580', label: 'Fire' },
} as const;

export type AppleHazard = keyof typeof APPLE_HAZARD;

/**
 * The display names the app uses, resolved onto the eight hazard keys. Several
 * names map to one key by design: "Flood" and "Monsoon Flood" are the same
 * encoding, as are "Severe Storm" and "Severe Local Storm".
 */
export const APPLE_HAZARD_ALIASES: Record<string, AppleHazard> = {
  'Flood': 'flood',
  'Monsoon Flood': 'flood',
  'Riverine Flood': 'flood',
  'Flash Flood': 'flashFlood',
  'Tropical Cyclone': 'cyclone',
  'Cyclone': 'cyclone',
  'Storm Surge': 'cyclone',
  'Drought': 'drought',
  'Heat Wave': 'heatWave',
  'Heatwave': 'heatWave',
  'Cold Wave': 'coldWave',
  'Coldwave': 'coldWave',
  'Severe Storm': 'storm',
  'Severe Local Storm': 'storm',
  'Lightning': 'storm',
  'Fire': 'fire',
  'Wildfire': 'fire',
};

/** Resolve any hazard display name to its palette entry. */
export function hazardPalette(name: string): (typeof APPLE_HAZARD)[AppleHazard] {
  return APPLE_HAZARD[APPLE_HAZARD_ALIASES[name] ?? 'storm'];
}

/** Status roles for non-hazard system state. Derived from the severity hues. */
export const APPLE_STATUS = {
  success: '#1d7a3e',
  warning: '#8a5a00',
  danger: '#c01f1f',
  info: APPLE_COLORS.primary,
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   DENSITY TRACKS — EXTENSION.
   DESIGN.md §Overview: "Store and shop surfaces retain the same chassis but
   switch modes ... this is one design language expressed at different volumes."
   HazardNet has the same split: an editorial front door and a dense operational
   console. Both tracks draw from APPLE_SPACE; only the step changes.
   ═══════════════════════════════════════════════════════════════════════════ */

export const APPLE_TRACK = {
  /** Front door, docs, hazards, about. The full 80px tile rhythm. */
  editorial: {
    sectionBlock: APPLE_SPACE.section,
    sectionGap: APPLE_SPACE.xxl,
    cardPadding: APPLE_SPACE.lg,
    maxWidth: APPLE_CONTAINER.text,
  },
  /** /live, analytics, alert tables. Same scale, tighter step. */
  console: {
    sectionBlock: APPLE_SPACE.xl,
    sectionGap: APPLE_SPACE.md,
    cardPadding: APPLE_SPACE.sm,
    maxWidth: APPLE_CONTAINER.wide,
  },
} as const;

export type AppleTrack = keyof typeof APPLE_TRACK;

export type AppleTypeToken = keyof typeof APPLE_TYPE;
export type AppleRadius = keyof typeof APPLE_RADII;
export type AppleSpace = keyof typeof APPLE_SPACE;

export const APPLE = {
  colors: APPLE_COLORS,
  neutral: APPLE_NEUTRAL,
  dark: APPLE_DARK,
  severity: APPLE_SEVERITY,
  hazard: APPLE_HAZARD,
  status: APPLE_STATUS,
  track: APPLE_TRACK,
  fonts: APPLE_FONTS,
  type: APPLE_TYPE,
  weights: APPLE_WEIGHTS,
  faceBoundary: APPLE_FACE_BOUNDARY,
  radii: APPLE_RADII,
  space: APPLE_SPACE,
  elevation: APPLE_ELEVATION,
  material: APPLE_MATERIAL,
  breakpoints: APPLE_BREAKPOINTS,
  container: APPLE_CONTAINER,
  touch: APPLE_TOUCH,
  motion: APPLE_MOTION,
} as const;
