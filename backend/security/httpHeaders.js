/**
 * The security headers every response must carry — as data, not as prose.
 *
 * Until 2026-10-26 there was exactly one *served* declaration of these values:
 * `frontend/public/_headers`, which Cloudflare Pages reads from the asset root. That
 * covered static assets and nothing else, because `_headers` does not apply to Pages
 * Function responses — a documented behaviour, and the reason the first API endpoint to
 * move to the edge needed this file rather than a second hand-typed list.
 *
 * The two surfaces now read the same export:
 *
 *   - `frontend/public/_headers` (static assets) — pinned to this list by
 *     `__tests__/securityHeadersParity.test.js`, which parses the file and compares it
 *     value-by-value, so a header edited on one side fails CI instead of drifting.
 *   - `functions/_middleware.ts` (every Function response) — imports `applySecurityHeaders`
 *     and applies it to whatever the route returned.
 *
 * The policy strings themselves live in `./csp.js`, which stays the single source for the
 * CSP. This module adds the five headers around it and the ordering the served file uses.
 *
 * KEEP THIS MODULE PLATFORM-NEUTRAL: no node built-ins, no `process`, no `fs`. It is
 * bundled into a Cloudflare Pages Function, where none of those exist. `Headers` is a
 * Web-standard global, available in the Workers runtime and in Node 18+, so both callers
 * can use it.
 */

import { CSP } from './csp.js';

/**
 * Ordered `[name, value]` pairs. The order is the order `frontend/public/_headers` lists
 * them in, so a reviewer can diff the two side by side without sorting anything.
 *
 * Why each header is here (all four were missing from production on 2026-10-04, which is
 * the audit that created this file's predecessor):
 *
 *   - `Content-Security-Policy` — the only mitigation that survives an injected script;
 *     `frame-ancestors 'none'` also covers clickjacking where `X-Frame-Options` is ignored.
 *   - `Strict-Transport-Security` — HTTPS downgrade. Cloudflare may ignore this on some
 *     plan tiers (it is controlled by SSL/TLS -> HSTS); the value is still declared here
 *     because the file states the policy, and the site-health probe reports what is
 *     actually served.
 *   - `X-Frame-Options: DENY` — kept alongside `frame-ancestors` for older browsers.
 *   - `X-Content-Type-Options: nosniff` — stops a JSON response being sniffed as HTML.
 *     This one matters more on `/api/*` than on an HTML document.
 *   - `Referrer-Policy` — no path or query leakage to third parties. The API accepts a
 *     `horizon` query parameter; the referrer must not carry it anywhere.
 *   - `Permissions-Policy` — denies camera/microphone/payment/USB, allows geolocation for
 *     the map's "near me" affordance only.
 *   - `Cross-Origin-Opener-Policy: same-origin-allow-popups` — keeps the Firebase Auth
 *     popup flow working while isolating the opener.
 */
export const SECURITY_HEADERS = Object.freeze([
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()'],
  ['Cross-Origin-Opener-Policy', 'same-origin-allow-popups'],
  ['Content-Security-Policy', CSP],
]);

/** The list as a plain map, for parity assertions and for anything that cannot use `Headers`. */
export function securityHeaderMap() {
  return Object.fromEntries(SECURITY_HEADERS);
}

/**
 * Apply every header to a `Headers` instance (or anything with the same `set` shape) and
 * return it. `set` rather than `append`: a duplicate CSP is treated by browsers as an
 * intersection of both policies, which silently tightens the site until something breaks
 * in a way nobody can trace back to a doubled header.
 */
export function applySecurityHeaders(target) {
  for (const [name, value] of SECURITY_HEADERS) {
    target.set(name, value);
  }
  return target;
}
