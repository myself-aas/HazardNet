/**
 * Hazard identity colors, expressed only through HazardNet's global Meridian/HDS tokens.
 *
 * Apple-inspired restraint: browsing surfaces stay neutral; HazardNet's blue, ink and
 * crimson remain semantic interaction/urgency roles. Hazard *identity* is categorical data,
 * so it uses only the already-approved `--chart-1…5` HDS series, not the brand action colors
 * and not a page-local rainbow. The hazard name and icon carry identity; color is a secondary
 * cue, never the only one.
 *
 * The return values are CSS custom properties so maps, SVG, Recharts and badges all resolve
 * to the same global chart palette. This replaces page-local Tailwind defaults and duplicated
 * hex maps.
 */

const HAZARD_COLOR_TOKENS: Record<string, string> = {
  cyclone: 'var(--chart-1)',
  'tropical-cyclone': 'var(--chart-1)',
  flood: 'var(--chart-1)',
  'monsoon-flood': 'var(--chart-1)',
  'flash-flood': 'var(--chart-3)',
  'severe-local-storm': 'var(--chart-2)',
  'cold-wave': 'var(--chart-3)',
  drought: 'var(--chart-5)',
  'heat-wave': 'var(--chart-2)',
  earthquake: 'var(--chart-4)',
  fire: 'var(--chart-2)',
};

function hazardKey(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : '';
}

/** The canonical token for a hazard type, with a neutral fallback for unknown labels. */
export function getHazardColor(value: unknown): string {
  return HAZARD_COLOR_TOKENS[hazardKey(value)] ?? 'var(--ap-label-secondary)';
}

/** A subdued surface derived from that same semantic color. */
export function getHazardSurface(value: unknown, strength = 8): string {
  const amount = Math.max(0, Math.min(100, Math.round(strength)));
  return `color-mix(in srgb, ${getHazardColor(value)} ${amount}%, var(--ap-bg-canvas))`;
}

/** A fine border derived from the same semantic color. */
export function getHazardBorder(value: unknown, strength = 28): string {
  const amount = Math.max(0, Math.min(100, Math.round(strength)));
  return `color-mix(in srgb, ${getHazardColor(value)} ${amount}%, var(--ap-separator))`;
}
