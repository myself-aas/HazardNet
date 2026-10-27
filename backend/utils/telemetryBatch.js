/**
 * Telemetry batch validation — the rules for what an anonymous browser may post to
 * `POST /api/v1/telemetry`, in one place for both runtimes.
 *
 * This is the only unauthenticated write surface in the deployment, so the rules are the
 * security boundary and not a formatting nicety: bounded sizes, a lowercased snake_case
 * event vocabulary, flat scalar properties, and no reflection of caller input back out.
 *
 * It lived inside `serverless/v1/telemetry.js` until 2026-10-26. The Cloudflare Pages
 * Function that now serves the endpoint cannot import that file (it imports the Node
 * rate-limit middleware), and a second copy of a *validation* rule is how the two runtimes
 * start accepting different payloads. So the rules moved here, dependency-free, and both
 * handlers import them. `__tests__/api/telemetry.test.js` (Node) and
 * `__tests__/pagesTelemetry.test.js` (edge) drive the same table through this module.
 *
 * KEEP THIS MODULE PLATFORM-NEUTRAL: no node built-ins, no `process`.
 */

const SESSION_ID_MAX = 64;
const EVENT_NAME_MAX = 64;
/** Also the per-invocation cap for Analytics Engine writes (its limit is 250). */
export const EVENTS_PER_BATCH_MAX = 50;
const PROPERTIES_PER_EVENT_MAX = 20;
const PROPERTY_VALUE_MAX = 256;
/**
 * Phase 6 (Action 12): the Analytics Engine binding serialises `properties` into one blob.
 * Its hard limit is 16 KB of blobs **per data point**, shared with the event name (≤64) and
 * the session id (≤64). Bound the serialised object here, in the shared validator, so the
 * Node runtime refuses exactly the same payload as the edge instead of diverging on a rule
 * only one sink needs. 8 KiB leaves >7 KiB of headroom for the other two blobs and for JSON
 * escaping, and is far above any real event (the fixture's properties are <100 bytes).
 */
export const PROPERTIES_JSON_MAX = 8_192;
/** A beacon page at this size is already pathological; enforce it before parsing. */
export const BODY_MAX_BYTES = 65_536; // 64 KiB

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
  // Also catches an unbounded *key*: 20 keys of 10 KB each would otherwise blow the
  // Analytics Engine 16 KB blob limit despite every individual value being ≤256 chars.
  if (JSON.stringify(properties).length > PROPERTIES_JSON_MAX) {
    return `event.properties is too large (max ${PROPERTIES_JSON_MAX} characters of JSON)`;
  }
  return { event: name, at: event.at, properties };
}

/**
 * @typedef {object} TelemetryBatch
 * @property {string} sessionId
 * @property {Array<{event: string, at: number, properties: Record<string, unknown>}>} events
 *
 * @param {unknown} payload
 * @returns {{ ok: true, batch: TelemetryBatch } | { ok: false, error: string }}
 *
 * Returns the normalised batch, or the reason it was refused.
 */
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
