/**
 * The Content-Security-Policy, in one place (Phase 6, SEC-10).
 *
 * The policy was authored three times — the deployed `vercel.json`, the frontend
 * `vercel.json`, and helmet in `backend/server.js` — and they drifted: one config got the
 * AdSense allowlist, the other did not, and the live host served no CSP at all. A policy
 * that exists in three slightly different editions is a policy nobody can reason about,
 * so the string below is the single source and the others are checked against it:
 *
 *   - `vercel.json`, `frontend/vercel.json` and `firebase.json` carry exactly this value
 *     (asserted by `__tests__/securityHeadersParity.test.js`, which reads the canonical
 *     export). `firebase.json` is the one that actually answers `www.hazardnet.live`: the
 *     deployment moved to Firebase Hosting, and it is the surface that silently drifted
 *     on 2026-10-04. Edit all three JSON copies with this file, or the suite fails.
 *   - `backend/server.js` runs helmet over `cspDirectivesFromString(CSP)`, so the
 *     self-hosted Docker deployment cannot disagree with the deployed one.
 *
 * Design decisions worth keeping:
 *   - `script-src` is same-origin plus one hash plus the four Google origins Firebase Auth
 *     and Google sign-in need, and Cloudflare's analytics beacon host. There is no
 *     ad-network allowlist: the site carries no advertising (2026-09-30), and an allowlist
 *     that outlives the thing it allowed is how the three editions drifted in the first
 *     place. No wildcard, no `data:`, no `'unsafe-eval'`, and — deliberately — no
 *     `'unsafe-inline'` for scripts: the single inline script is allowed by hash instead.
 *   - `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`,
 *     `form-action 'self'`: the four directives that contain the classic injection
 *     escalations (plugin payloads, clickjacking, `<base>` rewriting, exfiltration by
 *     form post).
 *   - `style-src` keeps `'unsafe-inline'`: Tailwind ships a stylesheet, but the map and
 *     chart layers set inline styles for geometry, and a nonce would need a server render
 *     pass this static build does not have. Recorded here rather than left as folklore.
 *     (162 `style={{…}}` and 69 `style="…"` sites in frontend/src depend on it — removing
 *     it is a separate piece of work, not a one-line tightening.)
 */

/** Firebase / Google Auth origins required for sign-in with Google/GitHub. */
export const AUTH_SCRIPT_ORIGINS = Object.freeze([
  'https://www.gstatic.com',
  'https://apis.google.com',
  'https://www.googletagmanager.com',
  'https://www.google.com',
]);

/**
 * Cloudflare Web Analytics. The site is served through Cloudflare, which injects
 * `beacon.min.js` into the HTML at the edge — it is not in the repository and cannot be
 * removed from here. Without this origin every page load logged a blocked-script console
 * error (Lighthouse against www.hazardnet.live, 2026-10-10: 2 console errors, Best
 * Practices 92). This is an analytics host the deployment already opts into by sitting
 * behind Cloudflare, not the ad-network allowlist the note above rules out.
 */
export const ANALYTICS_SCRIPT_ORIGINS = Object.freeze([
  'https://static.cloudflareinsights.com',
]);

/**
 * SHA-256 of the inline theme-boot `<script>` in `frontend/index.html`, in the
 * `'sha256-<base64>'` form CSP expects.
 *
 * That script reads the stored theme and sets `document.documentElement.dataset.theme`
 * before first paint. Its own comment says it "must stay inline and un-deferred" — an
 * external or deferred copy would run after the browser had already painted the wrong
 * theme, which is the exact flash it exists to prevent. But `script-src` carries no
 * `'unsafe-inline'`, so with no hash and no nonce the browser blocked it outright: the
 * dark/light flash prevention was dead in production while looking correct in source.
 *
 * The hash is over the **verbatim text node between the tags**, including the leading
 * newline and indentation — 661 bytes as of 2026-10-10. Normalising or trimming that
 * whitespace produces a different digest (`sha256-+JFfarySf0LLYKHMQltj/A12A/gSo28sBIG4YyZH4YE=`,
 * 653 bytes) which no browser will accept, so any edit to the script — even reindenting
 * it — silently invalidates this constant.
 * `__tests__/securityHeadersParity.test.js` recomputes it from the HTML rather than
 * trusting the literal, so that drift fails CI instead of shipping.
 */
export const INLINE_THEME_SCRIPT_HASH =
  "'sha256-QZKLQT1GBKDcqB1F1KXYUlwpbx51AmTDaGZhplnAaFU='";

export const AUTH_CONNECT_ORIGINS = Object.freeze([
  'https://*.googleapis.com',
  'https://*.firebaseio.com',
  'https://*.firebaseapp.com',
  'https://*.google.com',
  'https://*.gstatic.com',
  'https://*.github.com',
  'https://api.github.com',
  'https://github.com',
]);

export const AUTH_FRAME_ORIGINS = Object.freeze([
  'https://*.firebaseapp.com',
  'https://accounts.google.com',
  'https://github.com',
  'https://*.github.com',
]);

export const AUTH_FORM_ACTION_ORIGINS = Object.freeze([
  'https://*.firebaseapp.com',
  'https://accounts.google.com',
  'https://github.com',
  'https://*.github.com',
]);

export const CSP = [
  "default-src 'self'",
  `script-src 'self' ${INLINE_THEME_SCRIPT_HASH} ${[
    ...AUTH_SCRIPT_ORIGINS,
    ...ANALYTICS_SCRIPT_ORIGINS,
  ].join(' ')}`,
  "style-src 'self' 'unsafe-inline' https://www.gstatic.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https: wss: ${AUTH_CONNECT_ORIGINS.join(' ')}`,
  `frame-src 'self' https: ${AUTH_FRAME_ORIGINS.join(' ')}`,
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  `form-action 'self' ${AUTH_FORM_ACTION_ORIGINS.join(' ')}`,
  'upgrade-insecure-requests',
].join('; ');

/**
 * Parse the canonical policy into helmet's directive shape.
 *
 * helmet wants camelCase directive keys and an array of sources; a flag directive
 * (`upgrade-insecure-requests`) becomes an empty array. Parsing rather than re-typing is
 * the point: a hand-written second copy is exactly how the two drifted apart before.
 */
export function cspDirectivesFromString(policy = CSP) {
  const directives = {};
  for (const raw of policy.split(';')) {
    const part = raw.trim();
    if (!part) continue;
    const [name, ...sources] = part.split(/\s+/);
    const key = name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    directives[key] = sources;
  }
  return directives;
}
