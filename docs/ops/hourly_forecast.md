# Hourly Forecast Refresh Pipeline (Kaggle → GitHub Actions → Website)

The website refreshes **every hour** with the latest forecast CSV produced by
the Kaggle notebook
[`ashifahmedshuvo/hazardnet-auto-forecast-pipeline`](https://www.kaggle.com/code/ashifahmedshuvo/hazardnet-auto-forecast-pipeline).

## Pipeline roles

| Workflow | Cadence | Role |
|---|---|---|
| `.github/workflows/forecast-pipeline.yml` | Daily 00:00 UTC | **Producer** — pushes a new version of the Kaggle notebook (GEE + Open-Meteo + TFLite inference), waits for completion, downloads the run's output, validates, ingests, archives, commits. |
| `.github/workflows/hourly_forecast.yml` | **Hourly (`5 * * * *`)** | **Refresher** — downloads the notebook's *latest-run* CSV output, validates, ingests into the forecast store, regenerates the static website snapshot, commits the refreshed data. Never re-executes the notebook. |
| `.github/workflows/weekly_forecast.yml` | Sundays 02:00 UTC | Patch release + GitHub Release artifacts. |

## How the hourly refresh works

```text
Kaggle notebook (runs on its own schedule)
        │  writes /kaggle/working/hazardnet_forecasts_latest.csv
        ▼
GitHub Actions — hourly_forecast.yml (every hour)
        │  kaggle kernels output ashifahmedshuvo/hazardnet-auto-forecast-pipeline \
        │      -p data/kaggle_notebook_output          (scripts/fetch_kaggle_forecast.py)
        │
        ├─ sanity check + scripts/validate_forecasts.py (schema-adaptive)
        ├─ refresh backend/data/forecasts/hazardnet_forecasts_latest.{csv,json}
        │  and manifest.json (sha256 + provenance)
        ├─ node scripts/build_forecast_snapshot.mjs
        │      → frontend/public/data/forecasts-latest.json   (bundled into the site)
        ├─ POST /api/v1/forecasts/update  (local backend, BACKEND_API_KEY)
        │      → forecast store (FORECAST_STORE=firestore|supabase)
        └─ git commit + push  → deployment rebuilds with the fresh data
```

### Why the site is guaranteed to carry hourly data

1. **API path** — ingestion updates the forecast store that serves
   `GET /api/v1/forecasts/bulk` (what `useForecasts()` polls every 5 min).
2. **Codebase path** — the committed `frontend/public/data/forecasts-latest.json`
   snapshot is rebuilt from the same CSV on every refresh and shipped with the
   build; `useForecasts()` falls back to it automatically when the API is
   unreachable. Because the workflow commits these files to the branch, the
   entire website codebase (data included) is literally refreshed hourly and
   redeploys on change.
3. **No-op runs** — when the notebook output has not changed since the last
   hourly run (same CSV sha256 in `backend/data/forecasts/manifest.json`), the
   workflow succeeds without ingesting or committing, keeping history clean.
   Use the `force_refresh` input on `workflow_dispatch` to override.

## Data cadence note

The *freshness of the numbers* is bounded by the Kaggle notebook's own run
schedule (it performs GEE fetch + TFLite inference and is not re-run hourly —
Kaggle compute quotas apply). The hourly workflow guarantees the website picks
up each new notebook output **within one hour** of its completion. The
workflow emits a `::warning::` when `prediction_date` is older than 72 h,
which usually means the notebook's Kaggle schedule has stalled.

## Required configuration (repo → Settings → Secrets and variables → Actions)

| Name | Kind | Purpose |
|---|---|---|
| `KAGGLE_USERNAME` | secret | Kaggle API username (notebook owner). |
| `KAGGLE_KEY` | secret | Kaggle API token. |
| `BACKEND_API_KEY` | secret | Bearer key for `POST /api/v1/forecasts/update` (fail-closed). |
| `GEMINI_API_KEY` | secret (optional) | AI advisory text during ingest; deterministic fallback when unset. |
| `SUPABASE_DB_URL` | secret (optional) | Postgres connection string when `FORECAST_STORE=supabase`. |
| `FORECAST_STORE` | variable (optional) | `firestore` (default) or `supabase`. |

## Manual operations

```bash
# Run the refresh once from the GitHub UI:
#   Actions → "Hourly Forecast Refresh (Kaggle Notebook Output)" → Run workflow

# Reproduce the fetch locally (needs the kaggle CLI configured):
kaggle kernels output ashifahmedshuvo/hazardnet-auto-forecast-pipeline -p data/kaggle_notebook_output
python scripts/fetch_kaggle_forecast.py --dest data/kaggle_notebook_output
python scripts/validate_forecasts.py
node scripts/build_forecast_snapshot.mjs

# Inspect what the site would serve as fallback:
jq '.prediction_date, (.horizons | map_values | map_values(length))' \
   frontend/public/data/forecasts-latest.json
```

## Failure triage

- **"Failed to download the Kaggle notebook output"** — Kaggle API outage or
  the kernel has never run; the step retries 3× with back-off. Check the
  notebook page manually.
- **Validation failed** — the notebook's CSV schema drifted from the ingest
  contract (`backend/utils/forecastRow.js`); compare against the
  `__tests__/forecastsUpdate.test.js` fixtures.
- **Ingest HTTP ≠ 200** — inspect `ingest_response.json` + `backend-server.log`
  artifacts; a 503 means `BACKEND_API_KEY` is unset/rotated.
- **Freshness warning** — notebook hasn't produced a new `prediction_date` in
  >72 h; check the notebook's Kaggle schedule/quota.
