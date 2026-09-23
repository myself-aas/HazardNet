/**
 * Freshness and SLO math.
 *
 * Shared between web status page, mobile banners, and any background logic that
 * needs to decide "is this data too old to trust?".
 *
 * The web's `lib/freshness.ts` uses a five-state model (fresh/stale/failing/
 * missing/unknown). Mobile expands to twelve (see dataStates.ts). This module
 * provides pure age-computation helpers and a mapping from raw artifact state
 * to the richer DataState.
 */

import {
  type DataState,
  DATA_STATE_DEFINITIONS,
} from './dataStates';
import { SLO_HOURS } from './alertPolicy';

/** Freshness states used by the web status page and the freshness.json artifact. */
export type ArtifactState = 'fresh' | 'stale' | 'failing' | 'missing' | 'unknown';

export const ALL_ARTIFACT_STATES: ArtifactState[] = [
  'fresh',
  'stale',
  'failing',
  'missing',
  'unknown',
];

export function isArtifactState(v: unknown): v is ArtifactState {
  return typeof v === 'string' && (ALL_ARTIFACT_STATES as string[]).includes(v);
}

/**
 * Compute age of a data point in whole milliseconds.
 *
 * @param date ISO-8601 string or timestamp ms, or null.
 * @param now  Reference time (Date.now() by default). Accepting a reference
 *             makes this deterministic for tests.
 * @returns Age in milliseconds, or null if input is null/invalid.
 */
export function ageMs(
  date: string | number | null | undefined,
  now: number | Date = Date.now(),
): number | null {
  if (date === null || date === undefined || date === '') return null;
  const t = typeof date === 'number' ? date : Date.parse(date);
  if (Number.isNaN(t)) return null;
  const nowMs = typeof now === 'number' ? now : now.getTime();
  return Math.max(0, nowMs - t);
}

/** Convert a ms duration to whole hours (rounded down). */
export function toHours(ms: number | null): number | null {
  if (ms === null) return null;
  return Math.floor(ms / (60 * 60 * 1000));
}

/** Format a duration as human-friendly English text (localized at app layer). */
export function describeAge(ms: number | null): string {
  if (ms === null) return '—';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const totalH = Math.floor(totalMin / 60);
  if (totalH < 48) return `${totalH}h`;
  const totalD = Math.floor(totalH / 24);
  return `${totalD}d`;
}

/**
 * Decide the freshness state for a cached data source given age and its SLO.
 *
 *   - No age data (never loaded successfully): missing/unknown → mapped to
 *     `offlineNoCache`/`appError` by caller depending on network.
 *   - Within SLO: fresh
 *   - SLO < age < 2×SLO: stale
 *   - age >= 2×SLO: delayed
 */
export function evaluateFreshness(ageMsValue: number | null, sloHours: number): ArtifactState {
  if (ageMsValue === null) return 'unknown';
  const sloMs = sloHours * 60 * 60 * 1000;
  if (ageMsValue <= sloMs) return 'fresh';
  if (ageMsValue <= 2 * sloMs) return 'stale';
  return 'failing'; // "failing" in the artifact model ≈ delayed/past SLO in UI
}

/**
 * Combine network reachability, cached-data availability, artifact freshness,
 * and partial-source flags into a single mobile DataState for a screen.
 *
 * This is the central "what state should this screen be in" decision function.
 * It is pure — UI calls it with current observed facts and renders the result.
 */
export interface ScreenFreshnessInput {
  isOnline: boolean;
  hasCachedDataForScreen: boolean;
  /** Age of the most recent cached payload, in ms. Null if none. */
  cachedAgeMs: number | null;
  /** SLO threshold (hours) for this screen's primary data source. */
  sloHours: number;
  /** Did the last fetch fail with a 5xx/network error? */
  lastFetchFailed: boolean;
  /** Are some sub-sources known to be missing (partial data)? */
  partialSourcesMissing: boolean;
  /** Is there an active (fresh) event to surface? */
  hasActiveEvents: boolean;
  /** Is an app-level error boundary currently rendering? */
  appError: boolean;
  /** Is a critical permission (e.g., location) missing? */
  permissionDenied: boolean;
}

export function deriveDataState(input: ScreenFreshnessInput): DataState {
  // App error is always terminal regardless of anything else.
  if (input.appError) return 'appError';

  if (!input.isOnline) {
    return input.hasCachedDataForScreen ? 'offlineCached' : 'offlineNoCache';
  }

  if (input.lastFetchFailed) {
    // Fetch failed AND we have nothing cached → service unavailable.
    // Fetch failed AND we have stale cached data → show serviceUnavailable
    // banner over the top of stale data (we choose serviceUnavailable so the
    // user knows the server is not responding; data is still visible).
    if (input.hasCachedDataForScreen) {
      // Preserve visible data; surface the failure via the banner.
      return 'serviceUnavailable';
    }
    return 'serviceUnavailable';
  }

  if (input.permissionDenied) return 'permissionDenied';

  // We're online and a fetch succeeded (or we have data from a prior fetch).
  // Decide freshness of cached data.
  if (input.hasCachedDataForScreen) {
    const freshness = evaluateFreshness(input.cachedAgeMs, input.sloHours);
    if (freshness === 'fresh') {
      // Fresh data with partial sources still counts as "partial" — user sees
      // the data but a banner warns that some sources are unavailable.
      if (input.partialSourcesMissing) return 'partial';
      return input.hasActiveEvents ? 'loadedActive' : 'loaded';
    }
    if (freshness === 'stale') {
      if (input.partialSourcesMissing) return 'partial';
      return 'stale';
    }
    // failing == very old
    if (input.partialSourcesMissing) return 'sourceFailure';
    return 'delayed';
  }

  // Online, no error, but no data yet → loading (first fetch).
  return 'loading';
}

/** Render the body template with an {age} placeholder substituted. */
export function renderBody(
  state: DataState,
  vars: Record<string, string | number> = {},
): string {
  const def = DATA_STATE_DEFINITIONS[state];
  let out = def.bodyTemplate;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
}

export { SLO_HOURS };
