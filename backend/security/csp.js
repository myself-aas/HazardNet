/**
 * The Content-Security-Policy, in one place (Phase 6, SEC-10).
 *
 * The policy was authored three times — the deployed `vercel.json`, the frontend
 * `vercel.json`, and helmet in `backend/server.js` — and they drifted: one config got the
 * AdSense allowlist, the other did not, and the live host served no CSP at all. A policy
 * that exists in three slightly different editions is a policy nobody can reason about,
 * so the string below is the single source and the others are checked against it:
 *
 *   - `vercel.json` + `frontend/vercel.json` carry exactly this value (asserted by
 *     `__tests__/securityHeadersParity.test.js`, which reads the canonical export).
 *   - `backend/server.js` runs helmet over `cspDirectivesFromString(CSP)`, so the
 *     self-hosted Docker deployment cannot disagree with the deployed one.
 *
 * Design decisions worth keeping:
 *   - `script-src` lists the ad-network origins explicitly and allows no wildcard,
 *     no `data:` and no `'unsafe-eval'`. Ads are the one third-party script surface on
 *     the site (blog units); everything else is same-origin.
 *   - `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`,
 *     `form-action 'self'`: the four directives that contain the classic injection
 *     escalations (plugin payloads, clickjacking, `<base>` rewriting, exfiltration by
 *     form post).
 *   - `style-src` keeps `'unsafe-inline'`: Tailwind ships a stylesheet, but the map and
 *     chart layers set inline styles for geometry, and a nonce would need a server render
 *     pass this static build does not have. Recorded here rather than left as folklore.
 */

/** Ad-network script origins — the only third-party scripts the app loads. */
export const AD_SCRIPT_ORIGINS = Object.freeze([
  'https://pagead2.googlesyndication.com',
  'https://partner.googleadservices.com',
  'https://tpc.googlesyndication.com',
  'https://www.googletagservices.com',
  'https://adservice.google.com',
]);

/** Firebase / Google Auth origins required for sign-in with Google/GitHub. */
export const AUTH_SCRIPT_ORIGINS = Object.freeze([
  'https://www.gstatic.com',
  'https://apis.google.com',
  'https://www.googletagmanager.com',
  'https://www.google.com',
]);

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

/**
 * CDN origins serving the FrontDoor hero's background clips.
 *
 * `media-src 'self' blob:` was correct while the hero played the bundled
 * `public/hero-section/*.mp4` loops, and it silently became wrong the moment the hero
 * started drawing from the remote catalogue in `frontend/src/lib/heroVideoPlaylist.ts`:
 * every candidate was blocked by policy, the player walked its whole failover order, and
 * the hero fell back to the poster. Nothing surfaced it — the blocked requests look
 * exactly like a dead CDN, which is the one thing the failover chain is built to absorb.
 *
 * These are the only two CDN hosts the playable catalogue uses. Mixkit is absent on
 * purpose: its entry is excluded from rotation (hotlink-denied, personal-use-only
 * licence), and an allowlist entry for a source we never load is just surface area.
 *
 * `__tests__/heroVideoCspParity.test.js` asserts this list covers every playable source's
 * origin, so adding a clip from a new host fails in CI instead of in the hero.
 */
export const HERO_MEDIA_ORIGINS = Object.freeze(['https://cdn.pixabay.com', 'https://videos.pexels.com']);

export const CSP = [
  "default-src 'self'",
  `script-src 'self' ${[...AUTH_SCRIPT_ORIGINS, ...AD_SCRIPT_ORIGINS].join(' ')}`,
  "style-src 'self' 'unsafe-inline' https://www.gstatic.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https: wss: ${AUTH_CONNECT_ORIGINS.join(' ')}`,
  `frame-src 'self' https: ${AUTH_FRAME_ORIGINS.join(' ')}`,
  "worker-src 'self' blob:",
  `media-src 'self' blob: ${HERO_MEDIA_ORIGINS.join(' ')}`,
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
