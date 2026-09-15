# ADR 0003 — Deploy topology & CSP rollout

> **Updated by ADR 0009:** Both Vercel and Express must expose all feature routes; trained inference uses an authenticated LiteRT service. See [current deployment contract](0009-firebase-model-and-deployment-contract.md).

- **Status:** Accepted (2026-08-28)
- **Context:** Audit OPS/P2; the repo simultaneously carries `vercel.json`,
  `firebase.json` (hosting), and a Node server that serves the built frontend.

## Decision

**Vercel is the primary deployment target**: static frontend (`dist/`,
`outputDirectory` in `vercel.json`) + serverless functions (`api/`). The
Node server (`backend/server.js`) is the **local development and
self-hosting runtime** — it proxies nothing in production and its frontend
serving is a convenience, not a deploy target. Firebase Hosting config
(`firebase.json`) is retained only for the legacy applet; do not add new
hosting there.

**CSP rollout plan (SEC-05):** the helmet CSP ships Report-Only. Steps:
1. Watch console reports in staging/production for a week (violations log as
   browser console reports; no enforcement).
2. Fix any violations (inline styles are already allowed; no inline scripts
   exist in the built bundle).
3. Flip to enforcing per-environment with `CSP_ENFORCE=true` (server) — static
   frontend headers on Vercel enforce independently (see `vercel.json`
   `headers`, which ship enforcing `X-Frame-Options`, HSTS, Referrer-Policy,
   Permissions-Policy, and a reporting-mode CSP for the SPA).

**Frontend security headers** on Vercel are enforcing from day one except CSP,
which starts in `Content-Security-Policy-Report-Only` to avoid breaking the
SPA before the report window.

## Consequences

- One canonical production path: `vercel deploy` / Git integration.
- Backend env (`BACKEND_API_KEY`, `GEMINI_API_KEY`, `FRONTEND_ORIGIN`,
  `CSP_ENFORCE`, …) is configured in Vercel project settings; local dev keeps
  `.env` (see `backend/server.js` startup assertions for the required set).
- Function packaging uses the repo-root `bun.lock` (lockfileVersion 1 — see
  the P0 fix history); CI (once pushed) guards this with a frozen install.
