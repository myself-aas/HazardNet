# Deployment

HazardNet's web app is deployed **only** on Cloudflare Pages. There is no second hosting
target, no deploy token in GitHub Actions, and no API on the public host.

This document is the source of truth for "where does the site come from". If a config file,
a workflow or a doc disagrees with it, the doc wins — and the disagreement is a bug.

Last rewritten: **2026-10-26**, the day both hostnames moved to Pages and the Vercel
configuration was deleted (`docs/audits/2026-10-26-www-front-door-unreadable-alerts.md`).

---

## 1. The shape

```
git push origin main
  └─ Cloudflare Pages (project: hazardnet) builds the repository root
       ├─ npm run build
       │    ├─ npm --prefix frontend run build    Vite → frontend/dist
       │    │    ├─ frontend/scripts/prerender.mjs  one real HTML file per route + 404.html
       │    │    └─ copies frontend/public/** verbatim → _headers, _redirects, data/, …
       │    └─ node scripts/copy-dist.mjs         mirrors frontend/dist → dist
       └─ publishes dist/ as the site root
custom domains: hazardnet.live + www.hazardnet.live  (CNAME → hazardnet.pages.dev, proxied)
```

Both hostnames point at the **same** project and therefore the same build. There is no
second origin and no per-host divergence.

## 2. Project settings (Cloudflare Pages)

| Setting | Value | Why exactly this |
|---|---|---|
| Framework preset | None | the build is a plain Vite build run from the repository root |
| Build command | `npm run build` | runs the frontend build **and** the copy step; `build:frontend` alone would leave `dist/` missing |
| Build output directory | `dist` | the repository-root copy produced by `scripts/copy-dist.mjs` |
| Root directory | *(empty — repository root)* | the build needs `package.json`, `scripts/` and `frontend/` in one tree |
| Node version | 20 (env `NODE_VERSION=20`) | the Vite config and scripts assume 20 LTS |
| Environment variables | every `VITE_*` from `docs/ENVIRONMENT_SECRETS.md` §2.2 | they are baked into the bundle at build time; changing one needs a redeploy |

**API secrets do not belong in the Pages project.** The static deployment runs no API, so
`BACKEND_API_KEY`, `GEMINI_API_KEY` and friends would be published to a build log for no
benefit. See §6.

## 3. What the repository ships to the edge

Cloudflare reads three things out of the published tree. All three are copied verbatim from
`frontend/public/` and all three are asserted by tests, because a file Cloudflare cannot
parse fails silently:

| File | Declares | Asserted by |
|---|---|---|
| `_headers` | the full security policy (CSP, HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP) plus the cache rules for `/assets/*`, `/serviceWorker.js` and `/data/*` | `__tests__/securityHeadersParity.test.js` (parsed, not pattern-matched) |
| `_redirects` | `/documentation → /docs 301` and **nothing else** | `__tests__/securityHeadersParity.test.js`, `__tests__/securityTxt.test.js` |
| `404.html` | the noindex shell the prerenderer emits | `__tests__/seoFoundations.test.js` |

**Why there is no `/* /index.html 200` catch-all.** The prerenderer writes a real HTML file
per route, so every known URL is a file and needs no rewrite. An unknown URL falls through to
`404.html`: Cloudflare serves it with a `404` status, the page still boots the SPA (so a
route that exists but was not prerendered — a profile URL, an alert id — renders for the
visitor), and a crawler is told not to index it. A catch-all would answer every unknown URL
with `200` and the indexable homepage, which is the soft-404 case
`__tests__/seoFoundations.test.js` exists to prevent.

`firebase.json` declares the same headers and redirects for a Firebase Hosting deployment and
its rewrite points at `/404.html` for the same reason. It is **not** a deploy target — it is
kept correct because it was the answering host once, and a stale copy is what caused the
2026-10-04 header drift.

## 4. Deploying

1. Merge to `main`. Pages builds on push; the ingest workflows no longer call a deploy
   command, because the push *is* the trigger.
2. Watch the build in **Workers & Pages → hazardnet → Deployments**. A failed build leaves
   the previous deployment serving traffic; nothing goes dark.
3. Verify, do not assume:

```bash
curl -sSI https://hazardnet.live/                 # CSP, HSTS, nosniff, frame-options present
curl -s  https://hazardnet.live/data/freshness.json | head -c 400   # built_at advances
curl -sI https://hazardnet.live/does-not-exist    # 404 (not 200 + homepage)
curl -sI https://hazardnet.live/api/v1/alerts     # 404 — there is no API; this is correct
curl -sI https://hazardnet.live/.well-known/security.txt            # 200, text/plain
```

`site-health.yml` runs the same probes every 30 minutes and writes
`data/site-health/latest.json`.

## 5. Rollback

Pages keeps every deployment. **Deployments → ⋯ → Rollback** on the last good one restores
the site in seconds, custom domains included. There is nothing to re-run and no token to
rotate. Data artifacts are separate: a bad `/data/*` snapshot is fixed by reverting the
commit that wrote it, not by rolling back the site.

## 6. The API has no host

Neither API runtime is deployed:

- `backend/` (Express) runs in a container when someone starts one — `npm run dev:api`,
  `docker compose up`, or any host that runs Node 20.
- `api/**` (Node functions dispatching into `serverless/**`) is kept as the function-shaped
  surface for a future host; it shares every handler with Express.

Consequences you should expect, and not diagnose as breakage:

- `hazardnet.live/api/**` and `www.hazardnet.live/api/**` answer **404**.
- The front door tries the live API, gets a 404, and falls back to the committed snapshot at
  `/data/alerts-latest.json`, saying so in the status strip. That fallback is the documented
  delivery path (ADR 0008), not a degraded mode.
- `monitoring/` documents the Prometheus shape; with no API host, there is nothing to scrape
  and `site-health.yml` is what watches the site.
- A feature that needs a live API currently needs a host first. That decision is
  `docs/ops/owner-actions.md` Action 17.

## 7. What was removed, and what to do if you find a leftover

On 2026-10-26 the Vercel deployment was deleted outright: `vercel.json`,
`frontend/vercel.json`, `scripts/check-vercel-functions.mjs`, `frontend/src/lib/vercelAnalytics.ts`,
the `check:functions` script and its CI step, the two workflow deploy steps, the three
`VERCEL_*` secret names, the `.vercel` ignore entry and the `VITE_VERCEL_ANALYTICS` variable.

If you find a Vercel instruction anywhere — a doc, a comment, a script — it is stale. Either
delete it or point it here. Dated audits under `docs/audits/` are history and may keep naming
it; anything in a setup guide, runbook or config is not.
