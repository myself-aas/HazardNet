/**
 * HazardNet — Apple design system (canonical token source).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVENANCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Generated from `DESIGN.md` (getdesign `apple` profile, `npx getdesign@latest
 * add apple`, v0.6.25). Every value in the PRIMITIVES, TYPE, RADII, SPACE and
 * ELEVATION blocks below is transcribed verbatim from that document's YAML
 * front-matter. Where this file adds something the document does not define,
 * the block is marked `EXTENSION` and carries the reason.
 *
 * No Apple font file, artwork or CSS is shipped. `SF Pro Display` / `SF Pro
 * Text` are NAMED in the font stacks only — per DESIGN.md §"Note on Font
 * Substitutes", naming them first resolves to the real face on macOS/iOS via
 * the locally installed system font, and falls through to `system-ui` on every
 * other platform. Nothing is downloaded; the repo's no-remote-font-URL contract
 * and 50 KiB font budget are both preserved.
 *
 * This file supersedes `meridian.ts`, `tokens.ts` and `material3Expressive.ts`.
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

/* ═══════════════════════════════════════════════════════════════════════════
   PRIMITIVES — verbatim from DESIGN.md `colors:`
   ═══════════════════════════════════════════════════════════════════════════ */

export const APPLE_COLORS = {
  /** Action Blue. The single brand-level interactive colour. 5.60:1 on white. */
  primary: '#0066cc',
  /** Focus Blue. Keyboard focus ring only — `outline: 2px solid`. */
  primaryFocus: '#0071e3',
  /** Sky Link Blue. Dark surfaces only; Action Blue disappears on tile-1. */
  primaryOnDark: '#2997ff',

  /** Near-Black Ink. Every headline and paragraph on a light surface. 16.68:1 on white. */
  ink: '#1d1d1f',
  body: '#1d1d1f',
  bodyOnDark: '#ffffff',
  /** Secondary copy on dark tiles where pure white is too loud. */
  bodyMuted: '#cccccc',
  /** Body text on the Pearl Button surface. 12.63:1 on white. */
  inkMuted80: '#333333',
  /** Disabled button text and legal fine-print. 4.66:1 on white. */
  inkMuted48: '#7a7a7a',

  /** Border tone on secondary buttons — a ring, not a hard line. */
  dividerSoft: '#f0f0f0',
  /** 1px hairline on store utility cards and configurator chips. */
  hairline: '#e0e0e0',

  canvas: '#ffffff',
  /** The signature Apple off-white. Alternating light tiles, footer. */
  canvasParchment: '#f5f5f7',
  /** Secondary "ghost" button fill — lighter than parchment so it still reads. */
  surfacePearl: '#fafafc',

  /** Primary dark-tile surface. */
  surfaceTile1: '#272729',
  /** Micro-step lighter — faintest separation between adjacent dark tiles. */
  surfaceTile2: '#2a2a2c',
  /** Micro-step darker — bottom of stack, embedded video frames. */
  surfaceTile3: '#252527',
  /** True void — video backgrounds, the global nav bar. */
  surfaceBlack: '#000000',
  /** Translucent control chip over photography; ships at ~64% alpha. */
  surfaceChipTranslucent: '#d2d2d7',

  onPrimary: '#ffffff',
  onDark: '#ffffff',
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   TYPOGRAPHY — verbatim from DESIGN.md `typography:`
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Font stacks. SF Pro is NAMED, never shipped — see the provenance note above.
 * `bengali` is an EXTENSION: HazardNet is a Bengali-first product and the Apple
 * document does not cover non-Latin scripts. The bundled Noto Sans Bengali
 * WOFF2 (43.31 KiB, the repo's only shipped face) stays.
 */
export const APPLE_FONTS = {
  display: "'SF Pro Display', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  text: "'SF Pro Text', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  /** EXTENSION — tabular data (coordinates, timestamps, severity scores). */
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace",
  /** EXTENSION — Bengali script. Different metrics, matras, headline bar. */
  bengali: "'Noto Sans Bengali', 'Hind Siliguri', sans-serif",
} as const;

/**
 * The 16 named styles, exactly as the document defines them.
 * `size` is px, `tracking` is px (the document uses px, not em).
 * `face` selects display vs text per the document's unbreakable 20px boundary.
 */
export const APPLE_TYPE = {
  heroDisplay: { size: 56, weight: 600, line: 1.07, tracking: -0.28, face: 'display' },
  displayLg: { size: 40, weight: 600, line: 1.1, tracking: 0, face: 'display' },
  displayMd: { size: 34, weight: 600, line: 1.47, tracking: -0.374, face: 'text' },
  lead: { size: 28, weight: 400, line: 1.14, tracking: 0.196, face: 'display' },
  leadAiry: { size: 24, weight: 300, line: 1.5, tracking: 0, face: 'text' },
  tagline: { size: 21, weight: 600, line: 1.19, tracking: 0.231, face: 'display' },
  bodyStrong: { size: 17, weight: 600, line: 1.24, tracking: -0.374, face: 'text' },
  body: { size: 17, weight: 400, line: 1.47, tracking: -0.374, face: 'text' },
  denseLink: { size: 17, weight: 400, line: 2.41, tracking: 0, face: 'text' },
  caption: { size: 14, weight: 400, line: 1.43, tracking: -0.224, face: 'text' },
  captionStrong: { size: 14, weight: 600, line: 1.29, tracking: -0.224, face: 'text' },
  buttonLarge: { size: 18, weight: 300, line: 1.0, tracking: 0, face: 'text' },
  buttonUtility: { size: 14, weight: 400, line: 1.29, tracking: -0.224, face: 'text' },
  finePrint: { size: 12, weight: 400, line: 1.0, tracking: -0.12, face: 'text' },
  microLegal: { size: 10, weight: 400, line: 1.3, tracking: -0.08, face: 'text' },
  navLink: { size: 12, weight: 400, line: 1.0, tracking: -0.12, face: 'text' },
} as const satisfies Record<string, { size: number; weight: number; line: number; tracking: number; face: 'display' | 'text' }>;

/**
 * The weight ladder. DESIGN.md §Typography/Principles: "Weight 500 is
 * deliberately absent. The ladder is 300 / 400 / 600 / 700."
 */
export const APPLE_WEIGHTS = [300, 400, 600, 700] as const;

/** The display/text face boundary, in px. Below this, SF Pro Text. */
export const APPLE_FACE_BOUNDARY = 20;

/* ═══════════════════════════════════════════════════════════════════════════
   GEOMETRY — verbatim from DESIGN.md `rounded:`
   ═══════════════════════════════════════════════════════════════════════════ */

export const APPLE_RADII = {
  /** Full-bleed product tiles — tiles touch edges, the colour change is the divider. */
  none: 0,
  /** Inline links styled as subtle chips (rare). */
  xs: 5,
  /** Dark utility buttons (Sign In, Bag), inline card imagery. */
  sm: 8,
  /** White Pearl Button capsules. */
  md: 11,
  /** Store utility cards, accessories grid cards. */
  lg: 18,
  /** The signature Apple pill — primary CTAs, chips, search input. */
  pill: 9999,
  /** Circular control chips floating over photography. */
  full: 9999,
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   SPACING — verbatim from DESIGN.md `spacing:`
   ═══════════════════════════════════════════════════════════════════════════ */

export const APPLE_SPACE = {
  xxs: 4,
  xs: 8,
  sm: 12,
  /** 17px — the body line-height multiplier that recurs on every page. */
  md: 17,
  lg: 24,
  xl: 32,
  xxl: 48,
  /** Vertical padding inside a product tile. */
  section: 80,
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   ELEVATION — DESIGN.md §"Elevation & Depth"
   "Apple uses exactly ONE drop-shadow, applied to photographic product
   imagery — never to cards, never to buttons, never to text."
   ═══════════════════════════════════════════════════════════════════════════ */

export const APPLE_ELEVATION = {
  /** Full-bleed tiles, global nav, footer, body sections. */
  flat: 'none',
  /** Utility cards, sub-nav separator. */
  softHairline: '0 0 0 1px rgba(0, 0, 0, 0.08)',
  /** The only true shadow in the system. Product renders resting on a surface. */
  product: 'rgba(0, 0, 0, 0.22) 3px 5px 30px 0',
} as const;

/** Sub-nav and floating sticky bar. DESIGN.md §Known Gaps gives this baseline. */
export const APPLE_MATERIAL = {
  frosted: { bg: 'rgba(245, 245, 247, 0.8)', blur: '20px', saturate: 1.8 },
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   RESPONSIVE — verbatim from DESIGN.md §"Responsive Behavior"
   ═══════════════════════════════════════════════════════════════════════════ */

export const APPLE_BREAKPOINTS = {
  smallPhone: 419,
  phone: 640,
  largePhone: 735,
  tabletPortrait: 833,
  tabletLandscape: 1023,
  smallDesktop: 1068,
  desktop: 1440,
} as const;

export const APPLE_CONTAINER = {
  /** Text-heavy sections (environment). */
  text: 980,
  /** Product grids (store, accessories) and the global content lock. */
  wide: 1440,
} as const;

/** DESIGN.md §Touch Targets — "Minimum 44 × 44px." */
export const APPLE_TOUCH = {
  min: 44,
  /** `button-icon-circular` is exactly 44 × 44. */
  iconButton: 44,
  /** `global-nav` height. */
  navHeight: 44,
  /** `sub-nav-frosted` height. */
  subNavHeight: 52,
  /** `floating-sticky-bar` height. */
  stickyBarHeight: 64,
  /** EXTENSION — bottom-sheet detents. Apple's sheet is not in DESIGN.md; the
   *  snap points are derived from the 8-step spacing scale (×14 and ×8). */
  bottomSheetSnapMin: 112,
  bottomSheetSnapMax: 640,
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   MOTION — EXTENSION.
   DESIGN.md defines exactly one interaction: `transform: scale(0.95)` as the
   system-wide active/press state, and instructs "Never document hover."
   It defines no durations and no easing curves. The values below are the
   minimum needed to animate that press state and honour reduced-motion; they
   are deliberately few, and nothing here introduces a motion vocabulary the
   document does not imply.
   ═══════════════════════════════════════════════════════════════════════════ */

export const APPLE_MOTION = {
  /** The system-wide micro-interaction. DESIGN.md §Do's. */
  pressScale: 0.95,
  /** EXTENSION — the softer dip for a cell-sized control (an option card, a chip-like
   *  tile). A grid of cells pressing at the pill's 0.95 flickers; 0.97 stays perceptible
   *  only on the cell under the finger. Mirrors `--ap-press-scale-soft` in apple.css. */
  pressScaleSoft: 0.97,
  duration: {
    /** Press/release feedback. */
    press: 120,
    /** Surface and opacity changes. */
    base: 240,
  },
  /** Apple's standard decelerate. */
  ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  /** Only compositor-friendly properties animate. */
  animatableProps: ['opacity', 'transform'] as const,
  reducedMotionDuration: '0.01ms',
  /** EXTENSION — spring for sheet drag, where a cubic-bezier cannot follow a
   *  finger. Critically damped, so it settles without overshoot: Apple's sheets
   *  never bounce. */
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

/* ═══════════════════════════════════════════════════════════════════════════
   DARK THEME — EXTENSION.
   DESIGN.md §Known Gaps: "Dark-mode counterparts ... were not surfaced; the
   system documented is the daytime/light-dominant variant." Rather than invent
   a second colour language, the dark theme is built ENTIRELY from Apple's own
   dark-tile surfaces, which the document does define: tile-3 (#252527) is the
   darkest and becomes the canvas, tile-1 (#272729) the grouped surface, tile-2
   (#2a2a2c) the raised surface. Text uses the document's `body-on-dark` and
   `body-muted`. Links use `primary-on-dark` (Sky Link Blue), exactly as the
   document instructs for dark tiles.
   ═══════════════════════════════════════════════════════════════════════════ */

export const APPLE_DARK = {
  canvas: APPLE_COLORS.surfaceTile3,
  grouped: APPLE_COLORS.surfaceTile1,
  raised: APPLE_COLORS.surfaceTile2,
  /** True void — the nav bar stays black in both themes. */
  black: APPLE_COLORS.surfaceBlack,
  label: APPLE_COLORS.bodyOnDark,
  labelSecondary: APPLE_COLORS.bodyMuted,
  /** Derived: a muted tertiary that still clears AA on tile-3. */
  labelTertiary: '#9a9a9f',
  hairline: '#3a3a3c',
  hairlineStrong: '#48484a',
  /** Sky Link Blue. Action Blue measures 2.68:1 on tile-1 and must not be used. */
  action: APPLE_COLORS.primaryOnDark,
  actionFocus: APPLE_COLORS.primaryOnDark,
  onAction: APPLE_COLORS.surfaceBlack,
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
