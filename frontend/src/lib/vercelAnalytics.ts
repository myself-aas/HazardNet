/**
 * Vercel Web Analytics deployment gate — the 2026-09-13 E2E regression.
 *
 * `@vercel/analytics` does not ship a loader with the bundle. When
 * `<Analytics />` mounts it injects a **classic** `<script>` whose `src` is
 * `/_vercel/insights/script.js`, and `/_vercel/*` is a Vercel system route:
 * the edge answers it (with the real loader) only for projects that have Web
 * Analytics enabled. The package's own `onerror` handler covers the "script
 * never arrived" case, but it cannot cover the case that actually bites:
 * the request *succeeds* with the SPA shell.
 *
 * On every non-Vercel host — CI's `vite preview` (sirv `single: true`),
 * Firebase Hosting (`"rewrites": [{ "source": "**" }]` in firebase.json),
 * the sandbox preview, a plain static host — an unmatched path is answered
 * with `index.html` and `Content-Type: text/html`. A classic script parses
 * whatever comes back as JavaScript, so the app shell throws before the tag's
 * `onerror` can even fire:
 *
 *   SyntaxError: Unexpected token '<'
 *
 * Playwright surfaces that as `page.on('pageerror')` once per page load, which
 * failed `Performance › no JavaScript errors on critical pages`
 * (e2e/critical-paths.spec.ts) with three identical errors — one for each
 * visited route — on `chromium-desktop` and `chromium-mobile`. The error text
 * is the tell: parsing HTML as a script yields exactly `Unexpected token '<'`,
 * while `JSON.parse` of the same body reports the longer
 * `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
 *
 * `@vercel/analytics` also has no way to disable itself at runtime, and
 * `vercel.json` only governs Vercel. The gate therefore has to be decided when
 * the bundle is built, where the deployment target is known:
 *
 *   - `vercel build` (and Vercel's own build image, including the Git
 *     integration preview/production deploys and custom domains such as
 *     hazardnet.live) sets `VERCEL=1` → loader enabled.
 *   - Anything else (CI, local builds, Firebase) → loader left out, so no
 *     non-Vercel visitor ever gets the page error.
 *
 * Override with `VITE_VERCEL_ANALYTICS=true|false` when the guess is wrong,
 * e.g. `VITE_VERCEL_ANALYTICS=true vite dev` to exercise the loader against
 * Vercel's debug script during development. The flag is injected by the
 * `define` block in frontend/vite.config.ts as a boolean literal.
 */
export const vercelAnalyticsEnabled: boolean = import.meta.env.VITE_VERCEL_ANALYTICS === true;
