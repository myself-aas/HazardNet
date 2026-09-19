# ADR 0008 — Hourly Kaggle-output refresh with a committed snapshot fallback

- **Status:** Accepted (2026-09-13); **partly superseded 2026-09-20 by ADR 0013** —
  the hourly refresh job (`hourly_forecast.yml`) is deleted and the daily pull from
  Kaggle is the producer. What stands from this ADR is the second half: the committed
  snapshot and the frontend's live → snapshot → static-baseline freshness ordering.
- **Context:** production-readiness audit finding #2 ("production serves mock
  data"); user report "site does not refresh from the updated forecasted CSV
  despite manual notebook runs"
- **Related:** ADR 0002 (forecast consolidation), ADR 0003 (deploy topology),
  ADR 0004 (retire legacy weekly pipeline), `docs/ops/hourly_forecast.md`

## Context

The website's Peak Hazard Window / Incident Ingestion cards showed "Live
Kaggle data unavailable" and kept rendering the hardcoded
`ALL_64_DISTRICTS` baseline even after the Kaggle notebook produced fresh
forecasts. Investigation found three independent breaks in the
notebook→site chain:

1. **No producer-to-site automation.** The daily `forecast-pipeline.yml`
   re-executes the notebook, but nothing propagated the notebook's *output*
   CSV to the serving tier on a cadence the site could rely on — and manual
   notebook runs left no trace the site could observe.
2. **API-parity gap.** The Express backend served
   `GET /api/v1/forecasts/bulk`, but the Vercel deployment had no handler
   for it, so production API reads fell through to the static baseline.
3. **Single point of freshness.** The cards had exactly one live source
   (`/metadata` → store); any store/API outage blanked them even when a
   recent forecast existed.

## Decision

Refresh via **two redundant paths**, both driven hourly from the same
notebook output:

1. **API path (live).** `.github/workflows/hourly_forecast.yml` (hourly,
   minute 5 UTC) downloads the notebook's latest-run CSV via
   `kaggle kernels output`, validates it (`scripts/validate_forecasts.py`),
   and ingests it into the forecast store
   (`POST /api/v1/forecasts/update`). The hourly job never re-executes the
   notebook — the daily pipeline remains the sole producer.
2. **Codebase path (committed snapshot).** The same run regenerates
   `frontend/public/data/forecasts-latest.json`
   (`scripts/build_forecast_snapshot.mjs`) and commits it together with the
   validated input (`backend/data/forecasts/`), so every deployment ships
   with forecasts at most one hour behind the latest notebook run.

The frontend resolves freshness through a three-stage fallback —
`fetchForecastMetadata()`: live `/metadata` → live `/bulk` rows → committed
snapshot (`frontend/src/lib/forecasts.ts`) — and district rows through
`useForecasts()` with the same live→snapshot→static-baseline ordering. The
Vercel serverless handlers (`api/v1/forecasts/*.js`) share one
implementation with Express (`backend/utils/forecastServe.js`, ADR 0002
store), closing the parity gap by construction.

## Consequences

- Manual notebook runs propagate to the site within the hour with no human
  step: output → hourly download → store + snapshot → cards.
- A store/API outage degrades the cards to the snapshot (≤1h stale) instead
  of "unavailable"; a total backend outage still leaves the static baseline.
- The hourly job commits data files to the repo (auditable ingest input);
  `main` should therefore be ruleset-protected with the bot as the only
  data-commit writer (audit finding #4).
- Snapshot size is bounded by construction (latest prediction_date only,
  both horizons) — no unbounded history growth in the bundle.
- Kaggle CLI surface is pinned to the 1.8.x classic line
  (`scripts/requirements-pipeline.txt`, Python 3.11); the 2.x automation
  surface is unverified and must not be adopted without re-testing
  `kernels output` + `datasets download`.
