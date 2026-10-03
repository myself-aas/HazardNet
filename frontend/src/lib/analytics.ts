/**
 * Web wiring for `@hazardnet/analytics`.
 *
 * The package shipped a `Tracker` interface and a no-op — nothing in the app could send an
 * event, so nothing did. This module is the missing client half: it builds a streaming
 * tracker pointed at `POST /api/v1/telemetry` (see `serverless/v1/telemetry.js`) and owns
 * the two things a browser deployment has to get right that a library cannot:
 *
 *  - **Opt-in.** Analytics is off unless `VITE_ANALYTICS_ENABLED=true` is baked into the
 *    build. A hazard-warning site used by displaced populations should not phone home by
 *    default, and a silently-on tracker is how that happens by accident.
 *  - **Do Not Track.** `navigator.doNotTrack` / `window.doNotTrack` wins over the build flag.
 *
 * Everything else — batching, the queue cap, one retry then drop, PII-shaped key stripping —
 * lives in the package. `trackEvent()` is safe to call anywhere: before init, while disabled,
 * or offline, it is a no-op that cannot throw into a component.
 */

import { envFlag } from './viteEnv';
import {
  ANALYTICS_EVENTS,
  createNoopTracker,
  createStreamingTracker,
  type Tracker,
} from '@hazardnet/analytics';

const ENDPOINT = '/api/v1/telemetry';

let tracker: Tracker = createNoopTracker();
let initialised = false;

const doNotTrackSet = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const dnt = (navigator as Navigator & { doNotTrack?: string | null }).doNotTrack
    ?? (window as Window & { doNotTrack?: string | null }).doNotTrack;
  // `null` means "no preference" in the spec — only an explicit "1" opts out.
  return dnt === '1' || dnt === 'yes';
};

/** Opted in by the build, and the visitor has not said no. */
const wantsTracking = (explicit?: boolean): boolean =>
  !doNotTrackSet() && (explicit ?? envFlag('VITE_ANALYTICS_ENABLED'));

/**
 * Create the tracker and install the unload flush.
 *
 * Safe to call more than once (React StrictMode mounts effects twice in development) and
 * safe under SSR. `enabled` overrides the build flag for callers that know better — a test,
 * or a consent banner that has just been answered — but never overrides Do Not Track.
 */
export function initAnalytics(options: { enabled?: boolean } = {}): void {
  if (initialised || typeof window === 'undefined') return;
  initialised = true;

  if (!wantsTracking(options.enabled)) return;

  tracker = createStreamingTracker({
    endpoint: ENDPOINT,
    context: {
      platform: 'web',
      locale: typeof navigator !== 'undefined' ? navigator.language : undefined,
    },
  });

  // A backgrounded or closing tab kills an in-flight fetch. `sendBeacon` survives it, which
  // is why the tracker supports a beacon flush and why it is wired to both events:
  // `pagehide` fires on mobile Safari where `unload` does not.
  const flush = () => { void tracker.flush?.({ flush: true }); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  trackEvent(ANALYTICS_EVENTS.APP_OPENED, {
    path: window.location.pathname,
    referrer: document.referrer || undefined,
  });
}

/** Track one event. Never throws; never sends unless analytics is enabled. */
export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
  options?: { flush?: boolean },
): void {
  try {
    tracker.track(event, properties, options);
  } catch {
    // Analytics must never break the screen it is measuring.
  }
}

/** Flush the queue — exposed for tests and for the sign-out path. */
export function flushAnalytics(): Promise<void> {
  return tracker.flush?.() ?? Promise.resolve();
}

/** Drop the queue and stop sending (sign-out, consent withdrawn). */
export function resetAnalytics(): void {
  tracker.reset?.();
}

/** Whether this visitor would be tracked, given the build flag and Do Not Track. */
export const isAnalyticsEnabled = (explicit?: boolean): boolean => wantsTracking(explicit);

/**
 * Test seam: forget the tracker and the installed listeners so a suite can re-initialise
 * with different settings. Not for production use — nothing in the app calls it.
 */
export function __resetAnalyticsForTests(): void {
  tracker = createNoopTracker();
  initialised = false;
}
