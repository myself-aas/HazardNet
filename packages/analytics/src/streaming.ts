/**
 * @hazardnet/analytics — streaming tracker.
 *
 * The package used to ship only a `Tracker` interface and a no-op implementation, so no app
 * could actually send an event: every caller would have had to write its own transport, and
 * none did (nothing in the workspace imported `@hazardnet/analytics` except the Jest and
 * TypeScript path mappings). This is the missing half — a dependency-free tracker that
 * batches events and streams them to an endpoint, with the failure behaviour a live
 * deployment needs.
 *
 * Design constraints, in the order they bite in production:
 *
 *  - **Never throw into the caller.** An analytics failure must not break a hazard screen.
 *    Everything that can fail (serialising, sending, retrying) is caught and reported through
 *    `onError`.
 *  - **Bounded memory.** A tracker that queues without a cap turns a network outage into a
 *    slow memory leak on a phone that is already offline. `maxQueue` drops the oldest events
 *    and says so.
 *  - **Flushes that survive navigation.** `flush({ beacon: true })` uses `sendBeacon` when it
 *    exists, because a page unload kills an in-flight `fetch`.
 *  - **Honest transport failure.** A failed batch is retried once with backoff and then
 *    dropped; it is not retried forever, and the drop is counted so the metric owner can see
 *    the loss instead of assuming the numbers are complete.
 *  - **No PII by construction.** Property keys that look like identifiers or contact details
 *    are stripped before the event leaves the device (`redactKeys`). The advisory product
 *    handles displaced-population data; an analytics payload is the last place a phone
 *    number should end up.
 */

import type { Tracker, TrackOptions } from './index';

/** A queued event, stamped at enqueue time so a late flush keeps the original ordering. */
export interface QueuedEvent {
  event: string;
  properties: Record<string, unknown>;
  /** Milliseconds since the epoch, from the injected clock. */
  at: number;
}

export interface SendBatch {
  /** Events in the order they were tracked. */
  events: QueuedEvent[];
  /** Opaque, stable for the lifetime of the tracker. */
  sessionId: string;
}

export interface StreamingTrackerOptions {
  /** Absolute or root-relative URL that accepts `POST` of a `SendBatch`. */
  endpoint: string;
  /** Flush once the queue reaches this size. Default 20. */
  batchSize?: number;
  /** Flush at most once per this interval, ms. Default 10 000. Set 0 to disable. */
  flushIntervalMs?: number;
  /** Hard cap on the queue; oldest events are dropped past it. Default 500. */
  maxQueue?: number;
  /** Properties merged into every event (app version, platform, locale…). */
  context?: Record<string, unknown>;
  /** Injectable for tests and for React Native, which has no global `sendBeacon`. */
  fetchImpl?: typeof fetch;
  /** Injectable clock (ms). */
  now?: () => number;
  /** Injectable timer, so tests do not wait on real time. */
  schedule?: (fn: () => void, ms: number) => unknown;
  cancelScheduled?: (handle: unknown) => void;
  /** Called instead of throwing when a send fails after retry. */
  onError?: (error: unknown, context: { dropped: number }) => void;
  /** Property keys to strip from every event, matched case-insensitively. */
  redactKeys?: string[];
  /** Skip tracking entirely (Do Not Track, consent not given). Default false. */
  disabled?: boolean;
}

export interface StreamingTracker extends Tracker {
  /** Events currently queued (read-only copy) — used by tests and by the debug panel. */
  readonly pending: QueuedEvent[];
  /** Counters since `reset()`. */
  readonly stats: StreamingStats;
}

export interface StreamingStats {
  tracked: number;
  sent: number;
  dropped: number;
  failedBatches: number;
}

/** Anything that looks like a person rather than a product metric. */
export const DEFAULT_REDACT_KEYS = [
  'email', 'phone', 'phone_number', 'whatsapp', 'whatsapp_number', 'address',
  'lat', 'lng', 'latitude', 'longitude', 'pinpoint_lat', 'pinpoint_lng',
  'token', 'api_key', 'apikey', 'password', 'authorization',
];

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_FLUSH_INTERVAL_MS = 10_000;
const DEFAULT_MAX_QUEUE = 500;
const RETRY_DELAY_MS = 2_000;

export function createStreamingTracker(options: StreamingTrackerOptions): StreamingTracker {
  const {
    endpoint,
    batchSize = DEFAULT_BATCH_SIZE,
    flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
    maxQueue = DEFAULT_MAX_QUEUE,
    context = {},
    now = () => Date.now(),
    onError,
    redactKeys = DEFAULT_REDACT_KEYS,
    disabled = false,
  } = options;

  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
  const schedule = options.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancelScheduled = options.cancelScheduled ?? ((handle: unknown) => clearTimeout(handle as never));

  const redacted = new Set(redactKeys.map((key) => key.toLowerCase()));
  const sessionId = `s_${now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  let queue: QueuedEvent[] = [];
  let timer: unknown = null;
  let flushing = false;
  const stats: StreamingStats = { tracked: 0, sent: 0, dropped: 0, failedBatches: 0 };

  const strip = (properties: Record<string, unknown> | undefined): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries({ ...context, ...(properties ?? {}) })) {
      if (redacted.has(key.toLowerCase())) continue;
      // JSON-unfriendly values (functions, symbols, DOM nodes) would break the serialiser
      // for the whole batch; keep the key with a marker so the gap is visible.
      out[key] = isSerializable(value) ? value : '[unserializable]';
    }
    return out;
  };

  const armTimer = () => {
    if (flushIntervalMs <= 0 || timer !== null) return;
    timer = schedule(() => {
      timer = null;
      void flush();
    }, flushIntervalMs);
  };

  async function send(batch: SendBatch): Promise<boolean> {
    if (!fetchImpl) {
      stats.failedBatches += 1;
      onError?.(new Error('no fetch implementation available'), { dropped: batch.events.length });
      return false;
    }
    const body = JSON.stringify(batch);
    // `keepalive` lets the request survive a page navigation; `sendBeacon` is the fallback
    // for the unload path itself and is used by `flush({ beacon: true })`.
    const attempt = async (): Promise<Response> => fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    } as RequestInit);

    try {
      let response = await attempt();
      if (!response.ok && response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        response = await attempt();
      }
      if (!response.ok) {
        stats.failedBatches += 1;
        onError?.(new Error(`analytics endpoint returned ${response.status}`), { dropped: batch.events.length });
        return false;
      }
      return true;
    } catch (error) {
      // One retry on a transport error (offline, DNS, CORS preflight refusal) — then drop.
      try {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        const response = await attempt();
        if (response.ok) return true;
      } catch { /* fall through to the drop below */ }
      stats.failedBatches += 1;
      onError?.(error, { dropped: batch.events.length });
      return false;
    }
  }

  async function flush(options2: { beacon?: boolean } = {}): Promise<void> {
    if (disabled) return;
    if (queue.length === 0) return;
    // A flush already in flight owns its slice of the queue; a second caller waits rather
    // than sending the same events twice.
    if (flushing) return;

    const batch: SendBatch = { events: queue, sessionId };
    queue = [];
    flushing = true;
    if (timer !== null) { cancelScheduled(timer); timer = null; }

    try {
      if (options2.beacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const accepted = navigator.sendBeacon(endpoint, new Blob([JSON.stringify(batch)], { type: 'application/json' }));
        if (accepted) { stats.sent += batch.events.length; return; }
        // Rejected (queue full / payload too large): fall through to fetch with the same
        // batch rather than losing it silently.
      }
      const ok = await send(batch);
      if (ok) stats.sent += batch.events.length;
      else stats.dropped += batch.events.length;
    } catch (error) {
      stats.dropped += batch.events.length;
      onError?.(error, { dropped: batch.events.length });
    } finally {
      flushing = false;
      armTimer();
    }
  }

  return {
    track(event: string, properties?: Record<string, unknown>, trackOptions?: TrackOptions) {
      if (disabled) return;
      if (typeof event !== 'string' || !event.trim()) return;
      stats.tracked += 1;
      queue.push({ event: event.trim(), properties: strip(properties), at: now() });

      if (queue.length > maxQueue) {
        const excess = queue.length - maxQueue;
        queue.splice(0, excess);
        stats.dropped += excess;
      }
      if (queue.length >= batchSize) void flush();
      else armTimer();
      // `flush: true` is the caller asking for an immediate send (e.g. a safety-critical
      // interaction that must not be lost to a backgrounded tab).
      if (trackOptions?.flush) void flush();
    },

    flush: (trackOptions?: TrackOptions) => flush({ beacon: trackOptions?.flush === true }),

    reset() {
      queue = [];
      if (timer !== null) { cancelScheduled(timer); timer = null; }
      stats.tracked = 0;
      stats.sent = 0;
      stats.dropped = 0;
      stats.failedBatches = 0;
    },

    get pending() { return [...queue]; },
    get stats() { return { ...stats }; },
  };
}

function isSerializable(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return Number.isFinite(value as number) || type !== 'number';
  if (type !== 'object') return false; // function, symbol, bigint
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}
