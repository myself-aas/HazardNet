/**
 * RFC 9728 protected-resource metadata, shared by Express and the Pages Function.
 *
 * Publication is not authorization: Firebase token verification, role checks and
 * server-to-server API-key checks remain on their existing endpoints. The owner
 * chose to retain the Firebase issuer; no Cloudflare Access issuer is configured.
 *
 * Keep this module platform-neutral. The extensionless JSON asset in
 * frontend/public/.well-known is the fail-open/static-development fallback and is
 * compared with this document by __tests__/oauthProtectedResource.test.js.
 */

export const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource';
export const PROTECTED_RESOURCE_ORIGIN = 'https://www.hazardnet.live';
export const FIREBASE_AUTH_ISSUER = 'https://securetoken.google.com/hazardnet-aas48424';
export const PROTECTED_RESOURCE_METADATA_URL = `${PROTECTED_RESOURCE_ORIGIN}${PROTECTED_RESOURCE_PATH}`;
export const PROTECTED_RESOURCE_CACHE_CONTROL = 'public, max-age=3600';
export const RESOURCE_METADATA_CHALLENGE = `Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA_URL}"`;

/** The canonical resource identifier has no query or fragment (RFC 9728 §1.2). */
export const PROTECTED_RESOURCE_METADATA = Object.freeze({
  resource: PROTECTED_RESOURCE_ORIGIN,
  authorization_servers: Object.freeze([FIREBASE_AUTH_ISSUER]),
  scopes_supported: Object.freeze([
    'openid', 'email', 'profile',
    'read:forecasts', 'read:alerts', 'read:weather', 'read:historical',
    'read:predictions', 'write:forecasts', 'write:push', 'chat', 'grounding',
  ]),
  bearer_methods_supported: Object.freeze(['header']),
  resource_documentation: `${PROTECTED_RESOURCE_ORIGIN}/docs`,
  resource_policy_uri: `${PROTECTED_RESOURCE_ORIGIN}/terms`,
  resource_tos_uri: `${PROTECTED_RESOURCE_ORIGIN}/terms`,
});

/**
 * A public, unauthenticated GET document. HEAD is supported for HTTP caches;
 * other methods get an explicit 405 rather than an HTML SPA fallback.
 */
export function protectedResourceMetadataResponse(method = 'GET') {
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: {
        Allow: 'GET, HEAD',
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  return new Response(method === 'HEAD' ? null : JSON.stringify(PROTECTED_RESOURCE_METADATA), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': PROTECTED_RESOURCE_CACHE_CONTROL,
      // Discovery metadata is public. Unlike MCP, reading it is not restricted
      // to the website's origin; no cookies or credentials are involved.
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * RFC 9728 §5 discovery hint. Add it to a 401 that has no more specific challenge;
 * never replace an endpoint's authentication scheme or error parameters.
 * `target` is a Web-standard Headers instance (Workers middleware).
 */
export function applyResourceMetadataChallenge(target, status) {
  if (status === 401 && !target.get('WWW-Authenticate')) {
    target.set('WWW-Authenticate', RESOURCE_METADATA_CHALLENGE);
  }
  return target;
}
