/**
 * Map palette — every colour the live map draws, keyed by the role it plays.
 *
 * Why this exists (V-P1-1 in `docs/audits/2026-10-03-landing-live-hero-audit.md`): the live map
 * used to hold 79 hex literals inline, in a 2,400-line component. Dark mode, high-contrast mode,
 * the low-bandwidth collapse and the React Native theme each had to be re-derived inside that one
 * file, while every surrounding component followed a token change for free. It is now the only
 * place a map colour is written down, and the native map screen can import the same object.
 *
 * Two kinds of entry live here, and they are labelled:
 *
 *   - Chrome and text are the design system's own values, referenced from `HDS_NASA_TOKENS` —
 *     not retyped. If a carbon step moves, the map moves with it.
 *   - The ramps below (risk, heat gradient, map interactivity) are *data encodings*: the same
 *     deliberate exception the token docs already record for the hazard palette. Values are
 *     literals on purpose and are kept byte-identical to what shipped, because swapping a data
 *     hue is a design decision with a contrast argument behind it, not an extraction.
 *     `MAP_INTERACTIVE` is the one group that is neither: it is stock Tailwind `sky`, and it is
 *     the last off-system interactive hue on the route. It is isolated here so the pass that
 *     replaces it has exactly one file to change.
 *
 * 2026-10-05: the `MAP_SENSOR_SITES` group (three hard-coded "storm cells") and the old
 * `MAP_RADAR_BANDS` name were removed with the fake Doppler radar they decorated. The heat
 * gradient kept its exact colours under the honest name `MAP_HEAT_RAMP`.
 */

import { HDS_NASA_TOKENS } from './tokens';

const C = HDS_NASA_TOKENS.colors;

/** Surfaces, rules and text — every value is the token, not a copy of it. */
export const MAP_CHROME = {
  /** Popup and chip surfaces, marker fill, text on dark chips. */
  surface: C.spacesuitWhite,
  /** Meta labels (uppercase captions). */
  muted: C.carbon50,
  /** Secondary body copy. */
  inkSoft: C.carbon60,
  /** Body copy. */
  ink: C.carbon70,
  /** Headings and district names. */
  inkStrong: C.carbon90,
  /** Base ink of the map popups — a dark teal, not a carbon step. */
  panelInk: '#023246',
} as const;

/** Map interactivity: GPS accuracy circle, chips, links. */
export const MAP_INTERACTIVE = {
  blue: '#0284c7',
  blueBright: '#38bdf8',
} as const;

/** District risk, worst case kept for the user-location marker ring. */
export const MAP_RISK_RAMP = {
  severe: C.nasaRed,
} as const;

/** Hazard heatmap gradient, low intensity to high. */
export const MAP_HEAT_RAMP = {
  calm: MAP_INTERACTIVE.blue,
  moderate: '#f59e0b',
  heavy: '#ef4444',
} as const;

/**
 * GPM IMERG rain-rate ramp (Phase D, 2026-10-05): documents the colouring GIBS
 * itself renders for `IMERG_Precipitation_Rate` — greens for light rain through
 * yellows and oranges to deep reds for intense rain, with cyan/blue/purple for
 * snowfall shown as liquid-water equivalent. The legend boundaries it draws are
 * approximate on purpose: the tiles are pre-rendered by GIBS, so this ramp is a
 * guide to their encoding, not a client-side re-colouring.
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
