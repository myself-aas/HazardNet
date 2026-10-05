/**
 * frontend/src/lib/geo.ts
 *
 * Geospatial and vulnerability color ramp utilities (TASK-017, TRD §5.1, §7.10)
 */

import { APPLE_SEVERITY } from '@hazardnet/design-system';

export type VulnerabilityTier = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export function getVulnerabilityTier(score: number): VulnerabilityTier {
  if (score >= 0.85) return 'CRITICAL';
  if (score >= 0.65) return 'HIGH';
  if (score >= 0.40) return 'MODERATE';
  return 'LOW';
}

/**
 * Returns the vulnerability colour for a 0–1 score.
 *
 * Five bands, because the design system publishes five severity levels and this
 * ramp is that encoding — not a parallel one. It previously had seven steps cut
 * from Tailwind defaults, two pairs of which were visually indistinguishable
 * anyway, so the extra resolution was imaginary.
 *
 * Returns the `text` role: these values are used as ink and as a tinted fill,
 * and the text case is the one with a contrast requirement.
 */
export function getVulnerabilityColor(score: number): string {
  const s = Math.max(0, Math.min(1, Number(score) || 0));

  if (s >= 0.90) return APPLE_SEVERITY.extreme.text;
  if (s >= 0.80) return APPLE_SEVERITY.veryHigh.text;
  if (s >= 0.65) return APPLE_SEVERITY.high.text;
  if (s >= 0.40) return APPLE_SEVERITY.moderate.text;
  return APPLE_SEVERITY.low.text;
}

export function formatVulnerabilityScore(score: number): string {
  return (Math.round((Number(score) || 0) * 1000) / 1000).toFixed(3);
}

export default {
  getVulnerabilityTier,
  getVulnerabilityColor,
  formatVulnerabilityScore,
};
