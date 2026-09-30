# Vercel Serverless Functions — the 12-function budget

## Why this file exists

The deployment target is the **Vercel Hobby plan** (docs/ENVIRONMENT_SECRETS.md §1.1: no
credit card, no expiry, non-commercial). Hobby allows **at most 12 Serverless Functions per
deployment**, and Vercel turns *every file under `api/`* into one function. The 13th file
does not degrade gracefully:

```
Error: No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.
exceeded_serverless_functions_per_deployment
```

The build itself reports success (`Build Completed in /vercel/output`), and only the
"Deploying outputs…" step fails, so the error reads as infrastructure rather than as a
repository change. Production keeps serving the last successful deployment, which is how
the symptom shows up as *a site that quietly stops updating* — with `site-health.yml`
probing a deployment that no longer contains the code in `main`.

## The layout

One entry point per URL **family** under `api/`; the per-endpoint handlers live in
`serverless/`, which Vercel does not scan (only `api/` is auto-detected).

| Entry point (`api/`) | URLs it serves | Handlers (`serverless/`) |
| --- | --- | --- |
| `api/[endpoint].js` | `POST /api/forecasts`, `GET /api/historical`, `POST /api/ingest`, `GET /api/metrics`, `POST /api/predict` | `forecasts.js`, `historical.js`, `ingest.js`, `metrics.js`, `predict.js` |
| `api/chat/[action].js` | `GET /api/chat/sample-questions`, `POST /api/chat/query` | `chat/sample-questions.js`, `chat/query.js` |
| `api/v1/[resource].js` | `GET /api/v1/alerts`, `GET /api/v1/historical`, `GET /api/v1/weather` | `v1/alerts/index.js`, `v1/historical.js`, `v1/weather.js` |
| `api/v1/alerts/[action].js` | `GET /api/v1/alerts/policy`, `GET /api/v1/alerts/evidence-card`, `POST /api/v1/alerts/review`, `POST /api/v1/alerts/run` | `v1/alerts/policy.js`, `v1/alerts/evidence-card.js`, `v1/alerts/review.js`, `v1/alerts/run.js` |
| `api/v1/forecasts/[action].js` | `GET /api/v1/forecasts/bulk`, `…/history`, `…/metadata` | `v1/forecasts/bulk.js`, `history.js`, `metadata.js` |
| `api/v1/weather/batch.js` | `POST /api/v1/weather/batch` | `v1/weather/batch.js` |

Six functions, eighteen URLs — six slots of headroom for the next endpoint family.

## How routing works

- **The dynamic segment.** `api/v1/alerts/[action].js` matches `/api/v1/alerts/policy`.
  Vercel appends the matched segment to the query string (`?action=policy`) and leaves the
  path in `req.url` untouched; `serverless/dispatch.js` reads the segment from the path
  (the query value is the fallback for a direct invocation in a test), removes its own
  parameter from `req.query` and `req.url`, and calls the handler — which therefore sees
  exactly the request it would have seen as its own function file.
- **One segment only.** `[action]` matches one path segment; a deeper path is not a route
  (catch-alls are not used here — the local Vercel emulation matches only one segment in
  the `api/` directory, so a layout that depended on them would deploy and 404).
- **Static beats dynamic.** `/api/v1/alerts` is a segment of `api/v1/[resource].js`, while
  `/api/v1/weather/batch` is the static `api/v1/weather/batch.js`; both coexist.
- **Handlers load per request.** Each entry point's `routes` table maps a segment to
  `() => import('…')` (literal specifiers, so the bundler can trace them). A module that
  throws while initialising therefore fails only its own endpoint — with the dispatcher's
  JSON 500, not the platform's `FUNCTION_INVOCATION_FAILED` page — and a cold start does
  not load the union of its siblings' import graphs.
- **Route configuration stays in `api/`.** `export const config` (e.g. the 256 kb body
  limit on the weather batch) is read from the deployed function file, never from an
  imported module.

## What keeps it true

| Gate | What it fails on |
| --- | --- |
| `npm run check:functions` (CI: *Vercel function budget*) | more than 12 files under `api/` — before the deploy, not during it |
| `__tests__/api/serverlessRouting.test.js` | a URL that stops resolving, an entry point that is not declarative, an orphaned handler, a relative import that does not resolve (this is how `api/v1/weather.js` once shipped `../../../backend/…` from a depth that needed `../../`) |
| `__tests__/api/serverlessGuard.test.js` | a deployed handler that does not apply `guardRequest` (SEC-07) |

## Adding an endpoint

1. Prefer an existing family: add a key to that entry point's `routes` table and a handler
   in the matching `serverless/` directory. No new function.
2. A genuinely new family needs a new `api/` entry file — check `npm run check:functions`
   first: at 12 functions it will not deploy, and the answer is to fold it into an
   existing family, not to upgrade the plan.
3. The handler owns its `guardRequest` call, its method check and its response shape; the
   entry point stays declarative.
4. The Express backend (`backend/routes/`) is a separate surface — parity is a product
   decision per endpoint, and `docs/PRD.md` §5.2 is the contract both implement.
