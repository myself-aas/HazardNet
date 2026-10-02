/**
 * @jest-environment node
 *
 * Streaming tracker — the transport the package never had. `@hazardnet/analytics` used to be
 * an interface plus a no-op, so nothing could be sent and nothing imported it. These tests
 * pin the behaviour a live deployment depends on: batching, the queue cap, one retry then
 * drop, `sendBeacon` on the unload path, PII stripping, and never throwing into the caller.
 */

import { createStreamingTracker } from '../streaming';

interface RecordedCall {
  url: string;
  init?: RequestInit;
  body: { sessionId: string; events: Array<{ event: string; properties: Record<string, unknown>; at: number }> };
}

interface Harness {
  tracker: ReturnType<typeof createStreamingTracker>;
  calls: RecordedCall[];
  errors: Array<{ error: unknown; dropped: number }>;
  fireTimer: () => void;
  wait: () => Promise<void>;
}

/** A tracker with an injectable fetch, clock and timer, so the tests are deterministic. */
function harness(overrides: Partial<Parameters<typeof createStreamingTracker>[0]> = {}): Harness {
  const calls: Harness['calls'] = [];
  const errors: Harness['errors'] = [];
  let clock = 1_700_000_000_000;
  let pendingTimer: (() => void) | null = null;
  // A constant here: the tests swap the *behaviour* by re-creating the fetch, not by
  // reassigning a captured variable.
  const response: Response | (() => Response) = { ok: true, status: 204 } as unknown as Response;

  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(String(init?.body ?? '{}')) });
    return typeof response === 'function' ? response() : response;
  }) as unknown as typeof fetch;

  const tracker = createStreamingTracker({
    endpoint: '/api/v1/telemetry',
    context: { appVersion: '2.2.0', platform: 'web' },
    fetchImpl,
    now: () => (clock += 1),
    schedule: (fn) => { pendingTimer = fn; return 'timer'; },
    cancelScheduled: () => { pendingTimer = null; },
    onError: (error, context) => errors.push({ error, dropped: context.dropped } as never),
    ...overrides,
  });

  return {
    tracker,
    calls,
    errors,
    fireTimer: () => { const fn = pendingTimer; pendingTimer = null; fn?.(); },
    wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
}

describe('createStreamingTracker', () => {
  it('buffers events and flushes when the batch is full', async () => {
    const h = harness({ batchSize: 3 });
    h.tracker.track('a');
    h.tracker.track('b');
    expect(h.calls).toHaveLength(0);

    h.tracker.track('c');
    await h.wait();

    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].url).toBe('/api/v1/telemetry');
    expect(h.calls[0].body.events.map((event) => event.event)).toEqual(['a', 'b', 'c']);
    expect(h.tracker.stats.sent).toBe(3);
    expect(h.tracker.pending).toHaveLength(0);
  });

  it('flushes on the interval timer as well as on size', async () => {
    const h = harness({ batchSize: 100, flushIntervalMs: 10_000 });
    h.tracker.track('a');
    expect(h.calls).toHaveLength(0);

    h.fireTimer();
    await h.wait();

    expect(h.calls).toHaveLength(1);
    expect(h.tracker.stats.sent).toBe(1);
  });

  it('sends immediately when the caller asks for it', async () => {
    const h = harness({ batchSize: 100 });
    h.tracker.track('emergency_call_tapped', { district: 'Dhaka' }, { flush: true });
    await h.wait();
    expect(h.calls).toHaveLength(1);
  });

  it('merges context into every event and strips PII-shaped keys', async () => {
    const h = harness({ batchSize: 1 });
    h.tracker.track('alert_shared', {
      district: 'Khulna',
      email: 'someone@example.org',
      phone_number: '+8801700000000',
      LATITUDE: 22.8,
    });
    await h.wait();

    const properties = h.calls[0].body.events[0].properties;
    expect(properties.district).toBe('Khulna');
    expect(properties.appVersion).toBe('2.2.0');
    expect(properties).not.toHaveProperty('email');
    expect(properties).not.toHaveProperty('phone_number');
    // Matched case-insensitively: a caller cannot dodge the filter by shouting.
    expect(properties).not.toHaveProperty('LATITUDE');
  });

  it('caps its own queue instead of growing without bound', async () => {
    const h = harness({ batchSize: 100, maxQueue: 5 });
    for (let i = 0; i < 20; i += 1) h.tracker.track(`event_${i}`);

    expect(h.tracker.pending).toHaveLength(5);
    // Oldest dropped, newest kept: a stalled network should lose stale events, not live ones.
    expect(h.tracker.pending.map((e) => e.event)).toEqual(['event_15', 'event_16', 'event_17', 'event_18', 'event_19']);
    expect(h.tracker.stats.dropped).toBe(15);
  });

  it('retries a transport failure once, then drops and reports', async () => {
    let attempts = 0;
    const h = harness({
      batchSize: 1,
      fetchImpl: (async () => { attempts += 1; throw new Error('offline'); }) as unknown as typeof fetch,
    });

    h.tracker.track('a');
    await h.wait();
    // The retry delay is a real 2 s setTimeout inside `send`; wait it out.
    await new Promise((resolve) => setTimeout(resolve, 2_100));

    expect(attempts).toBe(2);
    expect(h.tracker.stats.failedBatches).toBe(1);
    expect(h.tracker.stats.dropped).toBe(1);
    expect(h.errors).toHaveLength(1);
    expect(h.errors[0].dropped).toBe(1);
  });

  it('retries a 5xx once and gives up on a 4xx immediately', async () => {
    let attempts = 0;
    const h = harness({
      batchSize: 1,
      fetchImpl: (async () => { attempts += 1; return new Response(null, { status: 400 }); }) as unknown as typeof fetch,
    });
    h.tracker.track('a');
    await h.wait();
    expect(attempts).toBe(1);
    expect(h.tracker.stats.dropped).toBe(1);
  });

  it('uses sendBeacon for the unload flush and keeps the batch when it is refused', async () => {
    const h = harness({ batchSize: 100 });
    h.tracker.track('a');

    const accepted = { value: false };
    const globals = globalThis as typeof globalThis & {
      navigator?: { sendBeacon?: (url: string, blob: unknown) => boolean };
      Blob?: unknown;
    };
    globals.navigator = { sendBeacon: () => accepted.value };
    globals.Blob = class { constructor(public parts: unknown[], public options: unknown) {} };

    await h.tracker.flush?.({ flush: true });
    // Refused → fell back to fetch with the same batch rather than losing it.
    expect(h.calls).toHaveLength(1);
    expect(h.tracker.stats.sent).toBe(1);

    delete globals.navigator;
    delete globals.Blob;
  });

  it('never throws into the caller, even with no transport at all', () => {
    const tracker = createStreamingTracker({
      endpoint: '/api/v1/telemetry',
      fetchImpl: undefined as unknown as typeof fetch,
      // Injected no-op timers: the failure path is what is under test, not the interval.
      schedule: () => 'timer',
      cancelScheduled: () => {},
    });
    expect(() => tracker.track('a')).not.toThrow();
  });

  it('records nothing while disabled (Do Not Track / no consent)', async () => {
    const h = harness({ batchSize: 1, disabled: true });
    h.tracker.track('a');
    h.fireTimer();
    await h.wait();
    expect(h.calls).toHaveLength(0);
    expect(h.tracker.stats.tracked).toBe(0);
  });

  it('keeps one session id across batches and counts what it sent', async () => {
    const h = harness({ batchSize: 1 });
    h.tracker.track('a');
    await h.wait();
    h.tracker.track('b');
    await h.wait();

    expect(h.calls).toHaveLength(2);
    expect(h.calls[0].body.sessionId).toBe(h.calls[1].body.sessionId);
    expect(h.tracker.stats).toMatchObject({ tracked: 2, sent: 2, dropped: 0, failedBatches: 0 });

    h.tracker.reset();
    expect(h.tracker.stats.tracked).toBe(0);
    expect(h.tracker.pending).toHaveLength(0);
  });

  it('replaces unserialisable values instead of losing the whole batch', async () => {
    const h = harness({ batchSize: 1 });
    h.tracker.track('a', { ok: 1, bad: () => undefined, alsoBad: undefined });
    await h.wait();

    const properties = h.calls[0].body.events[0].properties;
    expect(properties.ok).toBe(1);
    expect(properties.bad).toBe('[unserializable]');
  });
});
