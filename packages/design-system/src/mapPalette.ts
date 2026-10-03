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
 *   - The ramps below (risk, sensor sites, radar bands, map interactivity) are *data encodings*:
 *     the same deliberate exception the token docs already record for the hazard palette. Values
 *     are literals on purpose and are kept byte-identical to what shipped, because swapping a
 *     data hue is a design decision with a contrast argument behind it, not an extraction.
 *     `MAP_INTERACTIVE` is the one group that is neither: it is stock Tailwind `sky`, and it is
 *     the last off-system interactive hue on the route. It is isolated here so the pass that
 *     replaces it has exactly one file to change.
 */

import { HDS_NASA_TOKENS } from './tokens';

const C = HDS_NASA_TOKENS.colors;

/** Surfaces, rules and text — every value is the token, not a copy of it. */
export const MAP_CHROME = {
  /** Popup and chip surfaces, marker fill, text on dark chips. */
  surface: C.spacesuitWhite,
  /** Quiet panel background inside a popup. */
  surfaceSunken: C.carbon05,
  /** Background of the monospace coordinate readout. */
  rail: C.carbon10,
  /** Borders and dividers. */
  hairline: C.carbon20,
  /** Dashed divider inside a popup. */
  neutral: C.carbon30,
  /** Meta labels (uppercase 9px captions). */
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

/** Map interactivity: GPS accuracy circle, chips, links, the calm end of the radar ramp. */
export const MAP_INTERACTIVE = {
  blue: '#0284c7',
  blueBright: '#38bdf8',
  blueTint: '#e0f2fe',
} as const;

/** District risk, worst to best, plus the crop-state green. */
export const MAP_RISK_RAMP = {
  severe: C.nasaRed,
  high: '#e11d48',
  moderate: '#d97706',
  low: '#16a34a',
  crop: '#059669',
} as const;

/** The three illustrative storm cells on the baseline map. */
export const MAP_SENSOR_SITES = {
  sylhet: '#dc2626',
  teesta: '#ea580c',
  bayOfBengal: '#7c3aed',
} as const;

/** Radar reflectivity bands, low dBZ to high. */
export const MAP_RADAR_BANDS = {
  calm: MAP_INTERACTIVE.blue,
  moderate: '#f59e0b',
  heavy: '#ef4444',
} as const;
