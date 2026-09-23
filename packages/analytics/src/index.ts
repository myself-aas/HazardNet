/**
 * @hazardnet/analytics — shared analytics event names + a thin tracker interface.
 *
 * This package has zero runtime dependencies on any analytics SDK. It defines
 * the canonical event names (re-exported from @hazardnet/core) and a Tracker
 * interface that each app implements with its backend of choice (Vercel
 * Analytics on web, Firebase/Expo Analytics on mobile).
 *
 * Usage:
 *   import { createNoopTracker, ANALYTICS_EVENTS } from '@hazardnet/analytics';
 *   const tracker = createNoopTracker();
 *   tracker.track(ANALYTICS_EVENTS.APP_OPENED, { platform: 'ios' });
 */

export { ANALYTICS_EVENTS } from '@hazardnet/core';
export type {
  AnalyticsEventName,
  CommonEventProperties,
} from '@hazardnet/core';

export interface TrackOptions {
  /** Do not batch; send immediately. */
  flush?: boolean;
}

/** A tracker is a function that receives an event name and properties. */
export interface Tracker {
  track(event: string, properties?: Record<string, unknown>, options?: TrackOptions): void;
  /** Flush any queued events (e.g., on app background). */
  flush?(): Promise<void>;
  /** Reset state (e.g., on sign-out). */
  reset?(): void;
}

/**
 * No-op tracker used for SSR, tests, and uninitialized state. Safe to call.
 */
export function createNoopTracker(): Tracker {
  return {
    track: () => {},
    flush: async () => {},
    reset: () => {},
  };
}

/**
 * Compose multiple trackers into one (e.g., send to both Vercel and Sentry).
 */
export function composeTrackers(...trackers: Tracker[]): Tracker {
  return {
    track(event, properties, options) {
      for (const t of trackers) {
        try {
          t.track(event, properties, options);
        } catch {
          // Swallow errors from a single tracker so analytics never crashes the app.
        }
      }
    },
    async flush() {
      await Promise.all(trackers.map((t) => t.flush?.()));
    },
    reset() {
      for (const t of trackers) t.reset?.();
    },
  };
}
