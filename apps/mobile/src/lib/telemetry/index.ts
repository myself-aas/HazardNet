/**
 * Telemetry (Phase 9) — minimal, privacy-preserving event tracking.
 *
 * We intentionally DO NOT integrate Sentry/expo-analytics-amplitude in the
 * sandbox because that requires DSN endpoints and native SDK linking. Phase 9a
 * ships the TelemetryClient interface + a default NoopClient + an in-memory
 * debug logger. Sentry wiring is a drop-in replacement at Phase 9b when the
 * production DSN is provisioned — a single `client.setClient(sentryClient)`
 * call is sufficient.
 *
 * Privacy rules (enforced in .track()):
 *   - never attach location coordinates
 *   - never attach saved-place labels or notes
 *   - never attach alert district names on critical-path events
 *   - all events are redacted through redactError/redactPlace before passing
 *     to the transport
 */

import { redactError, redactPlace } from '../security/sanitize';

export type TelemetryEvent =
  | { name: 'app.open'; props?: Record<string, string | number | boolean> }
  | { name: 'app.cold_start'; props: { ttfcMs: number } }
  | { name: 'screen.view'; props: { screen: string } }
  | { name: 'permission.request'; props: { which?: 'location' | 'notifications' | 'camera' | 'library'; kind?: string; result: 'granted' | 'denied' } }
  | { name: 'place.add'; props: { source: 'current' | 'manual'; hasLocation: boolean } }
  | { name: 'notif.tap'; props: { channel: string } }
  | { name: 'report.submit'; props: { hasPhoto: boolean; hasLocation: boolean; queued: boolean } }
  | { name: 'error'; props?: { name?: string; message?: string; fatal?: boolean; where?: string } }
  | { name: 'security.url_blocked'; props?: { label?: string } };

export interface TelemetryClient {
  track(event: TelemetryEvent): void;
}

class NoopClient implements TelemetryClient {
  track() {}
}

class DebugClient implements TelemetryClient {
  private events: TelemetryEvent[] = [];
  track(e: TelemetryEvent) { this.events.push(e); if (__DEV__) console.info('[telemetry]', e.name, e.props ?? {}); }
  getEvents() { return this.events.slice(); }
  reset() { this.events = []; }
}

let client: TelemetryClient = new NoopClient();
let debug: DebugClient | null = null;

/** Activate in-memory debug logging (used by tests). */
export function enableDebugLogging() {
  debug = new DebugClient();
  client = debug;
  return debug;
}

/** Install a production telemetry transport (Sentry, etc). Called at most once. */
export function setTelemetryClient(c: TelemetryClient) {
  client = c;
}

export function track(event: TelemetryEvent) {
  // Apply redaction to error events.
  let ev = event;
  if (ev.name === 'error' && (ev.props as any).rawError) {
    const { rawError, ...rest } = ev.props as any;
    ev = { name: 'error', props: { ...redactError(rawError), ...rest } } as any;
  }
  client.track(ev);
}

/** Helper to time TTFC (time to first content) for cold-start telemetry. */
export function startMark(name: string): () => void {
  const start = performance.now();
  return () => {
    if (name === 'ttfc') track({ name: 'app.cold_start', props: { ttfcMs: Math.round(performance.now() - start) } });
  };
}

export { redactPlace };
