# Deployment

HazardNet's web app is deployed **only** on Cloudflare Pages. There is no second hosting
target, no deploy token for one, and no API on the public host.

This document is the source of truth for "where does the site come from". If a config file, a
workflow or a doc disagrees with it, this document wins — and the disagreement is a bug.

Last rewritten: **2026-10-26**, the day both hostnames moved to Pages, the Vercel
configuration was deleted and the Firebase Hosting block was retired.

Two columns of truth run through it:

- **Verified** — measured from the repository or from the live host on 2026-10-26, with the
  command or artifact quoted. These are facts.
- **To apply** — dashboard settings that live in the Cloudflare console, which no commit can
  set and no test here can read. They are written as instructions, not as claims.

---

## 1. The shape

```
git push origin main
  └─ Cloudflare Pages (project: hazardnet) builds the repository root
       ├─ npm ci --legacy-peer-deps && npm run build
       │    ├─ npm --prefix frontend run build     Vite → frontend/dist
       │    │    ├─ frontend/scripts/prerender.mjs one real HTML file per route + 404.html
       │    │    └─ copies frontend/public/** verbatim → _headers, _redirects, data/, …
       │    └─ node scripts/copy-dist.mjs          mirrors frontend/dist → dist
       └─ publishes dist/ as the site root
custom domains: www.hazardnet.live (canonical) + hazardnet.live (301 → www)
```

One deployment answers both hostnames, so there is no second origin and no per-host
divergence — the failure mode that produced the 2026-10-26 "advisory file could not be read"
report.

## 2. Project settings — **to apply** in the Cloudflare console

| Setting | Value | Why exactly this |
|---|---|---|
| Framework preset | **None** | the build is a plain Vite build driven from the repository root; a preset would inject its own commands |
| Build command | `npm ci --legacy-peer-deps && npm run build` | `npm ci` **alone fails** in this repo (peer-dependency conflicts — CI uses the same flag); `npm run build` is the root script that builds the frontend *and* mirrors it to `dist` |
| Build output directory | `dist` | the repository-root copy made by `scripts/copy-dist.mjs` (`frontend/dist` alone would also work, but every probe, the E2E serve step and `firebase.json`'s old block used the root copy — one location, one truth) |
| Root directory | *(empty — repository root)* | the build needs `package.json`, `scripts/` and `frontend/` in one tree |
| Environment variable | `NODE_VERSION=20` | `engines.node >= 20`; the Vite config and scripts assume 20 LTS |
| Build watch paths | **include** `frontend/**`, `functions/**`, `backend/**`, `package.json`, `package-lock.json`, `scripts/**`; **exclude** `data/site-health/**`, `docs/**`, `apps/**`, `e2e/**`, `__tests__/**` | the probe publishes `data/site-health/latest.json` whenever a check changes state, and docs/tests cannot change the bundle; without the exclusions a monitoring loop becomes a deploy loop (Action 9). **`backend/**` must stay included** since 2026-10-26: the Pages Functions import `backend/security/httpHeaders.js` and `backend/utils/forecast*.js`, so excluding it would rebuild the site while leaving the edge bundle on the old headers — drift between `_headers` and the middleware, which is the failure the parity test is meant to make impossible |
| Deploy hook | `main` → stored as the `CF_PAGES_DEPLOY_HOOK` secret | see §4 — the ingest commit is `[skip ci]`, so the push alone does **not** rebuild the site |
| Production branch | `main` | — |

### Why the build command is not `--workspace frontend`

`npm run build --workspace frontend` produces `frontend/dist` and stops there. The root
command additionally runs `scripts/copy-dist.mjs`, which is what every other surface in this
repository reads: `frontend/scripts/prerender.mjs` writes into the frontend tree, `ci.yml`
serves `dist/`, and `__tests__/modelArtifactsNotServed.test.js` pins the copy step. Two output
directories would work; one is what the tests assert, so the dashboard follows the tests.

## 3. What the repository ships to the edge

Cloudflare reads four things out of the published tree. All four are copied verbatim from
`frontend/public/` (`functions/` is different — it is code, not an asset, and it is scoped by `_routes.json`) and all four are asserted by tests,
because a file Cloudflare cannot parse fails **silently** — the deployment keeps serving, just
without the policy:

| File | Declares | Asserted by |
|---|---|---|
| `_headers` | the full security policy (CSP, HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP) plus the cache rules for `/assets/*`, `/serviceWorker.js` and `/data/*` | `__tests__/securityHeadersParity.test.js` — parsed, exact values, one line per header, ≤ 2,000 chars per line, ≤ 100 lines |
| `_redirects` | `/documentation → /docs 301` and **nothing else** | same suite, plus `__tests__/securityTxt.test.js` |
| `_routes.json` | which requests are Function invocations: `/api/*`, and nothing else | same suite — include is exactly `/api/*`, `exclude` never contains `/*`, ≤ 100 rules of ≤ 100 chars |
| `404.html` | the noindex shell the prerenderer emits | `__tests__/seoFoundations.test.js` |

**Deliberately absent: `/* /index.html 200`.** The prerenderer writes a real HTML file per
route, so every known URL is a file and needs no rewrite. An unknown URL falls through to
`404.html`: Cloudflare serves it with a `404` status, the page still boots the SPA (so a route
that exists but was not prerendered renders for the visitor), and a crawler is told not to
index it. A catch-all would answer every unknown URL with `200` and the indexable homepage —
the soft-404 case `seoFoundations.test.js` exists to prevent.

**Deliberately absent: `/api/*` and `/data/*` 404 guard rules.** They look like
defence-in-depth and are the opposite: `/data/*.json` is the site's primary read path (ADR
0008), and `_redirects` matches paths, so a rule naming `/data/*` is a way to shadow a file
that exists. Absent an asset, the request already lands on `404.html`. The invariant is
asserted in the test suite instead of encoded as a rule.

**`functions/`, and the one file that keeps it from swallowing the site.** Two read-only
endpoints live on the edge from 2026-10-26 (`functions/api/v1/forecasts/{bulk,metadata}.ts`,
Action 21). The moment a `functions/` directory exists, Pages invokes a Function for **every**
request unless `_routes.json` says otherwise — which would put a 10 ms CPU ceiling and a
100k/day meter in front of every image, font and data file, and take the "unlimited static
requests" tier away. So `_routes.json` includes `/api/*` and nothing else, `exclude` is empty
(`exclude` takes priority over `include`, so `exclude: ["/*"]` would disable the Functions
entirely — the opposite of what it looks like), and the parity suite asserts both facts.

Two consequences worth knowing before you touch this:

- **`_headers` does not apply to Function responses.** The seven headers on `/api/*` come from
  `functions/_middleware.ts`, which imports `backend/security/httpHeaders.js` — the same export
  the parity test compares against `_headers`. Never add a header to one without the other; the
  suite fails if you do.
- **Set Runtime → Fail open / closed to "fail open"** in the Pages project settings, so a day
  that exhausts the Function allowance still serves the static site (and the client's snapshot
  fallback) instead of an error page.

Everything else under `/api/**` still answers 404 — see §7 for what that means and Action 21
for the queue.

## 4. Deploying

1. **Merge to `main`.** Pages builds on push — for everything except the two jobs whose
   commits carry `[skip ci]` (see below).
2. **The ingest job triggers the build explicitly.** `daily_advisory_ingest.yml` commits the
   refreshed artifacts with `[skip ci]` (so a data commit does not re-run the whole test
   matrix) and Pages honours the same skip tokens, so the push does **not** rebuild the site.
   The job therefore POSTs the deploy hook, retried 3× and failing loudly on a non-2xx or an
   unset `CF_PAGES_DEPLOY_HOOK`: a trigger that silently does nothing is how the site ends up
   serving yesterday's artifacts while every run is green.
3. **The site-health probe never deploys.** Its commit also carries `[skip ci]`, and
   `data/site-health/**` is excluded from the watch paths as a second guard.
4. Watch the build in **Workers & Pages → hazardnet → Deployments**. A failed build leaves the
   previous deployment serving traffic; nothing goes dark.

### Pre-flight: compile the Functions the way Pages will

A `functions/` tree that does not bundle fails the **deploy**, not the site — which is the safe
direction, but it means the failure shows up minutes later in the dashboard rather than locally.
Before pushing anything that touches `functions/` or the `backend/` modules it imports:

```bash
npx wrangler pages functions build --outdir /tmp/fnbuild   # "Compiled Worker successfully"
```

Verified on 2026-10-26 with this tree: a single 24.6 KB bundle containing both routes, the
middleware and the canonical header strings. No `wrangler.toml` and no login are needed for a
build — it is esbuild plus the Pages router, and it is the only local check that exercises the
cross-directory imports (`functions/**` → `backend/security/httpHeaders.js`,
`backend/utils/forecast*.js`) the way the deployment does.

### Manual / fallback deploy

```bash
# one-off direct upload of an already-built tree (the Git integration stays primary)
npx wrangler pages deploy dist --project-name=<project>     # CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
npx wrangler pages deployment list --project-name=<project>
```

Both secrets exist for exactly this fallback; no workflow uses them.

### Verify the deploy, do not assume it

```bash
curl -sSI https://www.hazardnet.live/                # 200 + server: cloudflare + cf-ray + the five headers
curl -sSI https://hazardnet.live/                    # 301 → https://www.hazardnet.live/
curl -sSI https://www.hazardnet.live/district/dhaka  # 200 text/html, prerendered body
curl -sSI https://www.hazardnet.live/no-such-path    # 404 (not 200 + homepage)
curl -sSI https://www.hazardnet.live/api/v1/alerts   # 404 — there is no API here; correct
curl -s  https://www.hazardnet.live/data/freshness.json | head -c 400   # built_at advances
```

`site-health.yml` runs the same checks every 30 minutes, including a dedicated
`canonical_host` probe for `www`, and writes `data/site-health/latest.json`.

## 5. Canonical host and DNS

**Decision of 2026-10-04, unchanged:** `https://www.hazardnet.live` is canonical. It is
written into 41 tracked files — `<link rel="canonical">` and structured data
(`frontend/src/SEOHead.tsx`), `sitemap.xml`, `robots.txt`, `security.txt`'s `Canonical:`, the
content engine (`scripts/build_content_engine.mjs`), and a build guard in
`frontend/scripts/prerender.mjs` that **fails the build** if the emitted origin is anything
else. None of that moved in this cutover, and none of it should: the fix for a canonical host
that does not answer is to make it answer.

**Verified 2026-10-26:**

| Check | Result |
|---|---|
| `hazardnet.live` DNS | `CNAME hazardnet.pages.dev` (proxied) — owner's change, 11:17:31 |
| `www.hazardnet.live` DNS | `CNAME hazardnet.pages.dev` (proxied) — same export |
| `https://hazardnet.live/` | redirects to `www.hazardnet.live` (the apex request resolves to the www URL) |
| `https://www.hazardnet.live/` | **HTTP 522** — Cloudflare could not reach the origin (Ray `a50a1ae77d27c6e3`, re-checked later the same day: still 522, Ray `a50a2c01bab9475a`). **The canonical host is down, not slow.** |
| `https://hazardnet.live/data/freshness.json` | `built_at 2026-10-26T06:31:52Z`, 4/4 sources `fresh`, probe 7/7 |

**To apply — this is the one blocker:** add `www.hazardnet.live` as a **custom domain on the
Pages project** (Workers & Pages → hazardnet → Custom domains → Set up a domain). The DNS
record already points at the project; the hostname is not attached to it, so Cloudflare has no
origin to route to and answers 522. Until that is done, every canonical URL, all 103 sitemap
entries and `security.txt` name a hostname that does not serve the site while the apex — which
redirects to it — is healthy.

Then, at the zone level: **SSL/TLS → Edge Certificates → Always Use HTTPS: on**, **HSTS:
on** (max-age 6 months+, include subdomains, preload) — the `_headers` line states the same
policy, but Cloudflare ignores `Strict-Transport-Security` from `_headers` on some plan tiers,
so the switch is what makes it real. Keep the apex → www redirect where it is; it is the
single reason there is one canonical origin rather than two.

## 6. Rollback

- **Site:** Pages deployments are immutable. **Deployments → ⋯ → Rollback** (or
  `wrangler pages deployment list` → promote) moves the pointer; there is nothing to rebuild
  and no token to rotate.
- **Headers/redirects:** both are versioned in `frontend/public/`. Revert the commit and
  redeploy. There is no second copy to keep in step any more — the parity test would fail if
  there were.
- **DNS:** the owner's record is the source of truth. If `www` misbehaves, detach the custom
  domain from Pages rather than editing DNS.
- **Data:** a bad `/data/*` snapshot is fixed by reverting the commit that wrote it, not by
  rolling back the site.

## 7. The API: two endpoints on the edge, the rest unhosted

From 2026-10-26 the API has a host for its **read** surface, and only for that:

| Route | Served by | Data |
|---|---|---|
| `GET /api/v1/forecasts/bulk` | `functions/api/v1/forecasts/bulk.ts` (Pages Function) | the deployed `/data/forecasts-latest.json` |
| `GET /api/v1/forecasts/metadata` | `functions/api/v1/forecasts/metadata.ts` (Pages Function) | the same artifact's dates and counts |
| everything else under `/api/**` | nothing — **404** | — |

These two are snapshot-backed, not store-backed (`backend/utils/forecastSnapshotServe.js` has
the long version). Three reasons, in the order they matter: a Worker cannot load
`firebase-admin`; Firestore's Spark plan allows 50k reads/day and a per-request store query
would spend it re-serving bytes already on the CDN; and serving the API from the same artifact
the client falls back to means the two can never disagree about "the latest forecast". Cost: **0
reads, ~2 ms CPU** against the 10 ms ceiling, and no `fs`, no `process`, no native module.

Two facts that make the difference between a working edge API and a broken one:

- **Same origin.** The API answers on `www.hazardnet.live`, so there is no CORS preflight, no
  `Vary: Origin` and no second host to keep alive. That is the whole argument for Pages
  Functions over a Worker on a subdomain (Action 21).
- **`_headers` does not reach Function responses.** `functions/_middleware.ts` applies the
  canonical seven headers from `backend/security/httpHeaders.js`; `securityHeadersParity`
  asserts that list equals `frontend/public/_headers` and runs the middleware to prove it.

Still unhosted, and still expected to 404 — not breakage:

- **The front door** tries the live alert API, gets a 404, and falls back to the committed
  snapshot at `/data/alerts-latest.json`, saying so in the status strip. That is the documented
  delivery path (ADR 0008), not a degraded mode. Porting `alerts` is the next endpoint, not a
  prerequisite for the site working.
- **`telemetry`, `metrics`, `weather/batch`, `kaggle`, `historical`, `alerts/**`** — Action 21's
  queue. Telemetry deliberately lands with Action 12's Analytics Engine binding, so the sink and
  its writer change in one PR.
- **`backend/` (Express)** still runs in a container when someone starts one — `npm run dev:api`,
  `docker compose up`, or any host that runs Node 20 — and **`api/**`** remains the
  function-shaped surface for a Node host. Neither is deployed.
- **`monitoring/`** documents the Prometheus shape; with no scrapeable host, `site-health.yml` is
  what watches the site.

Operational notes for the two edge routes: the Pages project needs **Runtime → Fail open /
closed = fail open**, so a day that exhausts the daily Function allowance serves the static site
instead of an error page; and a bad deploy of `functions/` shows up as a *build* failure in
Pages, not a runtime one — the static site keeps serving the previous deployment, which is what
made this migration safe to do in one step.

## 8. What was removed, and what to do if you find a leftover

On 2026-10-26 the Vercel deployment was deleted outright: `vercel.json`,
`frontend/vercel.json`, `scripts/check-vercel-functions.mjs`, `frontend/src/lib/vercelAnalytics.ts`,
the `check:functions` script and its CI step, the two workflow deploy steps, the three
`VERCEL_*` secret names, the `.vercel` ignore entry and the `VITE_VERCEL_ANALYTICS` variable.
The Firebase Hosting block was retired the same day, after measuring that
`hazardnet-aas48424.web.app` was still serving the **2026-09-24** build
(`built_at 2026-09-24T20:35:20Z`, 0 published alerts, 7/7 probe checks failing);
`firebase.json` now carries only `firestore`.

**The Vercel GitHub App is a separate, still-open item.** Deleting configuration does not
uninstall an app: PR checks on 2026-10-26 still showed `Vercel Preview Comments` and a `Vercel`
deployment check for `vercel.com/aas-core/hazardnet`, so every push was still building a Vercel
preview of a project nothing here configures. `docs/ops/owner-actions.md` Action 23 is the
uninstall/disconnect step; there is no file in this repository that can do it.

If you find a Vercel or Firebase-Hosting instruction anywhere — a doc, a comment, a script — it
is stale. Either delete it or point it here. Dated audits under `docs/audits/` are history and
may keep naming both; anything in a setup guide, runbook or config is not.

## 9. What this costs — free tier only

The deployment is $0 and must stay that way. The architecture already fits: the expensive compute
is in GitHub Actions and the Kaggle notebook, the site is static HTML, and the API surface is thin
reads over a committed snapshot. Nothing here needs a paid runtime, so nothing here should acquire
one by accident. The binding rule lives in `docs/ops/owner-actions.md` **§ Cost constraints**.

| Service | Free allowance | What actually binds |
|---|---|---|
<!-- ✓ = re-read from Cloudflare's pricing/limits pages on 2026-10-26; the rest are as published,
     and a wrong allowance here is the one error this table cannot catch for you. -->
| Pages (static) | unlimited requests and bandwidth, **500 builds/month** | builds — see below |
| Pages Functions | 100,000 requests/day, **10 ms CPU** | CPU; reads and proxies only (Action 21) |
| R2 | 10 GB, 1M writes / 10M reads per month, no egress | nothing near-term; snapshots belong here, not Firestore |
| KV | 100k reads/day, **1k writes/day** | writes — never a counter |
| D1 | 5 GB, 5M row reads/day | — |
| Analytics Engine ✓ | 100k data points/day, 10k queries/day, 3-month retention | retention (Action 12) |
| Rate limiting rules ✓ | **1 rule**, `Path` only, 10 s period | one rule, one path (Action 8) |
| GitHub Actions | unlimited on public repos | **repo visibility** — `myself-aas/HazardNet` is public, so the Windows PR job and the emulator job are free |

### The build budget was being spent by the monitor

Measured from this repository on 2026-10-26: **75 of the 195 commits to `main` in the previous 30
days were site-health probe commits** — 52 in October alone, against a 500-build monthly
allowance. That is 38% of every commit to `main`, and in October alone about a tenth of the month's
build allowance spent re-publishing one monitoring file — a cost that scales with the probe's
flappiness, not with the site's traffic.

Two guards, both required, both now in place:

1. **`[skip ci]` on the probe commit** (`.github/workflows/site-health.yml`, added 2026-10-26).
   Pages skips a deployment when the commit message carries `[CI Skip]`, `[CI-Skip]`, `[Skip CI]`,
   `[Skip-CI]` or `[CF-Pages-Skip]` — case-insensitive, so `[skip ci]` matches. This works even if
   someone later clears the watch-path list in the dashboard, which is why it is the first guard.
2. **Watch paths excluding `data/site-health/**`** (§2) — the dashboard-side guard, and the one that
   cannot be bypassed from the repository.

The probe also only commits when a check's state actually changes, so a steady site produces no
commits at all. Note what this means for the **deploy trigger**: because Pages honours the same skip
token, a probe commit (and an artifact commit) is *not* a deploy. That is why the ingest job posts
the deploy hook explicitly (§4).

**Verify it after the first probe run past 2026-10-26:** Workers & Pages → hazardnet → Deployments
should show *"Deploy skipped"* (or no entry) for the `chore(ops): site-health probe …` commit, not a
successful build. The last build burned by the old behaviour was `d2fd9d9` (13:41Z on 2026-10-26),
which predates the token.
