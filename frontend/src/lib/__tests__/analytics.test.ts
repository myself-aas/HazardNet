/**
 * The web wiring for @hazardnet/analytics (frontend/src/lib/analytics.ts).
 *
 * The two properties that matter are the consent ones: a hazard-warning site must not phone
 * home unless the build explicitly opts in, and a visitor who set Do Not Track stays dark
 * even when it did. Everything else (batching, retries) is the package's job and is tested
 * in packages/analytics/src/__tests__/streaming.test.ts.
 */
import { envFlag } from '../viteEnv';
import {
  __resetAnalyticsForTests,
  flushAnalytics,
  initAnalytics,
  isAnalyticsEnabled,
  resetAnalytics,
  trackEvent,
} from '../analytics';

// `import.meta.env` is Vite-only and unparseable under Jest, so the build flag is supplied
// by a mock of the tiny module that reads it (see frontend/src/lib/viteEnv.ts).
jest.mock('../viteEnv', () => ({ envFlag: jest.fn(() => false) }));

const setFlag = (value: boolean) => {
  (envFlag as jest.Mock).mockReturnValue(value);
};

const setDoNotTrack = (value: string | null | undefined) => {
  Object.defineProperty(navigator, 'doNotTrack', { value, configurable: true });
};

describe('web analytics wiring', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    __resetAnalyticsForTests();
    setFlag(false);
    setDoNotTrack(undefined);
    // jsdom in this Jest setup has no `Response` global; the tracker only reads `.ok`/`.status`.
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('is off unless the build opts in', () => {
    setFlag(false);
    expect(isAnalyticsEnabled()).toBe(false);
    expect(isAnalyticsEnabled(false)).toBe(false);
    // An explicit `true` is for a caller that knows better than the build (a consent
    // banner, a test) — it overrides the flag, but never Do Not Track.
    expect(isAnalyticsEnabled(true)).toBe(true);
    setFlag(true);
    expect(isAnalyticsEnabled()).toBe(true);
  });

  it('honours Do Not Track even when the caller opted in', () => {
    setDoNotTrack('1');
    expect(isAnalyticsEnabled(true)).toBe(false);
    // "no preference" is not an opt-out: the spec uses null, and some browsers send nothing.
    setDoNotTrack(null);
    expect(isAnalyticsEnabled(true)).toBe(true);
  });

  it('sends nothing while disabled', async () => {
    initAnalytics({ enabled: false });
    trackEvent('app_opened', { path: '/' }, { flush: true });
    await flushAnalytics();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends to /api/v1/telemetry once enabled', async () => {
    setFlag(true);
    initAnalytics();
    trackEvent('alert_shared', { district: 'Khulna' }, { flush: true });
    await flushAnalytics();

    expect(global.fetch).toHaveBeenCalled();
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/v1/telemetry');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.events.some((event: { event: string }) => event.event === 'alert_shared')).toBe(true);
    expect(body.events[0].properties).toMatchObject({ platform: 'web' });
  });

  it('never throws at the call site, whatever the transport does', () => {
    initAnalytics({ enabled: true });
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    expect(() => trackEvent('map_marker_tapped', { district: 'Dhaka' })).not.toThrow();
    expect(() => { void flushAnalytics(); }).not.toThrow();
  });

  it('flushes on pagehide so a closing tab does not lose the queue', async () => {
    initAnalytics({ enabled: true });
    trackEvent('alert_detail_opened', { district: 'Bagerhat' });

    window.dispatchEvent(new Event('pagehide'));
    await flushAnalytics();

    expect(global.fetch).toHaveBeenCalled();
    resetAnalytics();
  });
});
