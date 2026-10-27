/**
 * @jest-environment node
 *
 * `POST /api/v1/telemetry` on the edge — the analytics beacon's sink (Action 12).
 *
 * This is the only endpoint a stranger can write to without credentials, so the suite is
 * mostly about refusal: the same table `__tests__/api/telemetry.test.js` drives through the
 * Node handler, plus the two things that are new at the edge:
 *
 *   1. **The body is bounded before it is parsed.** `await request.json()` would buffer
 *      whatever arrives; the route reads text, checks 64 KiB, then parses.
 *   2. **The sink is chosen at runtime.** With an `ANALYTICS` binding each event becomes one
 *      `writeDataPoint` (Action 12's free-tier sink); without one, it falls back to the
 *      bounded log line the Node runtime emits. A deployment that has not added the binding
 *      must still answer 204 — silently dropping the beacon would be worse than a log line.
 */

const { validateTelemetryBatch } = require('../backend/utils/telemetryBatch.js');
// Phase 3: the batch is a committed fixture captured from the browser streaming tracker's
// SendBatch shape (provenance header in the fixture file). Expected leaves below come from
// it, so refreshing the fixture cannot silently downgrade these to presence assertions.
const BATCH_FIXTURE = require('./fixtures/telemetryBatch.js');

const URL_BASE = 'https://www.hazardnet.live';

const batch = (over = {}) => ({
  sessionId: BATCH_FIXTURE.sessionId,
  events: BATCH_FIXTURE.events.map((event) => ({ ...event, properties: { ...event.properties } })),
  ...over,
});

const post = (body, init = {}) =>
  new Request(`${URL_BASE}/api/v1/telemetry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });

let writeDataPoint;
let logSpy;
const analytics = () => ({ writeDataPoint });

beforeEach(() => {
  writeDataPoint = jest.fn();
  // The fallback transport *is* the log, so this spy is both the silencer and the assertion
  // target — held in a variable because only `console.warn`/`error`/`info` are on the repo's
  // no-console allowlist (same treatment as `__tests__/api/telemetry.test.js`).
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('POST /api/v1/telemetry — acceptance', () => {
  test('writes one Analytics Engine data point per event and answers 204', async () => {
    const { onRequest } = require('../functions/api/v1/telemetry.ts');
    const response = await onRequest({ request: post(batch()), env: { ANALYTICS: analytics() } });

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(writeDataPoint).toHaveBeenCalledTimes(2);

    const first = writeDataPoint.mock.calls[0][0];
    // blobs: [event, sessionId, properties JSON] · doubles: [at] · indexes: [sessionId]
    expect(first.blobs[0]).toBe(BATCH_FIXTURE.events[0].event);
    expect(first.blobs[1]).toBe(BATCH_FIXTURE.sessionId);
    expect(JSON.parse(first.blobs[2])).toEqual(BATCH_FIXTURE.events[0].properties);
    expect(first.doubles).toEqual([BATCH_FIXTURE.events[0].at]);
    // The index is what a `WHERE index1 = …` query uses, so it must be the session id and
    // must fit Analytics Engine's 96-byte index limit (the validator caps sessions at 64).
    expect(first.indexes).toEqual([BATCH_FIXTURE.sessionId]);
    expect(first.indexes[0].length).toBeLessThanOrEqual(96);
  });

  test('never writes more data points than the per-invocation limit allows', async () => {
    const { onRequest } = require('../functions/api/v1/telemetry.ts');
    const events = Array.from({ length: 50 }, (_, i) => ({
      event: BATCH_FIXTURE.events[0].event, at: BATCH_FIXTURE.events[0].at + i, properties: {},
    }));

    const response = await onRequest({ request: post(batch({ events })), env: { ANALYTICS: analytics() } });

    expect(response.status).toBe(204);
    // The batch cap is 50 and Analytics Engine allows 250 writes per invocation.
    expect(writeDataPoint).toHaveBeenCalledTimes(50);
    expect(writeDataPoint.mock.calls.length).toBeLessThan(250);
  });

  test('falls back to the bounded log line when the binding is absent', async () => {
    const { onRequest } = require('../functions/api/v1/telemetry.ts');
    const response = await onRequest({ request: post(batch()), env: {} });

    expect(response.status).toBe(204);
    expect(writeDataPoint).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(2);

    const line = JSON.parse(logSpy.mock.calls[0][0]);
    // The same shape the Node runtime emits, so a log-based reader keeps working.
    expect(line).toEqual({
      tag: 'analytics',
      sessionId: BATCH_FIXTURE.sessionId,
      event: BATCH_FIXTURE.events[0].event,
      properties: BATCH_FIXTURE.events[0].properties,
      at: BATCH_FIXTURE.events[0].at,
    });
  });

  test('a binding that throws still answers 204 and keeps the event in the log (Phase 6 fail-open)', async () => {
    const { onRequest } = require('../functions/api/v1/telemetry.ts');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { writeDataPoint: jest.fn(() => { throw new Error('quota exceeded'); }) };

    const response = await onRequest({ request: post(batch()), env: { ANALYTICS: broken } });

    // A telemetry sink is not allowed to turn a valid beacon into a 500. The failure is
    // named in the log and the event is kept in the fallback transport.
    expect(response.status).toBe(204);
    expect(broken.writeDataPoint).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ANALYTICS.writeDataPoint failed'), 'quota exceeded');
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(logSpy.mock.calls[0][0]).event).toBe(BATCH_FIXTURE.events[0].event);
  });
});

describe('POST /api/v1/telemetry — refusal', () => {
  test('refuses a body over 64 KiB before parsing it', async () => {
    const { onRequest } = require('../functions/api/v1/telemetry.ts');
    const huge = JSON.stringify({ ...batch(), padding: 'x'.repeat(70 * 1024) });

    const response = await onRequest({ request: post(huge), env: { ANALYTICS: analytics() } });

    expect(response.status).toBe(413);
    expect((await response.json()).error).toBe('payload too large');
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  test('refuses malformed JSON with 400, not a crash', async () => {
    const { onRequest } = require('../functions/api/v1/telemetry.ts');
    const response = await onRequest({ request: post('{"sessionId":'), env: {} });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('body must be valid JSON');
  });

  test('refuses every payload the Node runtime refuses, with the same message', async () => {
    const cases = [
      [],
      { events: [] },
      { sessionId: '', events: [{ event: 'x', at: 1, properties: {} }] },
      { sessionId: 'a'.repeat(65), events: [{ event: 'x', at: 1, properties: {} }] },
      { sessionId: 's', events: [] },
      { sessionId: 's', events: [{ event: 'Bad Name', at: 1, properties: {} }] },
      { sessionId: 's', events: [{ event: 'ok', at: 'now', properties: {} }] },
      { sessionId: 's', events: [{ event: 'ok', at: 1, properties: { nested: { a: 1 } } }] },
      { sessionId: 's', events: [{ event: 'ok', at: 1, properties: { big: 'x'.repeat(257) } }] },
    ];

    const { onRequest } = require('../functions/api/v1/telemetry.ts');
    for (const payload of cases) {
      const expected = validateTelemetryBatch(payload);
      expect(expected.ok).toBe(false);

      const response = await onRequest({ request: post(payload), env: {} });
      expect({ payload, status: response.status }).toEqual({ payload, status: 400 });
      expect((await response.json()).error).toBe(expected.error);
    }
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  test('a non-POST method is a 405 that names what is allowed', async () => {
    const { onRequest } = require('../functions/api/v1/telemetry.ts');
    const response = await onRequest({
      request: new Request(`${URL_BASE}/api/v1/telemetry`, { method: 'GET' }),
      env: {},
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });
});

describe('the edge sink and the Node sink agree', () => {
  test('both runtimes emit the same log line for the same batch', async () => {
    // Node handler, through its own `res` double.
    const nodeHandler = require('../serverless/v1/telemetry.js').default;
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(name, value) {
        this.headers[name.toLowerCase()] = value;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      end() {
        return this;
      },
      json(payload) {
        this.payload = payload;
        return this;
      },
    };
    await nodeHandler({ method: 'POST', body: batch() }, res);
    expect(res.statusCode).toBe(204);

    const nodeLines = logSpy.mock.calls.map((call) => JSON.parse(call[0]));

    // Edge handler with no binding: the same fallback transport.
    logSpy.mockClear();
    const { onRequest } = require('../functions/api/v1/telemetry.ts');
    await onRequest({ request: post(batch()), env: {} });
    const edgeLines = logSpy.mock.calls.map((call) => JSON.parse(call[0]));

    expect(edgeLines).toEqual(nodeLines);
  });
});
