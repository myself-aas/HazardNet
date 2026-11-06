/**
 * Pages Functions middleware — the security headers for everything that is not a static
 * asset.
 *
 * `frontend/public/_headers` covers static assets and **not** Function responses; that is
 * documented Cloudflare behaviour, and it is the one thing that would have quietly made the
 * API a hole in the site's header policy. Rather than type the seven headers again here,
 * this imports `backend/security/httpHeaders.js` — the same export the parity test compares
 * against `_headers` — so the two surfaces cannot disagree.
 *
 * It runs for routes matched by `frontend/public/_routes.json`: documents, `/api/*`,
 * `/mcp` and the RFC 9728 metadata endpoint. Static asset directories are excluded there, so images, fonts and data
 * files stay on the unmetered static path. Function responses need this middleware
 * because `_headers` does not apply to them.
 */

import { applySecurityHeaders } from '../backend/security/httpHeaders.js';
import { applyResourceMetadataChallenge } from '../backend/security/oauthProtectedResource.js';

/** The subset of the Pages `EventContext` middleware uses. */
interface PagesContext {
  request: Request;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  env: Record<string, unknown>;
}

/**
 * Statuses whose responses must not carry a body. Constructing `new Response(body, {status})`
 * with one throws, and `Response` rejects a non-null body for these — so the body is dropped
 * deliberately rather than by accident. `/api/v1/telemetry` answers 204, so this is not
 * hypothetical.
 */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

export async function onRequest(context: PagesContext): Promise<Response> {
  const response = await context.next();
  const headers = new Headers(response.headers);

  // `applySecurityHeaders` uses `set`, so a header the route already set is replaced with
  // the canonical value — one policy, not an intersection of two.
  applySecurityHeaders(headers);
  // RFC 9728 §5: a discovery hint on an otherwise unchallenged 401. This does
  // not authenticate the request or turn a public endpoint into a protected one.
  applyResourceMetadataChallenge(headers, response.status, context.request.url);

  const body = NULL_BODY_STATUSES.has(response.status) ? null : response.body;

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
