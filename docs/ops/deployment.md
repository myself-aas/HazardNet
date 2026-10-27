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
   `data/site-health/**` is excluded from the watch paths as a second guard. Phase 5 adds a
   third consequence: because no build runs, the *served* copy of the record at
   `/data/site-health/latest.json` is published by `scripts/copy-dist.mjs` at the next
   ordinary build, so it can lag the committed record by up to one deployment. The repo file
   (`data/site-health/latest.json`) and the workflow's `site-health-result` artifact are
   canonical; the URL is a build-time snapshot. **Do not "fix" this by having the probe write
   into `frontend/public/data/`** — `frontend/**` is an *included* watch path, which would
   reintroduce the deploy loop.
4. **Verify the record landed (Phase 5).** The commit step is `if: always()` and runs *after*
   the aggregate check, so a broken site still writes a record. Dispatch both expectations and
   compare the four surfaces — record, run summary, uploaded artifact and the served URL:

   ```bash
   gh workflow run site-health.yml --ref "$(git branch --show-current)" \
     -f site_url=https://hazardnet.live -f expect=healthy
   gh run list --workflow=site-health.yml --limit 3
   gh run view <run-id> --log | grep -E 'Verify the committed record|site-health record|published data/site-health'
   curl -s https://www.hazardnet.live/data/site-health/latest.json \
     | jq '.outcome, (.checks[] | select(.id=="weather_api"))'
   gh run download <run-id> -n site-health-result -D /tmp/site-health-result
   diff data/site-health/latest.json /tmp/site-health-result/data/site-health/latest.json
   # No new Pages deployment may appear for the "[skip ci]" commit:
   npx wrangler pages deployment list --project-name=<project>   # before and after
   ```

   A `workflow_dispatch` with `-f expect=broken -f site_url=<broken-deployment>` must land
   `outcome: fail` with `checks[weather_api].detail` naming `current.temperature_2m`.
5. Watch the build in **Workers & Pages → hazardnet → Deployments**. A failed build leaves the
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

> **Update 2026-10-27 — blocker applied.** `www.hazardnet.live` is now attached as a Pages
> custom domain and serves the deployment. Independently fetched the same day from outside the
> Actions network: `https://www.hazardnet.live/` (200, full app shell), `/sitemap.xml` (the
> complete `www` `<urlset>`) and the previously-522 `/status` and `/about` all return 200; the
> 2026-10-26 HTTP 522 is gone. The red *Site Health Probe* runs predate this — the next
> scheduled run (or a manual **Run workflow**) re-probes and is the authoritative confirmation;
> see `docs/ops/owner-actions.md` Action 16. The 522 row above is retained as the point-in-time
> 2026-10-26 record, not overwritten.

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

## 7. The API: seven routes on the edge, three that stay Node-only

From 2026-10-26 the API has a host for its **read** surface; from 2026-10-27 it also proxies the
weather lookups and accepts the analytics beacon. Everything listed here is a Pages Function:

| Route | Served by | Data | `Cache-Control` |
|---|---|---|---|
| `GET /api/v1/forecasts/bulk` | `functions/api/v1/forecasts/bulk.ts` | the deployed `/data/forecasts-latest.json` | `no-store, max-age=0` |
| `GET /api/v1/forecasts/metadata` | `functions/api/v1/forecasts/metadata.ts` | the same artifact's dates and counts | `no-store, max-age=0` |
| `GET /api/v1/alerts` | `functions/api/v1/alerts/index.ts` | the deployed `/data/alerts-latest.json`, `PUBLISHED` rows only | `public, max-age=60` |
| `GET /api/v1/alerts/policy` | `functions/api/v1/alerts/policy.ts` | the policy block **stamped into** that artifact | `public, max-age=300` |
| `GET /api/v1/weather` | `functions/api/v1/weather.ts` | Open-Meteo, proxied — the Function holds no data | `public, max-age=900` |
| `GET`, `POST /api/v1/weather/batch` | `functions/api/v1/weather/batch.ts` | the same, for 1–N points | `public, max-age=900` |
| `POST /api/v1/telemetry` | `functions/api/v1/telemetry.ts` | one Analytics Engine data point per event | `no-store` |
| everything else under `/api/**` | nothing — **404** | — | — |

The `.ts` paths drop the `functions/` prefix and, where a route ends in `index.ts`, the
`index` too: `functions/api/v1/alerts/index.ts` answers `/api/v1/alerts`. That split mirrors
the Node surface, where `api/v1/[resource].js` serves the list and
`api/v1/alerts/[action].js` serves the actions.

The two artifact routes are snapshot-backed, not store-backed (`backend/utils/forecastSnapshotServe.js` and
`backend/utils/alertSnapshotServe.js` have the long version). Three reasons, in the order they matter: a Worker cannot load
`firebase-admin`; Firestore's Spark plan allows 50k reads/day and a per-request store query
would spend it re-serving bytes already on the CDN; and serving the API from the same artifact
the client falls back to means the two can never disagree about "the latest forecast". Cost: **0
reads, ~2 ms CPU** against the 10 ms ceiling, and no `fs`, no `process`, no native module.

The three routes added on 2026-10-27 are shaped differently because they do something other than
read a file, and each difference is the reason it can exist at the edge at all:

- **`/api/v1/weather*` is a proxy, not a second data source.** The Open-Meteo normaliser
  (`backend/utils/openMeteo.js`) is imported, not copied, so a validation change lands on both
  runtimes at once and the parity test compares the two handlers over one fixture. It carries no
  cache of its own — `max-age=900` is the cache — and it never sees a key, because Open-Meteo's
  free endpoints need none. The batch route bounds its own body at **256 KiB** before parsing,
  which is the `bodyParser.sizeLimit` the Node entry declared and a Pages Function has no parser
  to enforce. **A live probe of the first deployment found the batch route answering with
  point ids and no weather at all** — Open-Meteo returns a JSON *array* for N coordinates and the
  shared normaliser indexed into it as if it were the nested-object form — so the fix went into
  `backend/utils/openMeteo.js`, where the Node handler gets it too. It is the reason the parity
  tests compare point *payloads* rather than counts and ids: agreement between two runtimes is
  not correctness, and only a request to the deployed route showed the difference.
- **`/api/v1/telemetry` is the only endpoint a stranger can write to**, so its input rules live
  in one dependency-free module (`backend/utils/telemetryBatch.js`) that both runtimes import,
  and the 64 KiB body cap is checked on the raw text *before* `JSON.parse` — parsing first would
  buffer whatever arrives. On success it writes one Analytics Engine data point per event through
  the `ANALYTICS` binding; without that binding it falls back to exactly the log line the Node
  runtime emits, so a project that has not added the binding yet still answers 204 instead of
  dropping the beacon. The owner step for the binding is `docs/ops/owner-actions.md` Action 12.

`site-health.yml` probes the weather routes on every run (`weather_api`): one point and a batch,
each required to carry a numeric `current.temperature_2m`, because a 200 carrying only ids and
metadata is exactly what the batch route returned on its first deployment.

**Parity tests assert values (Phase 3, 2026-10-27).** Every edge/parity integration test
reads committed fixtures captured from the real upstream or the deployed artifacts, with a
three-line provenance header. `__tests__/testQuality.test.js` and
`docs/ops/test-quality-manifest.json` fail the build if a fixture loses its provenance, an
integration test loses a fixture-sourced leaf assertion, or a cached object stops equalling
the returned object. Refresh with `node scripts/capture_edge_fixtures.mjs` and
`node scripts/capture_open_meteo_fixtures.mjs`.

**Cache writes are verified (Phase 2, 2026-10-27).** The weather proxy's 15-minute cache
shared by Node and Pages is a `createVerifiedCache` from `backend/utils/cacheContract.js`:
`assertComplete` runs before every write and again on every read. A point with `_meta` but no
numeric reading is refused at the write and returned as a 502; a poisoned entry in an
already-warm cache is deleted on read and re-fetched. The same module guards the markdown
and advisory caches. `docs/ops/cache-write-register.json` is the list of every write site;
nine non-cache writes (counters, stores, gauges, signature expiry) carry dated reasons.

**Route register (Phase 1, 2026-10-27).** `docs/ops/route-register.json` is the machine-readable
answer to "which `/api/**` paths exist, and who has exercised them since the cutover". Every
path in `frontend/src` must be either a file under `functions/api/` or a **dated disposition**
there; `__tests__/routeReachability.test.js` fails on any third state. Each edge route names the
test that asserts a leaf value from a captured fixture (`__tests__/routeValueAssertions.test.js`).
The weather query contract moved to `backend/utils/weatherQuery.js` so the Express router, the
Node function and the Pages Function parse `lat`/`lng` and the `coords` mini-language identically:
`lon` is an accepted alias for `lng`, and `;` is accepted alongside `|` as a point separator
(URL-encoded `%3B` / `%7C`). Before that, the verification matrix's `?lat=23.8&lon=90.4` answered
**400** and `?coords=23.8%2C90.4%3B22.3%2C91.8` answered **count: 1** with an id of `91.8` —
two latent divergences of the same class as the batch shape bug, found by actually calling the
routes.

**The policy is stamped, not recomputed.** `/api/v1/alerts/policy` answers with the
thresholds *the engine ran under*, and the edge cannot derive those: a Worker has no
`process.env`, and the Cloudflare project's environment is not the pipeline's. So
`scripts/build_alert_snapshot.mjs` writes a `policy` block (plus the delivery transports) into
`alerts-latest.json` from the environment of the job that ran the engine — same job, same
`env:`, therefore the same configuration. An engine run report that carries its own `policy`
still wins; `policy_source` records which (`engine` or `builder`). If the deployed artifact ever
lacks the block, `/policy` answers **503** rather than inventing thresholds, and
`site-health.yml` fails on the snapshot that lost it.

The practical consequence for an owner: changing `ALERT_*` thresholds takes effect on the
**pipeline**, and reaches the public policy endpoint through the artifact at the next ingest —
not by editing a Pages environment variable. That is deliberate: the endpoint's value is that
it describes the policy the alerts in force were produced under.

Two facts that make the difference between a working edge API and a broken one:

- **Same origin.** The API answers on `www.hazardnet.live`, so there is no CORS preflight, no
  `Vary: Origin` and no second host to keep alive. That is the whole argument for Pages
  Functions over a Worker on a subdomain (Action 21).
- **`_headers` does not reach Function responses.** `functions/_middleware.ts` applies the
  canonical seven headers from `backend/security/httpHeaders.js`; `securityHeadersParity`
  asserts that list equals `frontend/public/_headers` and runs the middleware to prove it.

Still unhosted, and still expected to 404 — not breakage:

- **The front door** now reaches the live list at `/api/v1/alerts` (from 2026-10-26) and only
  falls back to `/data/alerts-latest.json` when that call fails. Both paths serve the same
  artifact, so a fallback is a latency event, not a data event — that is the point of serving
  the API from the file the client would fall back to.
- **`alerts/evidence-card`, `alerts/review`, `alerts/run`** stay unhosted: the first is
  store-backed, and the other two are authenticated writes that must not live on a metered edge
  runtime.
- **`metrics` and `historical` were deleted on 2026-10-27 (Phase 4); `kaggle` is scheduled.**
  The register's decision entry and `docs/ops/pr/phase-4-disposition.md` carry the measurements;
  the short version is that nothing should be "dispositioned but still deployed and unexercised":
  - **`/metrics` and `/api/metrics`** are gone. A Worker isolate has no process series, so a
    port would publish fabricated numbers. The one meaningful gauge,
    `hazardnet_forecast_age_hours` (plus the alert-snapshot and probe ages), is now a field in
    `/data/freshness.json -> gauges.series[]`, built by `scripts/build_freshness_artifact.mjs`.
    The `monitoring/` Prometheus files are kept as an historical record with a retirement header.
  - **`/api/v1/historical/*` and `/api/historical`** are gone. Zero browser/e2e callers; the
    client reads `/data/historical/*.json` from the CDN (confirmed live: 3,062 events, 1.5 MB,
    190 fetch chunks). The retired handler was a pure re-serialiser of that file — measured
    `JSON.parse` 2.85 ms + `JSON.stringify` 5.51 ms (median 8.41 ms total, p95 11.44 ms) on
    local Node/V8 against the 10 ms isolate budget. `frontend/public/_redirects` carries the
    permanent-404 note; no redirect rule was added, because one could shadow real assets.
  - **`/api/v1/kaggle`** is **still called** by `useKaggleAdvisories.ts`, so it is not deleted.
    `backend/services/kaggleAdvisoryClient.js` needs HTTP Basic credentials,
    `inflateRawSync` from `node:zlib`, and a `node:fs` cache that outlives the request — none
    exists in a Worker. The plan is a pipeline-written, pre-parsed artifact in R2 that a
    Function reads (`docs/ops/pr/phase-4b-kaggle-r2.md`), dated 2026-10-27, named PR
    `feat/kaggle-r2-artifact`. Until then the page states the absence honestly.
- **`backend/` (Express)** still runs in a container when someone starts one — `npm run dev:api`,
  `docker compose up`, or any host that runs Node 20 — and **`api/**`** remains the
  function-shaped surface for a Node host. Neither is deployed. The historical and metrics
  mounts were removed from both.
- **`monitoring/`** documents the retired Prometheus shape with a 2026-10-27 header; with no
  scrapeable host, `/data/freshness.json` and `site-health.yml` are what watch the site.
- **`backend/` (Express)** still runs in a container when someone starts one — `npm run dev:api`,
  `docker compose up`, or any host that runs Node 20 — and **`api/**`** remains the
  function-shaped surface for a Node host. Neither is deployed.
- **`monitoring/`** documents the Prometheus shape; with no scrapeable host, `site-health.yml` is
  what watches the site.

Operational notes for the edge routes: the Pages project needs **Runtime → Fail open /
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
