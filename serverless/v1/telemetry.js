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
import { BODY_MAX_BYTES, validateTelemetryBatch } from '../../backend/utils/telemetryBatch.js';

/* The rules themselves live in backend/utils/telemetryBatch.js since 2026-10-26, so the
   Cloudflare Pages Function that serves this endpoint accepts exactly the same payloads
   instead of a re-typed copy. Re-exported here because __tests__/api/telemetry.test.js
   imports them from this file, and because that is where a reader looks first. */
export { validateEvent, validateTelemetryBatch } from '../../backend/utils/telemetryBatch.js';
export { BODY_MAX_BYTES };

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
