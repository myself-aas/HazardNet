import cors from 'cors';

/**
 * CORS allowlist (SEC-04).
 *
 * Origins come from FRONTEND_ORIGIN (comma-separated) plus the local-dev
 * loopbacks. Production fails CLOSED: when NODE_ENV/VERCEL_ENV indicates a
 * production runtime and FRONTEND_ORIGIN is unset, cross-origin browser
 * requests are rejected instead of reflected (the legacy permissive mode
 * only survives for local development, where it preserves the old behavior).
 *
 * Pure helper `isOriginAllowed` is exported for unit tests; `corsMiddleware`
 * is the Express middleware for server.js.
 */

export function isProductionEnv(env = process.env) {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
}

export function allowedOrigins(env = process.env) {
  const configured = (env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    configured,
    // Local-dev loopbacks are always allowed (harmless in production: a
    // browser page can only present these origins when served locally).
    always: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  };
}

export function isOriginAllowed(origin, env = process.env) {
  // No Origin header = same-origin request, curl, or server-to-server.
  if (!origin) return true;
  const { configured, always } = allowedOrigins(env);
  if (always.includes(origin)) return true;
  if (configured.includes(origin)) return true;
  // Legacy permissive mode ONLY outside production (local dev without env).
  if (configured.length === 0 && !isProductionEnv(env)) return true;
  return false;
}

export function corsMiddleware() {
  return cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
  });
}
