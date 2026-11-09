import { SLO_HOURS } from './freshnessSlo.js';
import { AUTO_PUBLISH_CEILING, TIER_BANDS } from './advisoryTier.js';

/**
 * Alert policy constants and helpers.
 *
 * Canonical values match `serverless/v1/alerts/policy.js` and the public /alerts page
 * documentation (alert-policy/1.0.0). These numbers are shared between web and
 * mobile so both platforms draw severity bands consistently.
 *
 * Thresholds in force at the time of writing — **the manuscript's bands**
 * (0.40 / 0.70 / 0.85), which is the single set the pipeline, the web client and the
 * mobile client all cut on:
 *   WATCH   — severity >= 0.40. The pipeline may publish at this level unreviewed.
 *   WARNING — severity >= 0.70; requires a named duty-officer review.
 *   SEVERE  — severity >= 0.85; requires ministry authorisation.
 *
 * Until 2026-10-06 this table read 0.40 / 0.65 / 0.80 with a separate 0.55 WATCH floor, and
 * neither the web client's tier fallback (0.34 / 0.67) nor `StatusStrip`'s (0.30 / 0.50 /
 * 0.75) used it — four sets of numbers, so the same district could carry three different
 * tiers. The manuscript's bands are now the only ones in the repository, the pipeline stamps
 * the tier onto every forecast row (`scripts/lib/advisory-tier.mjs`), and
 * `__tests__/advisoryTierBands.test.js` fails if any of the three producers drift again.
 *
 * NOTE: These remain *display and derivation* bands. The authoritative signal for publication
 * is the `level` field on a published AlertItem: client code must never promote a raw
 * `severity_score` above `AUTO_PUBLISH_CEILING` — see `tierFromSeverity` in the web client,
 * which stops at WATCH.
 */

export const ALERT_POLICY_VERSION = 'alert-policy/1.0.0' as const;

/** Automatic publishing ceiling — engine may publish at or below this level without human review. */
export { AUTO_PUBLISH_CEILING } from './advisoryTier.js';

/**
 * Severity thresholds for client-side display bucketing (when the API does not provide a level).
 *
 * The bands live in `advisoryTier.js`, with the tiers they cut and the review rule that follows
 * from them. This object is the name every existing import reads; `WATCH_MIN_SEVERITY` is the
 * same number under the second name it was once given (the manuscript defines one WATCH floor,
 * not two).
 */
export const SEVERITY_THRESHOLDS = {
  ...TIER_BANDS,
  WATCH_MIN_SEVERITY: TIER_BANDS.WATCH,
} as const;

/** Confidence bins — from `advisoryTier.js`, beside the tier bands. */
export { CONFIDENCE_THRESHOLDS } from './advisoryTier.js';

/**
 * SLOs in hours — the numbers themselves live in `freshnessSlo.js`.
 *
 * They used to be declared here, and the pipeline declared a different set in
 * `scripts/build_freshness_artifact.mjs`. Nothing compared them, so both were "right".
 * `freshnessSlo.js` is the owner; this re-export keeps the name every existing import uses.
 */
export { SLO_HOURS };

/**
 * The alert-snapshot SLO under the name this module used before it was shared.
 *
 * `SLO_HOURS.ALERTS` is the owner's spelling; `ALERT_SNAPSHOT` is the alias every existing call
 * site and test already reads. Both name the same number because both are the same object — this is a
 * rename in progress, not a second declaration.
 */
export const ALERT_SNAPSHOT_SLO_HOURS = SLO_HOURS.ALERT_SNAPSHOT;

/** Cache TTLs by hazard type (in milliseconds). See mobile audit §7. */
export const CACHE_TTL_MS = {
  // Fast-evolving hazards: short TTL during active events, longer otherwise
  FLASH_FLOOD_ACTIVE: 6 * 60 * 60 * 1000,        // 6h
  FLASH_FLOOD_DEFAULT: 24 * 60 * 60 * 1000,      // 24h
  TROPICAL_CYCLONE_ACTIVE: 6 * 60 * 60 * 1000,
  TROPICAL_CYCLONE_DEFAULT: 24 * 60 * 60 * 1000,
  SEVERE_LOCAL_STORM_ACTIVE: 6 * 60 * 60 * 1000,
  SEVERE_LOCAL_STORM_DEFAULT: 24 * 60 * 60 * 1000,
  // Medium-evolving
  MONSOON_FLOOD: 24 * 60 * 60 * 1000,            // 24h
  HEAT_WAVE: 24 * 60 * 60 * 1000,
  COLD_WAVE: 24 * 60 * 60 * 1000,
  // Slow-evolving
  DROUGHT: 48 * 60 * 60 * 1000,                  // 48h
  FIRE: 48 * 60 * 60 * 1000,
  // Fallback for unknown hazard types
  DEFAULT: 24 * 60 * 60 * 1000,
} as const;

/**
 * Returns the appropriate cache TTL (ms) for a given hazard type.
 * During active events (i.e., when there is a >=WARNING alert for the hazard),
 * callers should pass `active: true` to get the shorter TTL.
 */
export function cacheTtlForHazard(
  hazardType: string,
  opts: { active?: boolean } = {},
): number {
  const key = String(hazardType).toUpperCase().replace(/[-\s]+/g, '_');
  const active = opts.active === true;

  switch (key) {
    case 'FLASH_FLOOD':
      return active ? CACHE_TTL_MS.FLASH_FLOOD_ACTIVE : CACHE_TTL_MS.FLASH_FLOOD_DEFAULT;
    case 'TROPICAL_CYCLONE':
    case 'CYCLONE':
      return active
        ? CACHE_TTL_MS.TROPICAL_CYCLONE_ACTIVE
        : CACHE_TTL_MS.TROPICAL_CYCLONE_DEFAULT;
    case 'SEVERE_LOCAL_STORM':
    case 'STORM':
    case 'NORWESTER':
      return active
        ? CACHE_TTL_MS.SEVERE_LOCAL_STORM_ACTIVE
        : CACHE_TTL_MS.SEVERE_LOCAL_STORM_DEFAULT;
    case 'MONSOON_FLOOD':
    case 'FLOOD':
      return CACHE_TTL_MS.MONSOON_FLOOD;
    case 'HEAT_WAVE':
    case 'HEAT':
      return CACHE_TTL_MS.HEAT_WAVE;
    case 'COLD_WAVE':
    case 'COLD':
      return CACHE_TTL_MS.COLD_WAVE;
    case 'DROUGHT':
      return CACHE_TTL_MS.DROUGHT;
    case 'FIRE':
    case 'WILDFIRE':
      return CACHE_TTL_MS.FIRE;
    default:
      return CACHE_TTL_MS.DEFAULT;
  }
}

/** Legal disclaimer that must appear on every public surface (matches web canonical text). */
export const OFFICIAL_DISCLAIMER =
  'HazardNet is a research-based decision-support tool. It is not an official warning service. Always follow instructions from BMD, FFWC, DDM and your local administration.' as const;

/** Emergency contact numbers for Bangladesh. */
export const EMERGENCY_CONTACTS = [
  { id: '999',   number: '999',   label: 'National emergency' },
  { id: '1090',  number: '1090',  label: 'Disaster response' },
  { id: '16123', number: '16123', label: 'Agriculture helpline' },
] as const;

export type EmergencyContact = (typeof EMERGENCY_CONTACTS)[number];
