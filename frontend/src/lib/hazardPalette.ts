/**
 * Hazard identity colours, resolved onto the Apple hazard layer (`--ap-haz-*`).
 *
 * Hazard identity and severity answer different questions. Severity is ordinal
 * ("how bad") and belongs to the five-step severity ramp; hazard identity is
 * categorical ("which kind") and has its own eight documented hues, picked to
 * stay perceptually separable from each other AND from the single chrome
 * accent. Mixing them is a category error that this file used to make: every
 * hazard was painted from the severity ramp, so a flood was drawn in the chrome
 * blue and a drought in extreme-severity red regardless of how severe either
 * actually was.
 *
 * It also collided with itself. Eleven hazard keys collapsed onto five colours
 * — cyclone, tropical-cyclone, flood and monsoon-flood were all one blue;
 * flash-flood and cold-wave shared a hue; severe-local-storm, heat-wave and
 * fire shared another. Categorical encoding that cannot distinguish its own
 * categories is not an encoding.
 *
 * The eight `--ap-haz-*` tokens already existed, with light and dark arms and
 * a contrast suite behind them; nothing referenced them. This file now does.
 *
 * Earthquake is deliberately not one of the eight: the documented set is
 * climatic, and a geophysical hazard borrowing a climatic hue would imply a
 * kinship that is not there. It takes the neutral fallback, and its name and
 * icon carry the identity — which is the rule for every hazard here anyway.
 * Colour is a secondary cue and never the only one (WCAG 1.4.1).
 *
 * The return values are CSS custom properties so maps, SVG, Recharts and badges
 * all resolve to the same tokens and flip together between light and dark.
 */

const HAZARD_COLOR_TOKENS: Record<string, string> = {
  flood: 'var(--ap-haz-flood)',
  'monsoon-flood': 'var(--ap-haz-flood)',
  'riverine-flood': 'var(--ap-haz-flood)',
  'flash-flood': 'var(--ap-haz-flash-flood)',
  cyclone: 'var(--ap-haz-cyclone)',
  'tropical-cyclone': 'var(--ap-haz-cyclone)',
  'storm-surge': 'var(--ap-haz-cyclone)',
  drought: 'var(--ap-haz-drought)',
  'heat-wave': 'var(--ap-haz-heat-wave)',
  heatwave: 'var(--ap-haz-heat-wave)',
  'cold-wave': 'var(--ap-haz-cold-wave)',
  coldwave: 'var(--ap-haz-cold-wave)',
  storm: 'var(--ap-haz-storm)',
  'severe-storm': 'var(--ap-haz-storm)',
  'severe-local-storm': 'var(--ap-haz-storm)',
  lightning: 'var(--ap-haz-storm)',
  fire: 'var(--ap-haz-fire)',
  wildfire: 'var(--ap-haz-fire)',
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
