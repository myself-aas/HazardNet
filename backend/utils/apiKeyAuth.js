import crypto from 'node:crypto';

/**
 * API-key verification (SEC-06).
 *
 * - Comparison is constant-time (timingSafeEqual) to avoid timing side channels.
 * - Fail-closed: when BACKEND_API_KEY is not configured the endpoint returns
 *   503 instead of silently allowing unauthenticated writes. api/ingest.js
 *   already behaved this way, so production must set the key regardless.
 */
export function verifyApiKey(req) {
  const requiredKey = process.env.BACKEND_API_KEY;
  if (!requiredKey) {
    return { ok: false, status: 503, error: 'Service authentication is not configured (BACKEND_API_KEY missing)' };
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return { ok: false, status: 401, error: 'Unauthorized: Missing API key' };
  }

  const a = Buffer.from(token);
  const b = Buffer.from(requiredKey);
  // Timing-safe compare; equal length is a precondition for timingSafeEqual.
  const equal = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!equal) {
    return { ok: false, status: 401, error: 'Unauthorized: Invalid API key' };
  }
  return { ok: true };
}

/** Express middleware wrapper around verifyApiKey for backend routes. */
export function requireApiKey(req, res, next) {
  const result = verifyApiKey(req);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  return next();
}
