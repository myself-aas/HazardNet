/**
 * Data-state machine for HazardNet surfaces.
 *
 * Every screen must be in exactly one of these twelve states. The states are
 * exhaustive and mutually exclusive; they are rendered with distinct banners,
 * copy, and CTAs. See docs/MOBILE_AUDIT_AND_REDESIGN.md §7 for the full
 * treatment. The web surface currently collapses several of these into five
 * states (fresh/stale/failing/missing/unknown); mobile expands to twelve so
 * that "no alerts" is never visually confused with "data failed to load".
 */

export type DataState =
  | 'loading'
  | 'loaded'                // fresh + no active events
  | 'loadedActive'          // fresh + active events
  | 'partial'               // some sources missing
  | 'stale'                 // > TTL but < 2x TTL
  | 'delayed'               // > 2x TTL
  | 'offlineCached'         // offline with cached data
  | 'offlineNoCache'        // offline without cached data
  | 'permissionDenied'
  | 'serviceUnavailable'    // 5xx / API down
  | 'sourceFailure'         // specific source down
  | 'appError';

export const ALL_DATA_STATES: DataState[] = [
  'loading',
  'loaded',
  'loadedActive',
  'partial',
  'stale',
  'delayed',
  'offlineCached',
  'offlineNoCache',
  'permissionDenied',
  'serviceUnavailable',
  'sourceFailure',
  'appError',
];

/** Banner tone drives which color/banner treatment the UI renders. */
export type BannerTone = 'neutral' | 'green' | 'blue' | 'amber' | 'red';

export interface DataStateDefinition {
  /** Stable enum value. */
  state: DataState;
  /** Banner tone. */
  tone: BannerTone;
  /** Higher number = more severe; UI can use this to sort/prefer messaging. */
  priority: number;
  /** User-visible copy (English); localized via app layer. */
  headline: string;
  /** Short template for the "updated X ago" line. */
  bodyTemplate: string;
  /** Label for the primary recovery action, or null if no action is appropriate. */
  primaryAction: string | null;
}

/**
 * Canonical definitions for each state. The copy is English and generic; apps
 * should substitute place-specific copy (e.g., hazard name, place name).
 */
export const DATA_STATE_DEFINITIONS: Record<DataState, DataStateDefinition> = {
  loading: {
    state: 'loading',
    tone: 'neutral',
    priority: 0,
    headline: 'Updating…',
    bodyTemplate: 'Fetching the latest hazard data.',
    primaryAction: null,
  },
  loaded: {
    state: 'loaded',
    tone: 'green',
    priority: 0,
    headline: 'Up to date',
    bodyTemplate: 'No active alerts for this area.',
    primaryAction: null,
  },
  loadedActive: {
    state: 'loadedActive',
    tone: 'red',
    priority: 1,
    headline: 'Active alerts',
    bodyTemplate: 'There are active alerts for this area.',
    primaryAction: 'View instructions',
  },
  partial: {
    state: 'partial',
    tone: 'amber',
    priority: 2,
    headline: 'Some data is unavailable',
    bodyTemplate: 'Not all data sources responded. Showing what we have.',
    primaryAction: 'Data status',
  },
  stale: {
    state: 'stale',
    tone: 'amber',
    priority: 3,
    headline: 'Data is old',
    bodyTemplate: 'This data is {age} old. HazardNet is having trouble refreshing.',
    primaryAction: 'Try again',
  },
  delayed: {
    state: 'delayed',
    tone: 'amber',
    priority: 4,
    headline: 'Data is delayed',
    bodyTemplate: 'Data is {age} old. Showing last known values.',
    primaryAction: 'See status',
  },
  offlineCached: {
    state: 'offlineCached',
    tone: 'blue',
    priority: 3,
    headline: 'Offline',
    bodyTemplate: 'Showing data saved {age} ago.',
    primaryAction: null,
  },
  offlineNoCache: {
    state: 'offlineNoCache',
    tone: 'red',
    priority: 5,
    headline: "You're offline",
    bodyTemplate: "No saved data is available for this area yet.",
    primaryAction: 'Call emergency services',
  },
  permissionDenied: {
    state: 'permissionDenied',
    tone: 'neutral',
    priority: 2,
    headline: 'Permission not granted',
    bodyTemplate: '{permission} access is denied. Showing national summary.',
    primaryAction: 'Open settings',
  },
  serviceUnavailable: {
    state: 'serviceUnavailable',
    tone: 'red',
    priority: 5,
    headline: 'Service unavailable',
    bodyTemplate: 'HazardNet servers are not responding. Showing last known data.',
    primaryAction: 'Retry',
  },
  sourceFailure: {
    state: 'sourceFailure',
    tone: 'amber',
    priority: 2,
    headline: 'Source unavailable',
    bodyTemplate: '{source} data is not available. Showing other data.',
    primaryAction: 'Data status',
  },
  appError: {
    state: 'appError',
    tone: 'red',
    priority: 6,
    headline: 'Something went wrong',
    bodyTemplate: 'The app encountered an error. You can still call emergency services.',
    primaryAction: 'Restart',
  },
};

/**
 * Reduce multiple concurrent states to the highest-priority one so banners
 * don't stack. For example, "offline" + "delayed" → show "offline" (which
 * implies staleness) or whichever has higher priority.
 */
export function highestPriorityState(states: DataState[]): DataState | null {
  if (!states.length) return null;
  return states.reduce((best, s) =>
    DATA_STATE_DEFINITIONS[s].priority > DATA_STATE_DEFINITIONS[best].priority ? s : best,
  );
}

/** Type guard for DataState. */
export function isDataState(value: unknown): value is DataState {
  return typeof value === 'string' && (ALL_DATA_STATES as string[]).includes(value);
}
