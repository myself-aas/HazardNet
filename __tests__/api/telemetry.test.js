/**
 * @jest-environment node
 *
 * POST /api/v1/telemetry — the endpoint that makes @hazardnet/analytics functional.
 *
 * It is the only unauthenticated write surface in the deployment, so what matters here is
 * refusal: a stranger's bytes must not become storage, a log line of unbounded length, or a
 * reflected value. The happy path is one test; the rest cover the shapes that must be
 * rejected, plus the guard (the static scan in serverlessGuard.test.js only proves the call
 * exists, not that it is reached before anything happens).
 */

import { resetGuardsForTests } from '../../backend/middleware/serverlessGuard.js';
import handler, { validateTelemetryBatch, validateEvent } from '../../serverless/v1/telemetry.js';

const makeRes = () => {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: null,
    setHeader(key, value) { headers[key.toLowerCase()] = value; },
    getHeader(key) { return headers[key.toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end(payload) { this.body = payload; return this; },
  };
};

const makeReq = (over = {}) => ({
  method: 'POST',
  headers: { 'x-forwarded-for': '203.0.113.7' },
  socket: {},
  body: {},
  ...over,
});

const goodBatch = () => ({
  sessionId: 's_abc123',
  events: [{ event: 'app_opened', properties: { platform: 'web' }, at: 1_700_000_000_000 }],
});

let logSpy;

beforeEach(() => {
  // The guard is stateful per process; reset so a previous test's counting cannot fail this
  // one. See backend/middleware/serverlessGuard.js.
  resetGuardsForTests();
  // The handler's transport IS the log, so the spy is both the silencer and the assertion
  // target. Held in a variable because `console.log` is on the repo's no-console allowlist
  // only via this spy.
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('validateTelemetryBatch', () => {
  it('accepts a bounded batch and normalises the event name', () => {
    const result = validateTelemetryBatch({ sessionId: 's_1', events: [{ event: 'APP_OPENED', at: 1, properties: {} }] });
    expect(result.ok).toBe(true);
    expect(result.batch.events[0].event).toBe('app_opened');
  });

  it.each([
    ['a missing body', undefined, 'body must be a JSON object'],
    ['an array body', [], 'body must be a JSON object'],
    ['no session id', { sessionId: '', events: [] }, 'sessionId must be a'],
    ['an over-long session id', { sessionId: 'x'.repeat(65), events: [] }, 'sessionId must be a'],
    ['events that are not an array', { sessionId: 's', events: {} }, 'events must be an array'],
    ['an empty batch', { sessionId: 's', events: [] }, 'events must not be empty'],
    ['too many events', { sessionId: 's', events: Array(51).fill({ event: 'a', at: 1 }) }, 'too many events'],
  ])('refuses %s', (_label, payload, expected) => {
    const result = validateTelemetryBatch(payload);
    expect(result.ok).toBe(false);
    expect(result.error).toContain(expected);
  });

  it.each([
    // Case is folded, but a name the vocabulary does not contain is refused rather than
    // silently rewritten — a misnamed event is a bug the caller should see, not something
    // the endpoint quietly fixes into a metric nobody is querying.
    ['an upper-case name from the canonical vocabulary', { event: 'APP_OPENED', at: 1 }, undefined],
    ['a name with spaces', { event: 'Alert Shared', at: 1 }, 'invalid event name'],
    ['a name with a path separator', { event: '../../etc/passwd', at: 1 }, 'invalid event name'],
    ['a name that is not a string', { event: 42, at: 1 }, 'invalid event name'],
    ['a missing timestamp', { event: 'app_opened' }, 'event.at must be a finite number'],
    ['a NaN timestamp', { event: 'app_opened', at: Number.NaN }, 'event.at must be a finite number'],
    ['an object property', { event: 'a', at: 1, properties: { nested: { deep: true } } }, 'must be a string, number, boolean or null'],
    ['an over-long property value', { event: 'a', at: 1, properties: { bio: 'x'.repeat(257) } }, 'exceeds 256 characters'],
    ['too many properties', { event: 'a', at: 1, properties: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 1])) }, 'too many properties'],
  ])('%s', (_label, event, expected) => {
    const result = validateEvent(event);
    if (expected === undefined) expect(typeof result).toBe('object');
    else expect(result).toContain(expected);
  });
});

describe('POST /api/v1/telemetry', () => {
  it('acknowledges a valid batch with 204 and no body', async () => {
    const res = makeRes();
    await handler(makeReq({ body: goodBatch() }), res);
    expect(res.statusCode).toBe(204);
    expect(res.getHeader('cache-control')).toBe('no-store');
  });

  it('emits one bounded log line per event', async () => {
    const res = makeRes();
    await handler(makeReq({ body: goodBatch() }), res);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(logSpy.mock.calls[0][0]);
    expect(line).toMatchObject({ tag: 'analytics', event: 'app_opened', properties: { platform: 'web' } });
  });

  it('refuses anything but POST', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.getHeader('allow')).toBe('POST');
  });

  it('refuses a malformed batch without logging it', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { sessionId: 's', events: [{ event: 'BAD NAME!', at: 1 }] } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('invalid event name');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON', async () => {
    const res = makeRes();
    await handler(makeReq({ body: '{not json' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('valid JSON');
  });

  it('refuses an oversized body', async () => {
    const res = makeRes();
    const huge = JSON.stringify({ sessionId: 's', events: [{ event: 'a', at: 1, properties: { blob: 'x'.repeat(70_000) } }] });
    await handler(makeReq({ body: huge }), res);
    expect(res.statusCode).toBe(413);
  });

  it('applies the rate-limit guard before doing anything else', async () => {
    // 20/min is the `ai` bucket — the tightest in the guard, on purpose: this endpoint is
    // reachable by any anonymous browser.
    const codes = [];
    for (let i = 0; i < 25; i += 1) {
      const res = makeRes();
      await handler(makeReq({ body: goodBatch() }), res);
      codes.push(res.statusCode);
    }
    expect(codes).toContain(429);
    expect(codes.filter((code) => code === 204).length).toBeLessThanOrEqual(20);
  });
});
