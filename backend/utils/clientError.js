/**
 * Client-safe error responses (SEC-13).
 *
 * The 2026-09-17 live audit found raw error strings reaching API clients
 * (`{ error: err.message }`, `{ detail: dbErr.message }`) across the Vercel
 * functions and several Express routes. Those messages carry internal
 * hostnames, driver text, file paths and occasionally query fragments — an
 * information-disclosure finding with no upside for the caller.
 *
 * Policy:
 *   · 4xx — the status was set by our own validation code, so the message is
 *     already written for the caller and is returned as-is.
 *   · 5xx — always a generic message; the real error is logged server-side.
 *
 * Usage:
 *   import { clientError } from '../utils/clientError.js';
 *   clientError(res, err, { scope: 'api/v1/forecasts/bulk', fallback: '…' });
 */

/** Logs with the scope tag so the full detail survives in the server logs. */
export function logServerError(scope, err) {
  const detail = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(`[${scope}] ${detail}`);
}

export function clientError(res, err, options = {}) {
  const {
    scope = 'hazardnet',
    fallback = 'Internal server error',
    status,
    message,
  } = options;

  const statusCode = Number.isInteger(status)
    ? status
    : Number.isInteger(err?.status)
      ? err.status
      : 500;

  if (statusCode >= 500) {
    logServerError(scope, err);
    return res.status(statusCode).json({ error: fallback, ...(message ? { message } : {}) });
  }

  return res.status(statusCode).json({ error: err?.message || fallback });
}

export default clientError;
