/**
 * frontend/src/lib/geo.ts
 *
 * Geospatial and vulnerability color ramp utilities (TASK-017, TRD §5.1, §7.10)
 */

export type VulnerabilityTier = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export function getVulnerabilityTier(score: number): VulnerabilityTier {
  if (score >= 0.85) return 'CRITICAL';
  if (score >= 0.65) return 'HIGH';
  if (score >= 0.40) return 'MODERATE';
  return 'LOW';
}

/**
 * Returns dynamic hex color along continuous vulnerability ramp:
 * Low (0.0) -> Yellow/Amber (0.5) -> Crimson/Dark Red (1.0)
 */
export function getVulnerabilityColor(score: number): string {
  const s = Math.max(0, Math.min(1, Number(score) || 0));

  if (s >= 0.90) return '#7f1d1d'; // Crimson Dark
  if (s >= 0.80) return '#991b1b'; // Deep Red
  if (s >= 0.65) return '#dc2626'; // Vivid Red
  if (s >= 0.50) return '#ea580c'; // Amber Orange
  if (s >= 0.35) return '#d97706'; // Golden Amber
  if (s >= 0.20) return '#ca8a04'; // Warm Yellow
  return '#16a34a'; // Low Risk Green
}

export function formatVulnerabilityScore(score: number): string {
  return (Math.round((Number(score) || 0) * 1000) / 1000).toFixed(3);
}

export default {
  getVulnerabilityTier,
  getVulnerabilityColor,
  formatVulnerabilityScore,
};
