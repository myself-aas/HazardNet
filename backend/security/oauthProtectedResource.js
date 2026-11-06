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

/**
 * Both hostnames serve the site (they CNAME to the same Pages project), and an agent may
 * fetch metadata from either. RFC 9728 §3.2 requires the returned `resource` to match the
 * identifier the client used, so the document is host-aware rather than hardcoded to the
 * canonical host.
 *
 * This is not academic: the 2026-11-05 isitagentready.com scan of `https://hazardnet.live`
 * fetched this path, got 200 with valid JSON, and still concluded "No OAuth Protected
 * Resource Metadata found" because the audit step reported
 * `JSON missing or invalid "resource" field, or resource mismatch` — the document named
 * `https://www.hazardnet.live` while the scan target was the apex.
 *
 * The allowlist is closed: an arbitrary Host header must not be able to make this endpoint
 * mint a resource identifier for an attacker's origin. Anything unrecognised (including
 * localhost and preview hosts) falls back to the canonical origin.
 */
export const PROTECTED_RESOURCE_HOSTS = Object.freeze(['hazardnet.live', 'www.hazardnet.live']);

/** The origin to advertise for a request URL. Unknown hosts get the canonical origin. */
export function resourceOriginFor(requestUrl) {
  let host;
  try {
    host = new URL(String(requestUrl)).host.toLowerCase();
  } catch {
    return PROTECTED_RESOURCE_ORIGIN;
  }
  // Ignore the port: the resource identifier is the HTTPS origin, and a dev server's
  // port is not part of the published identity.
  const hostname = host.split(':')[0];
  return PROTECTED_RESOURCE_HOSTS.includes(hostname)
    ? `https://${hostname}`
    : PROTECTED_RESOURCE_ORIGIN;
}

/**
 * The metadata document for one resource origin. The resource identifier has no query or
 * fragment (RFC 9728 §1.2). Documentation/policy/TOS stay on the canonical host: they are
 * the same published pages, and pointing them at the apex would duplicate every URL.
 */
export function protectedResourceMetadataFor(origin = PROTECTED_RESOURCE_ORIGIN) {
  return Object.freeze({
    resource: origin,
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
}

/** The canonical document. The extensionless static fallback is byte-parity with this. */
export const PROTECTED_RESOURCE_METADATA = protectedResourceMetadataFor();

/**
 * A public, unauthenticated GET document. HEAD is supported for HTTP caches;
 * other methods get an explicit 405 rather than an HTML SPA fallback.
 */
export function protectedResourceMetadataResponse(method = 'GET', requestUrl) {
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

  const metadata = protectedResourceMetadataFor(resourceOriginFor(requestUrl));
  return new Response(method === 'HEAD' ? null : JSON.stringify(metadata), {
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
export function applyResourceMetadataChallenge(target, status, requestUrl) {
  if (status === 401 && !target.get('WWW-Authenticate')) {
    const origin = resourceOriginFor(requestUrl);
    target.set('WWW-Authenticate', resourceMetadataChallengeFor(origin));
  }
  return target;
}

/** The challenge for one origin, so a 401 on the apex points at the apex's own metadata. */
export function resourceMetadataChallengeFor(origin = PROTECTED_RESOURCE_ORIGIN) {
  return `Bearer resource_metadata="${origin}${PROTECTED_RESOURCE_PATH}"`;
}
