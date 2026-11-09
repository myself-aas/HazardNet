/**
 * The edge API's one response module.
 *
 * Before 2026-11-09 every Pages Function under `functions/api/**` carried its own
 * `function json(body, status, extraHeaders)` — eleven near-identical copies — plus its
 * own security-header literals and its own cache policy strings. They were not
 * identical in the ways that matter:
 *
 *   · ten set `x-content-type-options: nosniff`; one (`functions/api/v1/forecasts/metadata.ts`)
 *     did not;
 *   · the 5xx rule was re-implemented per route (`{ error: 'Internal server error' }` in
 *     some, `{ error: 'forecast snapshot is unavailable', detail }` in another — the second
 *     leaking the asset error to an anonymous caller, which is exactly what
 *     `backend/utils/clientError.js` exists to prevent on the Node side);
 *   · cache policy was a string literal at each call site, so "this endpoint is
 *     per-response and must not be cached" was a comment in four files and a different
 *     literal in the fifth.
 *
 * The interface here is deliberately small — that is the whole point: a route file should
 * state the answer, not restate the transport.
 *
 *   respond(body, { status, cache })   → a Response
 *   respondError(error, { scope, status, fallback })
 *                                      → a Response whose body is safe for a stranger
 *
 * Everything a caller must know:
 *
 *   · **`cache` is a name, not a duration.** `CACHE.noStore` / `CACHE.revalidate` /
 *     `CACHE.publicFor(seconds)`. A route that says `CACHE.noStore` is stating a fact about
 *     its payload (this body carries a per-response timestamp), not tuning a knob.
 *   · **5xx bodies are generic.** The real error is logged with the route's `scope`; the
 *     caller gets `fallback`. This mirrors `backend/utils/clientError.js` line for line, so
 *     the same failure reads the same on the edge and on Express.
 *   · **Security headers are already applied.** `functions/_middleware.ts` applies
 *     `backend/security/httpHeaders.js` to every Function response, so this module does not
 *     carry a second copy of that policy. It only adds `nosniff` to the JSON responses it
 *     builds, because a JSON body that is sniffed as HTML is an injection vector and costs
 *     one header.
 *
 * Dependency category: in-process. No I/O, no env, no bindings — a `Response` and a string.
 */

import { logServerError } from '../utils/clientError.js';

/** Cache policies the API actually uses, named for the reason they exist. */
export const CACHE = Object.freeze({
  /** The body carries a per-response `generated_at`; a cached copy would state a wrong time. */
  noStore: 'no-store, max-age=0',
  /** A deployed artifact that only changes when a new build ships. */
  revalidate: 'public, max-age=0, must-revalidate',
  /** Upstream-keyed data (weather) that is worth a shared cache for the stated window. */
  publicFor: (seconds) => `public, max-age=${Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0}`,
});

/**
 * @typedef {object} RespondOptions
 * @property {number} [status]
 * @property {string} [cache] one of `CACHE.*`; defaults to `no-store` because a wrong cache
 *   is worse than a slow response
 * @property {Record<string, string>} [headers] extra headers for this response only
 *   (e.g. `retry-after`)
 */

/**
 * The JSON response every edge route answers with.
 *
 * @param {unknown} body
 * @param {RespondOptions} [options]
 * @returns {Response}
 */
export function respond(body, { status = 200, cache = CACHE.noStore, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache,
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });
}

/**
 * @typedef {object} RespondErrorOptions
 * @property {string} scope where to log; the tag style the Node runtimes use
 *   (`api/v1/forecasts/bulk`)
 * @property {number} [status] 4xx messages are already written for the caller
 * @property {string} [fallback] the 5xx message a stranger may see
 * @property {Record<string, unknown>} [body] validation failures pass their own body; 5xx never does
 * @property {Record<string, string>} [headers]
 */

/**
 * The error response. 4xx says what was wrong; 5xx says nothing and logs everything.
 *
 * The split is the same rule as `backend/utils/clientError.js`: a status we chose means we
 * wrote the message, so the message is safe; a status the world chose (a store timeout, a
 * missing asset, a driver error) carries hostnames, paths and query fragments and must not
 * reach the caller.
 */
/**
 * @param {unknown} error
 * @param {RespondErrorOptions} options
 * @returns {Response}
 */
export function respondError(
  error,
  { scope, status = 500, fallback = 'Internal server error', body, headers }
) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (status >= 500) {
    // `logServerError` is the Node runtimes' own logger, so an edge 5xx and an Express 5xx
    // land in the same shape of log line and the same alerting query finds both.
    logServerError(scope, error instanceof Error ? error : new Error(message));
    return respond({ error: fallback }, { status, headers });
  }
  return respond(body ?? { error: message || fallback }, { status, headers });
}

/**
 * The shape of a Pages `EventContext`, as far as these routes use it.
 *
 * This module is JavaScript because the Node runtimes (Express, the `serverless/` handlers,
 * Jest under babel-jest) resolve a `.js` import and cannot resolve a `.ts` one without a
 * bundler. The type is asserted where TS consumers need it: each route file declares
 * `type PagesContext = BasePagesContext<ItsEnv>` and the compiler checks every use.
 *
 * @typedef {object} PagesContextShape
 * @property {Request} request
 * @property {unknown} env
 * @property {Record<string, string | string[]>} [params]
 */

/**
 * TypeScript view of the same interface, for the route files that declare their env shape.
 *
 * `assess`/`tsc` reads this declaration; the JavaScript above is what actually runs. Keeping
 * them in one module is what stops the two from disagreeing about what a response is.
 *
 * @typedef {object} PagesContext
 * @property {Request} request
 * @property {unknown} env
 * @property {Record<string, string | string[]>} [params]
 */

/**
 * @template E
 * @typedef {object} PagesContextOf
 * @property {Request} request
 * @property {E} env
 * @property {Record<string, string | string[]>} [params]
 */
