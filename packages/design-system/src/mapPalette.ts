/**
 * Map palette — the cartographic data layer of the Apple design system.
 *
 * A map is not chrome. Its colours answer "how much rain fell here", not "is this clickable", so
 * they are a DATA ENCODING and fall under the same sanctioned exception as severity: DESIGN.md's
 * single-accent rule governs interactive chrome, and WCAG 1.4.1 forbids encoding a quantity in a
 * hue that nothing else repeats.
 *
 * What changed in the Apple migration: every chrome value now resolves to an Apple token instead
 * of a NASA carbon step, and the risk/heat ramps resolve to the severity scale in `apple.ts`, so
 * a "high" district reads in exactly the same colour on the map, in a badge and in a table.
 *
 * The GIBS rain ramp is the one set of literals left standing, and deliberately: those nine
 * values are not a HazardNet design decision, they are a transcription of the colours NASA GIBS
 * has already baked into the `IMERG_Precipitation_Rate` tiles. Re-tinting them would make the
 * legend lie about the imagery underneath it.
 */

import { APPLE_COLORS, APPLE_NEUTRAL, APPLE_SEVERITY } from './apple';

/** Surfaces, rules and text — every value is the token, not a copy of it. */
export const MAP_CHROME = {
  /** Popup and chip surfaces, marker fill, text on dark chips. */
  surface: APPLE_COLORS.canvas,
  /** Meta labels (uppercase captions). */
  muted: APPLE_NEUTRAL['50'],
  /** Secondary body copy. */
  inkSoft: APPLE_NEUTRAL['60'],
  /** Body copy. */
  ink: APPLE_NEUTRAL['70'],
  /** Headings and district names. */
  inkStrong: APPLE_NEUTRAL['90'],
  /** Base ink of the map popups. Was a dark teal; now Apple's tile-1, so a popup
   *  over the map is the same dark surface as a dark tile elsewhere. */
  panelInk: APPLE_COLORS.surfaceTile1,
} as const;

/** Map interactivity: GPS accuracy circle, chips, links. One accent, two grounds. */
export const MAP_INTERACTIVE = {
  /** Action Blue — on the light basemap. */
  blue: APPLE_COLORS.primary,
  /** Sky Link Blue — on dark popups and satellite imagery, where Action Blue
   *  measures 2.68:1 and is unreadable. */
  blueBright: APPLE_COLORS.primaryOnDark,
} as const;

/**
 * District risk, worst case only — the user-location marker ring.
 *
 * Deliberately one key: `__tests__/mapPalette.test.js` enforces that every palette entry is
 * actually drawn by the map, because a data palette that grows colours nothing paints is how
 * the 79 inline hex literals got in here the first time. The other four severity levels are
 * drawn from APPLE_SEVERITY directly where they are needed.
 */
export const MAP_RISK_RAMP = {
  severe: APPLE_SEVERITY.veryHigh.solid,
} as const;

/** Hazard heatmap gradient, low intensity to high. */
export const MAP_HEAT_RAMP = {
  calm: MAP_INTERACTIVE.blue,
  moderate: APPLE_SEVERITY.moderate.solid,
  heavy: APPLE_SEVERITY.veryHigh.solid,
} as const;

/**
 * GPM IMERG rain-rate ramp (Phase D, 2026-10-05): documents the colouring GIBS itself renders for
 * `IMERG_Precipitation_Rate` — greens for light rain through yellows and oranges to deep reds for
 * intense rain, with cyan/blue/purple for snowfall shown as liquid-water equivalent. The legend
 * boundaries it draws are approximate on purpose: the tiles are pre-rendered by GIBS, so this ramp
 * is a guide to their encoding, not a client-side re-colouring — which is also why these are the
 * only literals in this file that are NOT Apple tokens. See the file header.
 */
export const MAP_RAIN_RAMP = {
  trace: '#2f9e44',
  light: '#82c91e',
  moderate: '#ffd43b',
  heavy: '#ff922b',
  intense: '#f03e3e',
  extreme: '#8f1616',
  snowLight: '#22b8cf',
  snowModerate: '#3b5bdb',
  snowHeavy: '#7048e8',
} as const;
