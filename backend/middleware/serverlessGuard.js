/**
 * Shared guard for the Vercel serverless handlers (Phase 6, SEC-07).
 *
 * Why this exists: the Express limiters in `backend/middleware/rateLimit.js` only run
 * when the Express server does. Production is deployed as Vercel functions (`api/**`),
 * where those middlewares never execute — so every public endpoint was unmetered. This
 * module is the one place the serverless surface gets its rate limit and its response
 * headers, and `__tests__/api/serverlessGuard.test.js` fails if an `api/**` handler is
 * added without calling it.
 *
 * Honest scope of the guarantee:
 *
 *   - Vercel runs many short-lived instances, each with its own memory, so this is a
 *     **per-instance** limit. It stops a single client hammering one instance and it
 *     makes trivial scraping/cost attacks far more expensive, but it is not a global
 *     quota: an attacker who spreads requests across instances gets `limit × instances`.
 *     A hard guarantee needs a shared counter (Upstash/Redis) — recorded as an owner
 *     action in `docs/ops/owner-actions.md` rather than pretended away here.
 *   - The limiter is deliberately dependency-free. A serverless cold start should not
 *     pay for a Redis client it cannot reach.
 *
 * What is *not* a heuristic: the client key. Behind Vercel, `x-forwarded-for` is set by
 * the platform and the first entry is the real client; the headers are not
 * attacker-controlled on this deployment (the functions are only reachable through the
 * edge). When the header is absent (local dev, tests) the socket address is used.
 */

import { verifyApiKey } from '../utils/apiKeyAuth.js';

const DEFAULT_WINDOW_MS = 60_000;

/**
 * Buckets by cost, not by route. The numbers mirror the Express limiters so the two
 * runtimes cannot disagree about what "too much" means:
 *   - `read`     120/min — cheap JSON reads (alerts list, forecasts, weather)
 *   - `alerts`    60/min — alert reads and evidence cards
 *   - `ai`        20/min — anything that can spend an AI provider budget
 *   - `pipeline`  12/min unauthenticated, ×10 (120/min) when the request carries the
 *     correct `BACKEND_API_KEY` — see `keyedMultiplier` below
 *   - `metrics`   60/min — Prometheus scrapes
 */
export const BUCKETS = Object.freeze({
  read: { limit: 120, windowMs: DEFAULT_WINDOW_MS },
  alerts: { limit: 60, windowMs: DEFAULT_WINDOW_MS },
  ai: { limit: 20, windowMs: DEFAULT_WINDOW_MS },
  pipeline: { limit: 12, windowMs: DEFAULT_WINDOW_MS },
  metrics: { limit: 60, windowMs: DEFAULT_WINDOW_MS },
});

/**
 * A request that presents the correct pipeline key is already authorised by a secret; the
 * limiter's job there is to bound a runaway loop, not to ration an admitted client. A
 * chunked backfill (or a retry storm) would otherwise start failing mid-run on a limit
 * meant for anonymous probing — so the pipeline bucket is 12/min for an unauthenticated
 * caller and 10× that once the key checks out. An unset `BACKEND_API_KEY` means "no
 * privileged path" (the same fail-closed rule as `backend/utils/apiKeyAuth.js`), so it
 * never earns the larger budget.
 */
export const KEYED_MULTIPLIER = 10;

/** Hard cap on tracked keys per instance: an unbounded Map is its own DoS vector. */
const MAX_TRACKED_KEYS = 5_000;

/** key → { count, resetAt } */
const hits = new Map();

export function rateLimitDisabled(env = process.env) {
  return env.HAZARDNET_DISABLE_SERVERLESS_RATELIMIT === '1';
}

/** Best-effort client identity. The first XFF entry is the client as seen by the edge. */
export function clientKey(req) {
  const headers = (req && req.headers) || {};
  const forwarded = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first;
  }
  const realIp = headers['x-real-ip'] || headers['X-Real-Ip'];
  if (realIp) return String(realIp).trim();
  const socket = req && (req.socket || req.connection);
  if (socket && socket.remoteAddress) return String(socket.remoteAddress);
  // No identity at all (a bare unit test object): treat as one bucket rather than
  // exempting the request — an unknown caller must not get an unlimited allowance.
  return 'unknown';
}

/**
 * Pure decision function, so the window arithmetic is testable without an HTTP server.
 * `entry` is the stored state for a key (or undefined); returns the next state and
 * whether the request may proceed.
 */
export function rateLimitDecision(entry, { limit, windowMs }, now = Date.now()) {
  if (!entry || now >= entry.resetAt) {
    return { allowed: true, state: { count: 1, resetAt: now + windowMs }, remaining: limit - 1 };
  }
  const count = entry.count + 1;
  if (count > limit) {
    return { allowed: false, state: entry, remaining: 0 };
  }
  return { allowed: true, state: { count, resetAt: entry.resetAt }, remaining: limit - count };
}

/**
 * Apply the guard to a serverless handler request.
 *
 * @returns {boolean} true when the request has been answered (429) and the handler must
 *                    return immediately; false when the handler should proceed.
 */
export function guardRequest(req, res, { bucket = 'read', env = process.env, now = Date.now() } = {}) {
  const base = BUCKETS[bucket] || BUCKETS.read;
  const keyed = bucket === 'pipeline' && verifyApiKey({ headers: (req && req.headers) || {} }).ok === true;
  const limits = keyed ? { limit: base.limit * KEYED_MULTIPLIER, windowMs: base.windowMs } : base;

  // Headers first: even a rejected response must not be sniffable or cached.
  if (typeof res.setHeader === 'function') {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!res.getHeader || !res.getHeader('Cache-Control')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }

  if (rateLimitDisabled(env)) return false;

  const key = `${bucket}:${clientKey(req)}`;
  const existing = hits.get(key);
  const { allowed, state, remaining } = rateLimitDecision(existing, limits, now);

  if (hits.size >= MAX_TRACKED_KEYS && !existing) hits.clear();
  hits.set(key, state);

  const resetSeconds = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
  if (typeof res.setHeader === 'function') {
    res.setHeader('RateLimit-Limit', String(limits.limit));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));
  }

  if (!allowed) {
    if (typeof res.setHeader === 'function') {
      res.setHeader('Retry-After', String(resetSeconds));
      res.setHeader('Cache-Control', 'no-store');
    }
    if (typeof res.status === 'function') {
      res.status(429).json({
        error: 'Too many requests. Slow down and retry shortly; hazard data is cached while you wait.',
        bucket,
        retry_after_seconds: resetSeconds,
      });
    } else {
      res.statusCode = 429;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Too many requests', bucket }));
    }
    return true;
  }

  return false;
}

/** Test hook: the per-instance store is module state. */
export function resetGuardsForTests() {
  hits.clear();
}
