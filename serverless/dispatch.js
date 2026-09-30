/**
 * Shared router for the Vercel entry points under `api/`.
 *
 * Why this exists: on the Hobby plan a deployment may carry **at most 12 Serverless
 * Functions**, and every file under `api/` is one function. This repository serves 18
 * public URLs, so a file per URL does not fit. The `api/` tree therefore holds one
 * entry point per URL *family* — `api/[endpoint].js`, `api/v1/[resource].js`, … — and
 * each entry point dispatches to the per-endpoint handlers that live here, in
 * `serverless/`, a directory Vercel never scans for functions (only `api/` is).
 * The arithmetic, and the CI gate that keeps it true, are in
 * `docs/codebase/VERCEL_FUNCTIONS.md` and `scripts/check-vercel-functions.mjs`.
 *
 * Routing contract (verified against the Vercel CLI's local build/dev emulation):
 *
 *   - `api/v1/alerts/[action].js` matches `/api/v1/alerts/policy`, and Vercel passes
 *     the matched segment through as `?action=policy` *appended to the original query
 *     string* while leaving the path in `req.url` untouched
 *     (`/api/v1/alerts/policy?action=policy`).
 *   - Static siblings win over a dynamic segment: `/api/v1/alerts` still reaches
 *     `serverless/v1/alerts/index.js` through its own file, and `/api/v1/weather/batch`
 *     still reaches the static `api/v1/weather/batch.js`.
 *   - Only one segment is matched; a deeper path is not a route.
 *
 * The path is the source of truth for the segment (the query parameter is the
 * fallback, for a direct invocation such as a unit test), and both are stripped from
 * the request before the handler runs, so a handler can never mistake a routing
 * artefact for a user-supplied `?action=` — it sees exactly the request it would have
 * seen as its own function file. That stripping mutates the request in place, which is
 * safe here because Vercel hands every invocation its own request object; a caller that
 * reuses one object across invocations (a test harness) must rebuild it per call.
 *
 * Answers for paths that match no handler: a JSON 404 (the edge's HTML 404 would
 * otherwise be the only API response that is not JSON), metered with the `read`
 * bucket — an unrouted path still costs a function invocation, so it is not left
 * unmetered (SEC-07).
 *
 * Handlers are loaded per request (`() => import('…')` in the entry point's table), not
 * once for the whole family. Two reasons, both earned:
 *
 *   - **Fault isolation.** A module-level throw in one handler's import graph (a missing
 *     credential, a file read that assumed the repository checkout) would otherwise make
 *     every URL in the family fail, including the ones that never touch that dependency.
 *   - **Cold start.** A lambda that serves five endpoints should not pay for the union of
 *     five import graphs to answer one request.
 *
 * The specifiers stay literal, so the platform's bundler can still trace and include them.
 */

import { guardRequest } from '../backend/middleware/serverlessGuard.js';
import { logger } from '../utils/logger.js';

/** The path of the request as the edge saw it, without the query string. */
function pathname(req) {
  const url = typeof req.url === 'string' ? req.url : '';
  const query = url.indexOf('?');
  const path = query === -1 ? url : url.slice(0, query);
  try {
    return decodeURIComponent(path);
  } catch {
    // A malformed escape cannot name a route; compare it undecoded.
    return path;
  }
}

/**
 * The matched segment of the request, from the last path segment — the position every
 * entry point's `[param]` occupies. Falls back to the query parameter Vercel appends
 * when the path does not name a route (a direct handler invocation in a test).
 */
export function routeSegment(req, param, table) {
  const path = pathname(req).replace(/\/+$/, '');
  const fromPath = path.slice(path.lastIndexOf('/') + 1);
  if (table.has(fromPath)) return fromPath;

  const raw = req.query ? req.query[param] : undefined;
  const candidate = Array.isArray(raw) ? raw[raw.length - 1] : raw;
  return typeof candidate === 'string' ? candidate : fromPath;
}

/**
 * Remove the routing parameter from `req.query` and `req.url`. Only the named key is
 * touched, and the remaining query string is kept byte-for-byte, so a handler sees the
 * request it would have seen coming through its own function file.
 */
export function stripRouteParam(req, param) {
  if (req.query && typeof req.query === 'object' && param in req.query) {
    delete req.query[param];
  }
  if (typeof req.url !== 'string') return;
  const query = req.url.indexOf('?');
  if (query === -1) return;

  const kept = req.url
    .slice(query + 1)
    .split('&')
    .filter((part) => {
      const key = part.split('=')[0];
      try {
        return decodeURIComponent(key) !== param;
      } catch {
        return true;
      }
    });

  req.url = kept.length > 0 ? `${req.url.slice(0, query)}?${kept.join('&')}` : req.url.slice(0, query);
}

/**
 * Build the `(req, res)` handler a Vercel entry point exports.
 *
 * @param {object}   spec
 * @param {string}   spec.param   name of the dynamic segment in the entry file
 *                                (`[endpoint]` → `'endpoint'`), used for the fallback.
 * @param {Object<string, () => Promise<object>>} spec.routes
 *                                segment → loader for the handler module. The loader must
 *                                use a literal specifier so the bundler can trace it.
 * @param {string}   spec.entry   the entry file, for the 404 body.
 * @returns {Function} the handler, with the served segments attached as `.routes`.
 */
export function createDispatcher({ param, routes, entry }) {
  const table = new Map(Object.entries(routes));

  const handler = async function handleRequest(req, res) {
    const segment = routeSegment(req, param, table);
    stripRouteParam(req, param);
    const load = table.get(segment);

    if (!load) {
      if (guardRequest(req, res, { bucket: 'read' })) return;
      // The echoed segment is capped: a 404 must stay small whatever the caller sent.
      res.status(404).json({
        error:
          `no endpoint "${String(segment).slice(0, 60)}" at ${entry}; ` +
          'see docs/codebase/VERCEL_FUNCTIONS.md for the served surface',
      });
      return;
    }

    try {
      // The loader may reject (a module that throws while initialising) or the handler may
      // throw; both are answered here rather than by the platform's error page.
      const module = await load();
      const route = typeof module === 'function' ? module : module.default;
      await route(req, res);
    } catch (error) {
      // The per-endpoint handlers translate their own expected failures; reaching here
      // means an unexpected one, which must still be answered as JSON rather than as an
      // unhandled platform error page.
      logger.error(`[serverless:${entry}] ${segment} failed:`, error && error.message ? error.message : error);
      if (res.headersSent) {
        if (typeof res.end === 'function') res.end();
        return;
      }
      if (!res.getHeader || !res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
      res.status(500).json({ error: 'internal server error' });
    }
  };

  // Every served segment, so a test can assert the public surface without a request.
  handler.routes = Object.freeze([...table.keys()]);
  return handler;
}

export default createDispatcher;
