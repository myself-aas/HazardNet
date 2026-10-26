/**
 * POST /api/v1/telemetry — the transport for @hazardnet/analytics.
 *
 * The only unauthenticated write surface in the deployment, so the whole file is
 * refusal-shaped: a stranger's bytes must not become storage, a log line of unbounded
 * length, or a reflected value. Events are validated, case-folded to the canonical
 * lowercase vocabulary shape, and written as one bounded JSON log line each — stdout is
 * the storage (the platform's log drain is the sink); nothing is persisted from this
 * process memory. Deployed through api/v1/[resource].js; the 12-function budget and the
 * dispatch contract live in serverless/dispatch.js and
 * docs/codebase/ARCHITECTURE.md#the-node-function-surface-api.
 */

import { guardRequest } from '../../backend/middleware/serverlessGuard.js';

const SESSION_ID_MAX = 64;
const EVENT_NAME_MAX = 64;
const EVENTS_PER_BATCH_MAX = 50;
const PROPERTIES_PER_EVENT_MAX = 20;
const PROPERTY_VALUE_MAX = 256;
const BODY_MAX_BYTES = 65_536; // 64 KiB — a beacon page at this size is already pathological

/**
 * Event names are lowercase snake_case after folding. Membership in ANALYTICS_EVENTS is
 * deliberately NOT checked: the canonical vocabulary lives in packages/core's
 * analytics.ts and grows with the apps, while this endpoint must stay deployable
 * without a shared-package import. Shape is the gate — anything with whitespace,
 * separators or non-stringness is a bug the caller should see, not something we repair.
 */
const EVENT_NAME_SHAPE = /^[a-z0-9_]+$/;

/** Returns the normalised event object, or a string describing why it was refused. */
export function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return 'event must be a JSON object';
  }
  if (typeof event.event !== 'string' || event.event.length === 0 || event.event.length > EVENT_NAME_MAX) {
    return 'invalid event name';
  }
  const name = event.event.toLowerCase();
  if (!EVENT_NAME_SHAPE.test(name)) {
    return 'invalid event name';
  }
  if (typeof event.at !== 'number' || !Number.isFinite(event.at)) {
    return 'event.at must be a finite number';
  }
  const properties = event.properties ?? {};
  if (typeof properties !== 'object' || Array.isArray(properties) || properties === null) {
    return 'event.properties must be a JSON object';
  }
  const entries = Object.entries(properties);
  if (entries.length > PROPERTIES_PER_EVENT_MAX) {
    return `too many properties (max ${PROPERTIES_PER_EVENT_MAX})`;
  }
  for (const [key, value] of entries) {
    if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) {
      return `property "${key}" must be a string, number, boolean or null`;
    }
    if (typeof value === 'string' && value.length > PROPERTY_VALUE_MAX) {
      return `property "${key}" exceeds ${PROPERTY_VALUE_MAX} characters`;
    }
  }
  return { event: name, at: event.at, properties };
}

/** Returns { ok: true, batch } with normalised events, or { ok: false, error }. */
export function validateTelemetryBatch(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'body must be a JSON object' };
  }
  const { sessionId, events } = payload;
  if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > SESSION_ID_MAX) {
    return { ok: false, error: `sessionId must be a non-empty string of at most ${SESSION_ID_MAX} characters` };
  }
  if (!Array.isArray(events)) {
    return { ok: false, error: 'events must be an array' };
  }
  if (events.length === 0) {
    return { ok: false, error: 'events must not be empty' };
  }
  if (events.length > EVENTS_PER_BATCH_MAX) {
    return { ok: false, error: `too many events (max ${EVENTS_PER_BATCH_MAX})` };
  }
  const batch = [];
  for (const event of events) {
    const validated = validateEvent(event);
    if (typeof validated === 'string') {
      return { ok: false, error: validated };
    }
    batch.push(validated);
  }
  return { ok: true, batch: { sessionId, events: batch } };
}

export default async function handler(req, res) {
  // The tightest bucket, first: this endpoint is reachable by any anonymous browser.
  if (guardRequest(req, res, { bucket: 'ai' })) {
    return;
  }

  res.setHeader('cache-control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  // A function host gives us a parsed body for application/json; the streaming beacon sends
  // text/plain keepalive flushes, which arrive as a raw string. Both are bounded and
  // parsed here; anything else (or anything over the cap) is refused before a byte
  // of it is logged.
  let payload = req.body;
  if (typeof payload === 'string') {
    if (payload.length > BODY_MAX_BYTES) {
      return res.status(413).json({ error: 'payload too large' });
    }
    try {
      payload = JSON.parse(payload);
    } catch {
      return res.status(400).json({ error: 'body must be valid JSON' });
    }
  } else if (payload && typeof payload === 'object') {
    if (JSON.stringify(payload).length > BODY_MAX_BYTES) {
      return res.status(413).json({ error: 'payload too large' });
    }
  }

  const result = validateTelemetryBatch(payload);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }

  // The transport IS the log line; __tests__/api/telemetry.test.js spies on console.log
  // to assert this is the only side effect a valid batch produces.
  for (const event of result.batch.events) {
    console.log(JSON.stringify({
      tag: 'analytics',
      sessionId: result.batch.sessionId,
      event: event.event,
      properties: event.properties,
      at: event.at,
    }));
  }

  return res.status(204).end();
}
