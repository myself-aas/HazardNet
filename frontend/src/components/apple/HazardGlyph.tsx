/**
 * HazardGlyph — the eight hazard marks plus the five severity marks.
 *
 * The artwork lives in `/hazard-glyphs.svg` as an SVG sprite: original drawings
 * made for this repository, no third-party icon set. Spriting them means one
 * request for all thirteen marks instead of thirteen, which matters on the
 * low-bandwidth networks this product is used on.
 *
 * Every glyph is `currentColor`, so it inherits the severity token beside it
 * rather than carrying its own colour — which is what lets one glyph serve
 * light theme, dark theme and greyscale print without variants.
 */

import React from 'react';

/** The eight published hazard classes, in the order `labels.json` numbers them. */
export const HAZARD_IDS = [
  'cold-wave',
  'drought',
  'fire',
  'flash-flood',
  'flood',
  'heat-wave',
  'severe-local-storm',
  'tropical-cyclone',
] as const;

export type HazardId = (typeof HAZARD_IDS)[number];

export const SEVERITY_IDS = ['low', 'moderate', 'high', 'veryHigh', 'extreme'] as const;
export type SeverityGlyphId = (typeof SEVERITY_IDS)[number];

const SEVERITY_SYMBOL: Record<SeverityGlyphId, string> = {
  low: 'hn-sev-bar1',
  moderate: 'hn-sev-bar2',
  high: 'hn-sev-bar3',
  veryHigh: 'hn-sev-bar4',
  extreme: 'hn-sev-diamond',
};

/** Accepts the several spellings the artifacts actually carry. */
const ALIASES: Record<string, HazardId> = {
  cold: 'cold-wave',
  coldwave: 'cold-wave',
  cold_wave: 'cold-wave',
  drought: 'drought',
  fire: 'fire',
  flashflood: 'flash-flood',
  'flash flood': 'flash-flood',
  flash_flood: 'flash-flood',
  'flash-flood': 'flash-flood',
  flood: 'flood',
  heat: 'heat-wave',
  heatwave: 'heat-wave',
  heat_wave: 'heat-wave',
  'heat-wave': 'heat-wave',
  storm: 'severe-local-storm',
  sls: 'severe-local-storm',
  'severe local storm': 'severe-local-storm',
  severe_local_storm: 'severe-local-storm',
  'severe-local-storm': 'severe-local-storm',
  cyclone: 'tropical-cyclone',
  'tropical cyclone': 'tropical-cyclone',
  tropical_cyclone: 'tropical-cyclone',
  'tropical-cyclone': 'tropical-cyclone',
};

/** Normalises a hazard string from any artifact into a known glyph id. */
export function normaliseHazardId(input: string | null | undefined): HazardId | null {
  if (!input) return null;
  const key = input.trim().toLowerCase();
  if ((HAZARD_IDS as readonly string[]).includes(key)) return key as HazardId;
  return ALIASES[key] ?? null;
}

export interface HazardGlyphProps {
  hazard: string | null | undefined;
  /** Rendered px size. 16 is the size these actually ship at in tables. */
  size?: number;
  /** Accessible name. Omit for decorative use beside a visible text label. */
  label?: string;
  className?: string;
  title?: string;
}

/**
 * One hazard mark.
 *
 * An unrecognised hazard renders nothing rather than a placeholder: inventing a
 * glyph for a hazard class the system does not publish would misrepresent the
 * taxonomy, and an empty slot is honest where a wrong symbol is not.
 */
export function HazardGlyph({ hazard, size = 16, label, className, title }: HazardGlyphProps) {
  const id = normaliseHazardId(hazard);
  if (!id) return null;

  const decorative = !label && !title;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={label}
      focusable="false"
      className={className}
      style={{ flexShrink: 0 }}
    >
      {title ? <title>{title}</title> : null}
      <use href={`/hazard-glyphs.svg#hn-hz-${id}`} />
    </svg>
  );
}

export interface SeverityGlyphProps {
  level: SeverityGlyphId;
  size?: number;
  className?: string;
}

/**
 * The severity shape cue. Redundant with the colour on purpose — WCAG 1.4.1
 * forbids colour as the only carrier of meaning, and the practical case is a
 * colour-blind reader on a cracked screen in monsoon light.
 */
export function SeverityGlyph({ level, size = 12, className }: SeverityGlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" focusable="false" className={className}>
      <use href={`/hazard-glyphs.svg#${SEVERITY_SYMBOL[level]}`} />
    </svg>
  );
}

export default HazardGlyph;
