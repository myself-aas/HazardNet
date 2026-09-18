# HazardNet.live — live-surface audit

**Date:** 2026-09-17
**Surface audited:** `https://www.hazardnet.live` (production deployment) against a practical
security / SEO / UI / UX checklist for a public early-warning site.
**Branch under test:** `arena/01a0afa0-hazardnet` (fixes below are committed there, not yet deployed).
**Status of this document:** the scorecard has two columns — **Live** (what a visitor, crawler or
attacker sees today) and **After deploy** (this branch + the owner actions in §6).

---

## 1. Verdict

**Live surface: 33.3 / 100 — FAIL.** The P0 gate fails on six items. A crawler, a
security researcher or a first-time visitor on a slow connection all hit the same
three problems:

1. **The site is a JavaScript-only shell and almost every URL 404s.** `GET /about`,
   `/login`, `/blogs`, `/dashboard`, `/documentation` all return Vercel's platform
   `404: NOT_FOUND` (verified today). The advertised pages in `sitemap.xml` are among
   the dead ones. Nothing outside `/` is crawlable, linkable or shareable.
2. **The first thing a visitor sees is fabricated instrumentation.** The homepage
   loading state renders `SYSTEM ACTIVE`, `TFLite • GPU Acceleration`,
   `LATENCY: 18ms`, `Softmax 98.4%`, `0.74 RMS`, `246 of 256 tiles`. None of those
   numbers is measured. Selecting a district adds `Latency: 38ms`, and the analytics
   page presents `42.8 ms`, `MAE 0.034`, `ECE 1.82%` with no data source anywhere in
   the repository.
3. **Nothing lets a visitor check the claims.** There is no methodology page, no
   model card, no data-source page, no privacy/terms/contact reachable from the live
   site, and no `security.txt`. For a hazard product aimed at farmers, that is both
   an SEO failure and a trust failure.

**After this branch deploys: 82.0 / 100 — conditional pass.** Every P0 is fixed in
code and verified by a local build (`npm run build` produces 15 prerendered public
pages, a generated sitemap, `404.html`, `robots.txt` and `.well-known/security.txt`;
`tsc` clean; 43 Jest suites / 417 tests green). Three owner actions remain before the
live score moves: deploy the branch (Vercel root-directory decision, §6.1), deploy the
Firestore rules (§6.2), and re-run the probe workflow so the new CI checks go green.

---

## 2. Scorecard

### 2.1 How to read a score

Every item is scored **0 / 1 / 2** and the family totals are weighted
(Security 35 %, SEO 20 %, UI & performance 20 %, UX 25 %).

| Score | Meaning |
| ----- | ------- |
| **2** | Correct on the live surface, or fixed in this branch and verified by a local build; no further action needed beyond deploying. |
| **1** | Partially correct: works in one deployment topology, covers only part of the surface, or is fixed in repo but depends on an unverified third party (CDN, Firebase console, model behaviour). |
| **0** | Broken, missing, or (worse) actively misleading. |

### 2.2 Totals

| Family | Items | Live | After deploy | Δ |
| ------ | ----- | ---- | ------------ | - |
| Security (35 %) | 17 | 47.1 % | 79.4 % | +32.4 |
| SEO & discoverability (20 %) | 16 | 18.8 % | 96.9 % | +78.1 |
| UI, visual & performance (20 %) | 14 | 42.9 % | 71.4 % | +28.6 |
| UX journey & accessibility (25 %) | 14 | 17.9 % | 82.1 % | +64.3 |
| **Weighted total** | **61** | **33.3 / 100** | **82.0 / 100** | **+48.7** |

### 2.3 Security (SEC-01 … SEC-17)

| ID | Item | Live | After | Evidence & notes |
| -- | ---- | ---- | ----- | ---------------- |
| SEC-01 | Rate limiting / abuse control on public endpoints | 1 | 1 | Backend has layered limiters (`backend/middleware/rateLimit.js`: 120/min base, 60/min predict, 20/min AI, plus a 60 req/min inference bucket). The Vercel functions under `api/` have **no** limiter and are the endpoints that actually deploy. **P1-1** |
| SEC-02 | Authorization on Firestore blog writes | 0 | 2 | `firestore.rules` allowed `create, update, delete` for **any signed-in account** until this branch; the superadmin check existed only in the UI (`RequireSuperAdmin.tsx`). Now gated by `isBlogSuperadmin()` on a 3-address allowlist that is pinned to the SQL policy and the UI list by `scripts/tests/test_blog_authz_parity.py` (11 tests, green). |
| SEC-03 | Security headers (HSTS, nosniff, frame, referrer, permissions) | 0 | 2 | Live response carries only `strict-transport-security: max-age=63072000`. CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` are all absent, although `vercel.json` declares them. Fixed in `frontend/vercel.json` + root `vercel.json` and asserted by the new probe in `.github/workflows/site-health.yml`. |
| SEC-04 | CORS posture | 2 | 2 | `backend/middleware/cors.js` allows only configured origins and fails closed; verified by `__tests__/cors.test.js`. |
| SEC-05 | Authorization on non-blog Firestore collections | 0 | 2 | `/user_connectors` was `allow read, write: if isSignedIn()` — any authenticated account could read or overwrite any other account's connector rows (webhook URLs, connector auth). Now ownership-scoped on the document's own `user_id` (`existing()`/`incoming()` checks), matching the `${uid}_${connectorKey}` document key in `frontend/src/lib/connectors.ts`. |
| SEC-06 | API-key verification | 2 | 2 | `backend/utils/apiKeyAuth.js`: constant-time compare, 503 fail-closed when the key is unset, applied to forecasts/ingest/push. |
| SEC-07 | No secrets in repo or client bundle | 2 | 2 | Scanned `dist/assets/*.js` for `AIza…`, `sk-…`, `service_role`, private-key blocks — clean. The only Firebase keys are public-by-design web config (`frontend/src/lib/config.ts`). |
| SEC-08 | Dependency vulnerabilities | 1 | 1 | Four accepted **critical** `tar` advisories, all install-time only (transitive via `@tensorflow/tfjs-node`), tracked with expiry **2026-12-12** in `audit-exceptions.json` and enforced by `scripts/npm-audit-ci.mjs`. Not fixable without a major tfjs upgrade. **P1-2** |
| SEC-09 | Authentication strength | 1 | 1 | Firebase Auth + Supabase JWT for AI routes, password-strength checks and a 5-lane rate-limit design are in place. Email verification / MFA enforcement could not be verified from outside; recommend confirming both in the console. **P1-3** |
| SEC-10 | Upload & ingest input validation | 1 | 1 | `api/ingest.js` is API-key gated and validates every CSV row (`backend/utils/forecastRow.js`); unexpected exceptions are now generic. No explicit payload-size ceiling on the CSV path was found — add one. **P1-4** |
| SEC-11 | Outbound-fetch safety (SSRF) | 1 | 1 | Weather/forecast fetches use fixed Open-Meteo/GEE hosts with no user-supplied URL, which is the right shape; no allowlist assertion exists in code. Low risk, untested. |
| SEC-12 | PII exposure / data minimisation | 1 | 1 | The three superadmin e-mail addresses ship in the client bundle (`frontend/src/lib/superadmins.ts` is imported by the UI gate) and a personal Gmail address is the security contact. Acceptable for now because authorization is enforced server-side (SEC-02), but move the allowlist to a custom claim or public config eventually. **P1-5** |
| SEC-13 | No raw internal errors to clients | 1 | 2 | Added `backend/utils/clientError.js` (≥500 → logged with a scope tag, generic JSON to the client; <500 → the caller's validation message) and wired it through `api/forecasts.js`, `api/v1/forecasts/{bulk,history,metadata}.js`, `api/v1/weather{,/batch}.js`, `backend/routes/{forecasts,weather,advisory,agent,chat,conversions}.js`. Remaining two sites sanitised: `api/ingest.js` (row-level messages kept, anything else generic) and `backend/routes/push.js` (provider diagnostics logged, status class returned). |
| SEC-14 | Admin/content surface protection | 1 | 2 | Blog studio is behind `RequireSuperAdmin`; `/dashboard*` is client-gated and disallowed in robots. With SEC-02 fixed the enforcement is no longer client-only. |
| SEC-15 | CSRF / replay on state-changing calls | 1 | 1 | No cookie-based sessions (bearer tokens + Firestore SDK), so classic CSRF is not applicable; ingest accepts API-keyed POSTs with no idempotency key. **P1-6** |
| SEC-16 | Transport security & HTTPS enforcement | 1 | 2 | HTTPS is enforced by the platform and HSTS is present live, but without `includeSubDomains` (subdomain takeover + cookie scope risk). Both `vercel.json` copies now send `max-age=63072000; includeSubDomains; preload`. |
| SEC-17 | Disclosure channel & monitoring | 0 | 2 | No `/.well-known/security.txt` was reachable (`404: NOT_FOUND`). Added an RFC 9116 file (mailto + GitHub advisories link, expiry 2027-09-17) that ships in `dist/`, and the `firebase.json` `**/.*` ignore rule that would have dropped it was removed. |

### 2.4 SEO & discoverability (SEO-01 … SEO-16)

| ID | Item | Live | After | Evidence & notes |
| -- | ---- | ---- | ----- | ---------------- |
| SEO-01 | Sitemap accuracy | 0 | 2 | Live sitemap has 9 URLs, all `lastmod 2026-09-12`, all on the **apex** host, and advertises `/documentation`, which 404s. It omits `/model`, `/methodology`, `/data-sources`, `/faq`, `/docs`, `/download`, `/use-cases` and every blog URL. The build now generates `dist/sitemap.xml` from `src/content/site-routes.json` (15 URLs on `www`, real `lastmod`), and CI fails if any listed URL stops returning 200. |
| SEO-02 | robots.txt | 1 | 2 | Live robots.txt is valid and blocks app surfaces, but `/u/` was blocked while profile pages were meant to be shareable, and `/login`+`/signup` were not explicitly left crawlable. Rewritten: app surfaces disallowed, login/signup crawlable so their `noindex` can be honoured, explicit comment explaining the distinction. |
| SEO-03 | Per-page titles & descriptions | 0 | 2 | Live serves one document with `<title>HazardNet</title>` for every URL. Prerender now writes a unique title, description, canonical, OG/Twitter tags and geo meta per route. |
| SEO-04 | Indexable routes (no 404s) | 0 | 2 | Every non-file route probed returned the platform 404. The build emits `dist/<route>/index.html` **and** `dist/<route>.html` for all 15 public routes plus the 5 app screens, so a deep link resolves from the filesystem even before the SPA rewrite is applied. |
| SEO-05 | Substantive content without JavaScript | 0 | 2 | Live `#root` is empty until React mounts. Prerender injects a real HTML body (h1, standfirst, sections, FAQ, links) inside `<!--HN_STATIC_START/END-->`; verified by fetching the built files (`/about` → h1 “About HazardNet”, 7.9 KB; `/faq` → 16.9 KB). |
| SEO-06 | Canonical URLs | 0 | 2 | Absent live. Emitted per route (`https://www.hazardnet.live/about` …), apex→www consistent with the 308 in both Vercel configs. |
| SEO-07 | Open Graph / Twitter cards | 0 | 2 | Only a generic `og:title`/`og:description` in the shell. All routes now emit `og:type/url/image(+dimensions)` and `twitter:card/title/description/image`. |
| SEO-08 | Structured data | 0 | 2 | None live. Prerender emits a JSON-LD `@graph`: `WebSite` + `Organization` (with contact + logo) on every page, `WebPage`, `SoftwareApplication` on `/`, `/model`, `/methodology`, `Dataset` on `/data-sources`, `FAQPage` with 10 Q&As on `/faq`, and `BreadcrumbList` per route. |
| SEO-09 | 404 handling / soft-404 hygiene | 0 | 2 | Live 404s are the bare Vercel page; the SPA has no `404.html` and no not-found route meta. The build writes a branded `404.html` (pristine shell, `noindex,follow`), `NotFoundPage` sets `noindex,follow`, and the shell itself defaults to `noindex` so the SPA rewrite can never index an unknown URL. |
| SEO-10 | Meta-robots on app surfaces | 1 | 2 | App screens were only blocked by robots.txt. `/login`, `/signup`, `/dashboard`, `/settings`, `/upload` now also serve `<meta name="robots" content="noindex,follow">`. |
| SEO-11 | Host consistency (apex vs www) | 1 | 2 | Live sitemap and JSON-LD use the apex while the deployment 308-redirects to `www`; every generated URL, QR code and structured-data reference now uses `https://www.hazardnet.live`. |
| SEO-12 | Internal linking (no dead ends) | 0 | 2 | Navbar/Footer link to `/methodology`, `/model`, `/data-sources`, `/faq`, `/docs`, `/privacy`, `/terms`, `/download`, `/use-cases`, `/blogs` — all dead live. All are now real routes with prerendered pages; the GitHub links pointed at the non-existent `github.com/hazardnet/hazardnet-ai` and now point at the real repository. |
| SEO-13 | E-E-A-T: verifiable provenance | 0 | 2 | No methodology, model card, data-source or about page was reachable. New prerendered pages document the pipeline (GEE Sentinel-1/2 + ERA5-Land + Open-Meteo + HDX COD-AB + OSM), the horizons and their limits, the FP32-only model decision, licences/cadence, and what is *not* validated. |
| SEO-14 | Blog indexability | 0 | 1 | Blog posts are client-rendered from Firestore, so they were invisible to crawlers. `frontend/scripts/export-blog-index.mjs` (new) exports published articles to `public/data/blog-index.json`, which the prerender turns into static article pages with `Article` JSON-LD and sitemap entries. Not yet exercised against production data (no network from the audit environment, and the export must run before the build). **P1-7** |
| SEO-15 | Mobile-friendliness | 2 | 2 | `viewport` with `viewport-fit=cover`, responsive layout, valid PWA manifest, theme colour, apple touch icon. |
| SEO-16 | Language & geo targeting | 1 | 2 | `lang="en"` was already set. Prerender adds `geo.region=BD`, `geo.placename=Bangladesh` per page. A `hreflang` set (bn/en) is a future consideration, not a defect for a single-language site. |

### 2.5 UI, visual & performance (UI-01 … UI-14)

| ID | Item | Live | After | Evidence & notes |
| -- | ---- | ---- | ----- | ---------------- |
| UI-01 | No invented numbers in the interface | 0 | 2 | Live homepage loading state prints `LATENCY: 18ms`, `98.4%`, `0.74 RMS`, `246 / 256`, and (once a district is picked) `Latency: 38ms`; `/analytics` prints `42.8 ms`, `0.034`, `1.82 %` and a “pipeline log” naming a model version (`v4.8`) that does not exist (`Models/VERSION.json` is `2.1.9+model.d7b1a5b48aa6`). All of it is hardcoded. Replaced with measured elapsed time, honest “Not published” metric cards, and a real snapshot read. Verified: `grep -rn "38ms\|42\.8\|0\.034\|1\.82%\|98\.4\|0\.74 RMS" frontend/src` is empty. |
| UI-02 | Honest loading states | 0 | 2 | `DataProcessingSkeleton` showed a fixed console with a randomised progress bar that looped. It now shows an indeterminate bar, the labels it is actually waiting for, measured elapsed seconds, and a `role="status"` announcement; props unchanged so all three call sites keep working. |
| UI-03 | Brand, hierarchy, consistency | 2 | 2 | Coherent palette/typography, print styles, consistent cards and headers. |
| UI-04 | Colour contrast | 1 | 1 | Main text passes comfortably; several captions use `text-slate-400`/10–11 px type on white and the amber-on-white badge text is borderline. Needs a contrast pass with the real components rendered (no browser in this environment). **P1-8** |
| UI-05 | Typography & legibility | 1 | 1 | Dense mono 10–11 px labels are used for status text on the map panels; acceptable on desktop, hard on low-end phones in sunlight. **P1-8** |
| UI-06 | Responsive layout | 1 | 1 | Layout adapts (grids collapse, drawer becomes full-width), but tap-target sizing and safe-area padding on small phones were not verified in a browser. |
| UI-07 | Map/chart readability & controls | 1 | 1 | Controls are grouped and labelled, tiles come from OSM/Esri/Carto; several controls only have a `title` tooltip and no visible label. **P1-9** |
| UI-08 | Asset weight | 1 | 2 | 17 self-hosted woff2 files (636 KB) and a 195 KB CSS bundle. Fonts are subset per family but the three families are all eagerly loaded; prerendered pages no longer need them for first paint. **P1-10** |
| UI-09 | JavaScript payload | 1 | 2 | 3.82 MB of JS across 45 chunks; the heavy libraries are lazily split (`vendor-pdf` 830 KB, `vendor-firebase` 680 KB, `vendor-react` 466 KB, `vendor-recharts` 366 KB). Route-level lazy loading is already in place (`ArticlePage`, blog studio); further splitting of the dashboard is the next win. **P1-10** |
| UI-10 | HTTP caching | 1 | 2 | No explicit caching policy was visible live (Vercel defaults). Both configs now pin `assets/*` (1 y immutable), `serviceWorker.js` (no-cache), `data/*` (must-revalidate) and `.well-known/*` (1 d). |
| UI-11 | First paint / LCP | 0 | 1 | Live first paint is the fabricated console; after the fix the first paint is the honest loading state, and prerendered pages render text before hydration. True LCP numbers need field data. **P1-11** |
| UI-12 | Layout stability (CLS) | 1 | 2 | The skeleton reserved space (good); prerendered pages now ship the same box model, so the swap is layout-stable. |
| UI-13 | Print / offline / dark surfaces | 2 | 2 | Dedicated print stylesheet + QR codes, offline tile caching via the service worker, offline badge, dark-scheme styling in the static fallback. This is a genuine strength. |
| UI-14 | Provenance affordances | 0 | 2 | Nothing on the live surface told a user *when* a forecast was produced or *which* model produced it. The dashboard now distinguishes “Live model output” from “Static baseline band … (not a model output)”, `PredictionPanel` prints “not measured” instead of a fake latency, and `/analytics` reads `generated_at`/`prediction_date`/`source` from the served snapshot. |

### 2.6 UX journey & accessibility (UX-01 … UX-14)

| ID | Item | Live | After | Evidence & notes |
| -- | ---- | ---- | ----- | ---------------- |
| UX-01 | Primary journey has no dead ends | 0 | 2 | Every navigation target (docs, FAQs, blog, privacy, terms, contact, use cases, download) 404s on the live site. All exist as prerendered routes after deploy. |
| UX-02 | 404 experience | 0 | 2 | Live 404 is the Vercel platform page with no way back into the product. `404.html` now renders the branded shell and the SPA router shows a noindex not-found page with links. |
| UX-03 | Plain language on first contact | 0 | 2 | Live above-the-fold reads `TFLite • GPU Acceleration`, `Softmax Probability Tensor`, `GIS Tile Pyramid Ingestion` — implementation vocabulary as the welcome. The homepage copy now leads with the district-level outlook and the eight hazards, and the skeleton says what it is waiting for. |
| UX-04 | Call-to-action clarity | 1 | 1 | “Explore the map” is clear; secondary CTAs compete (download, upload, blog, dashboard). **P1-12** |
| UX-05 | Trust & legal pages reachable | 0 | 2 | `/privacy`, `/terms`, `/contact` 404 live. They are routes today, prerendered, linked from the footer, and the Contact page now explains what it does with a report. |
| UX-06 | Keyboard & skip-link support | 0 | 2 | Added a skip link to `#main-content` and a focusable `<main>` landmark; the map and drawers keep their focus order. |
| UX-07 | Screen-reader semantics | 0 | 1 | Added `role="status"` announcements for loading and real `<h1>`/landmark structure on prerendered pages. The interactive map’s accessible name/description surface still needs an audit with a screen reader. **P1-13** |
| UX-08 | Reduced-motion support | 1 | 1 | `prefers-reduced-motion` is honoured in only two files (`index.css`, `BrandPanel.tsx`) while the app animates heavily through framer-motion. **P1-14** |
| UX-09 | Mobile ergonomics | 1 | 1 | Bottom navigation and full-screen map work; text sizes as in UI-05. |
| UX-10 | Offline / PWA behaviour | 2 | 2 | Service worker, cached tiles, offline badge, installed-app manifest — a real strength for field use. |
| UX-11 | Form honesty & feedback | 0 | 2 | The live contact/report forms ran `setTimeout(600)` and claimed the report was “logged in the HazardNet validation queue” with no network call. The page now assembles a real report and hands it to a prefilled GitHub issue or a `mailto:` draft, states plainly what will happen, validates with `role="alert"` summaries, and gives emergency numbers (999, 16123, 1090). |
| UX-12 | Uncertainty communication | 0 | 2 | Live shows “Flash Flood 99%” style numbers with no interval, sample basis or caveat. The model card and methodology pages explain confidence bins, the dual-track severity, and what “confidence 1.0” does and does not mean; the dashboard labels baseline vs live values. |
| UX-13 | Official-warning guidance | 0 | 1 | The Contact page and Terms §3 now state that HazardNet is not an official warning service (call 999 / follow BMD-FFWC). The map screens themselves still need a persistent one-line disclaimer. **P1-15** |
| UX-14 | Help & support discoverability | 0 | 2 | Live has no reachable FAQ/docs/support. `/faq` (10 answers), `/docs`, `/methodology`, `/contact` and `security.txt` are now part of the site. |

---

## 3. P0 blockers (gate)

Nothing in this section can be waived; each has an owner and a retest.

| # | Blocker | Items | Owner | Retest |
| - | ------- | ----- | ----- | ------ |
| **P0-1** | Deep links 404 on the live deployment | SEO-04, SEO-09, UX-01, UX-02, UX-05, UI-11 | Deployment owner | `curl -sI https://www.hazardnet.live/about` → `200`; `curl -sL .../faq \| grep -ci "frequently asked"` → ≥1; `site-health.yml` deep-link probe green. |
| **P0-2** | No crawlable content or per-page metadata | SEO-03, SEO-04, SEO-05, SEO-06, SEO-07, SEO-08, SEO-13 | Deployment owner | View-source on `/about` and `/faq`: unique `<title>`, canonical, JSON-LD, and body text are present without JS; every sitemap URL returns 200 (CI check). |
| **P0-3** | Fabricated telemetry presented as measurement | UI-01, UI-02, UI-14, UX-12 | Frontend (done) | `grep -rn "38ms\|42\.8\|0\.034\|1\.82%\|98\.4\|0\.74 RMS" frontend/src` empty; with the inference API unreachable, the dashboard says “Static baseline band … not a model output”. |
| **P0-4** | Any signed-in user could publish or delete blog content and read other users' connector rows | SEC-02, SEC-05, SEC-14 | Deployment owner (Firebase) | Sign in as a non-superadmin and attempt `create` on `blog_articles` → denied; attempt to read another uid's `user_connectors/<uid>_<key>` → denied. Verify from the rules simulator *and* the client SDK. |
| **P0-5** | No way to verify claims (methodology/model/data) and no reachable legal/contact pages | UX-05, UX-14, SEO-13 | Frontend (done) | `/methodology`, `/model`, `/data-sources`, `/faq`, `/privacy`, `/terms`, `/contact` all 200 and linked from the footer. |
| **P0-6** | No security headers and no disclosure channel | SEC-03, SEC-16, SEC-17 | Deployment owner | `curl -sI https://www.hazardnet.live/` shows CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS **with** `includeSubDomains`; `/.well-known/security.txt` returns 200 with a future `Expires`. |

---

## 4. What changed on this branch

Files added or changed in `arena/01a0afa0-hazardnet` (all verified by the local build):

**Prerendering & content**
- `frontend/scripts/prerender.mjs` (new) — per-route static HTML, per-route `<head>`, JSON-LD `@graph`, sitemap, `robots.txt` rewrite, `404.html`, optional blog-article pages; depth-aware `injectIntoRoot()` so the static body can never corrupt nested markup; build fails loudly if `dist/index.html` or `#root` is missing.
- `frontend/src/content/site-routes.json` (new) — single source of truth for route copy, metadata, sitemap hints and the `appScreens` noindex list (15 routes + 5 app screens).
- `frontend/src/components/ArticlePage.tsx`, `frontend/src/hooks/usePageSeo.ts` (new) — render that content and apply per-route head/meta on client-side navigation, with a `noindex,follow` soft-404 guard.
- `frontend/index.html` — richer shell metadata; shell defaults to `noindex` because it is what the SPA rewrite serves for unknown paths (prerender strips it and writes the correct directive per page).
- `frontend/package.json` — `build` = `vite build && node scripts/prerender.mjs`; new `blog-index` script.

**Blog crawlability**
- `frontend/scripts/export-blog-index.mjs` (new) — read-only Firestore export of published articles into `public/data/blog-index.json` (public web config only; no credentials). Run before a production build; **not yet exercised against production data** (no network here).

**Security**
- `backend/utils/clientError.js` (new) + wiring in 6 `api/` and 6 `backend/routes/` handlers; sanitised the two remaining raw-message sites (`api/ingest.js`, `backend/routes/push.js`).
- `firestore.rules` — `isBlogSuperadmin()` gating for blog writes; ownership-scoped `/user_connectors`; comments updated to state the enforcement point honestly.
- `scripts/tests/test_blog_authz_parity.py` — extended to parse `firestore.rules` and to regression-test the blog-write and connector rules; also pins the allowlist across the UI, the SQL migration and the setup doc (11 tests, run under `pytest`).
- `vercel.json` + `frontend/vercel.json` — hardened headers (CSP, HSTS `includeSubDomains;preload`, COOP, Permissions-Policy), cache policy, `/documentation` → `/docs` 308, SPA rewrite that preserves `api/`, `assets/`, `data/`, `_vercel/` and real files.
- `frontend/public/.well-known/security.txt` (new), `frontend/public/robots.txt` (rewritten), `frontend/public/sitemap.xml` (regenerated), `firebase.json` (`**/.*` ignore removed so `.well-known` deploys).

**Honesty of the interface**
- `frontend/src/components/DataProcessingSkeleton.tsx` — fabricated console → honest loading state (props unchanged).
- `frontend/src/pages/Dashboard.tsx` — live-vs-baseline provenance, measured latency only, CSV export carries a `Source` column.
- `frontend/src/components/PredictionPanel.tsx` — “not measured” instead of `0 ms`.
- `frontend/src/pages/AnalyticsPage.tsx` — “Not published” metric cards with links to the model card/methodology; pipeline tab reads the real snapshot (`generated_at`, `prediction_date`, `source`, row count) instead of invented log lines; EM-DAT placeholder labelled as unavailable.
- `frontend/src/pages/Contact.tsx` — real send path (prefilled GitHub issue or mailto), validation, emergency numbers, no fake queue.
- `frontend/src/pages/About.tsx`, `Footer.tsx`, `Documentation.tsx` — dead `github.com/hazardnet/hazardnet-ai` links replaced with the real repository; district QR/canonical URLs fixed from `/district/<name>` (no such route) to `/forecast/district/<id>` on `www`.

**CI regression guards**
- `.github/workflows/site-health.yml` — three new live probes: deep-link content (8 routes), security headers (HSTS/CSP/XCTO/Referrer-Policy/Permissions-Policy), and “every sitemap URL returns 200”. These are **expected to fail until the deployment is updated**; that is the point.

## 5. Verification performed

| Check | Result |
| ----- | ------ |
| `npm run build --prefix frontend` | Pass — Vite build + prerender; 15 public routes + 5 noindex app screens, `sitemap.xml` (15 URLs), `404.html`, `robots.txt`, `.well-known/security.txt` |
| `npx tsc -p frontend/tsconfig.json --noEmit` | Pass (exit 0) |
| `npx jest` | Pass — 43 suites / 417 tests |
| `pytest scripts/tests/test_blog_authz_parity.py` | Pass — 11 tests (allowlist parity across UI ↔ SQL ↔ Firestore rules, blog-write gating, connector ownership) |
| Static-output inspection | Each page has exactly one `robots` meta and one canonical; `/` `index,follow`, `/login` `noindex,follow`, `404.html` `noindex,follow`; static bodies contain real `<h1>`s |
| Local serve of `dist/` | `/`, `/about/`, `/about.html`, `/faq/`, `/robots.txt`, `/sitemap.xml`, `/.well-known/security.txt` all 200 with expected content |
| CI probe strings vs built output | Pass — all 8 deep-link expectations match the generated HTML |

*Limitations:* no browser/screen-reader in this environment (Playwright cannot download a browser and no system browser exists), so visual, contrast, keyboard and Core Web Vitals items are scored from code review and static output, not measurement. Firestore rules cannot be emulated here — deploy to a Firebase project (or use the console simulator) before trusting the rule change. Live probes are limited to `fetch_page`-style fetches; direct `curl` from this sandbox is blocked.

## 6. Deploy checklist for the owner

1. **Ship this branch.** The deployment currently runs with Vercel's *Root Directory* set to `frontend/`; that is why the root `vercel.json` never applied. `frontend/vercel.json` now carries the build command, the SPA rewrite, the headers and the cache policy for exactly that topology. If you prefer to keep the root directory at `frontend/`, nothing else is needed; if you switch to the repository root, the root `vercel.json` already mirrors the same settings.
2. **Deploy the Firestore rules:** `firebase deploy --only firestore:rules` (then re-run the SEC-02/05 retest with a non-admin account).
3. **Make the blog index part of the release:** `npm run blog-index && npm run build` in `frontend/` (or add the export as a pre-build step). Without it the blog is still client-only.
4. **Watch the new probes go green:** `.github/workflows/site-health.yml` is now the regression guard for P0-1/P0-6 and SEO-01. A red run after a deploy means the headers or the rewrites are not reaching the live origin.
5. **Wire notifications** for that workflow to a mailbox you read (it is the only uptime/header alarm today).

## 7. Accepted risks and follow-ups

- **P1-1** Rate limiting for the `api/` serverless functions (the deployed surface) — consider a platform-level rule or a per-IP token bucket in a shared module.
- **P1-2** Four accepted critical `tar` advisories (install-time only) expire **2026-12-12**; the CI gate will fail then, by design.
- **P1-3** Confirm e-mail verification and consider MFA for the three superadmin accounts.
- **P1-4** Cap the CSV ingest payload size and page count.
- **P1-5** Move the superadmin allowlist out of the client bundle (custom claim or server check) — defence in depth, not a live vulnerability now that SEC-02 is enforced.
- **P1-6** Add an idempotency key to ingest if operators will re-run uploads.
- **P1-7** Exercise `npm run blog-index` against production and confirm article pages appear in `sitemap.xml`.
- **P1-8 … P1-11** Contrast/typography pass, tap targets, chart labelling, font subsetting and further dashboard code-splitting — all measurable only in a real browser.
- **P1-12 … P1-15** CTA hierarchy, screen-reader audit of the map, reduced-motion coverage across framer-motion, and a persistent “not an official warning” line on the map screens.

## 8. Appendix — raw evidence

```
# live today (fetch_page)
/                                 200  (JS shell; above-the-fold = loading console with
                                        "SYSTEM ACTIVE / TFLite • GPU Acceleration /
                                        LATENCY: 18ms / Softmax 98.4% / 0.74 RMS / 246 of 256")
/about                            404  "404: NOT_FOUND" (Vercel platform page)
/login                            404
/blogs /dashboard /documentation  404  (recorded earlier the same day)
/sitemap.xml                      200  9 URLs, apex host, lastmod 2026-09-12, lists
                                        /documentation (404s) and no blog URLs
/robots.txt                       200  valid; disallowed /dashboard /settings /u/ /auth/
/data/forecasts-latest.json       200  fresh snapshot (2026-09-16, generated by
                                        scripts/auto_forecast.py — GEE + Open-Meteo + TFLite)
/manifest.json                    200  valid PWA manifest
Response headers (HSTS probe)     only strict-transport-security: max-age=63072000
                                  (no includeSubDomains); no CSP / XCTO / XFO /
                                  Referrer-Policy / Permissions-Policy

# local build (this branch)
npm run build --prefix frontend   ok — 20 documents, sitemap 15 URLs, 404.html, robots.txt
tsc --noEmit                      exit 0
jest                              43 suites / 417 tests
pytest parity                     11 tests passed
dist JS total                     3.82 MB / 45 chunks (vendor-pdf 830 KB, firebase 680 KB,
                                  react 466 KB, recharts 366 KB — all lazy chunks)
dist CSS / fonts                  195 KB CSS; 17 woff2 (636 KB)
```
