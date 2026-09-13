# Runtime data landing zones

This directory documents where forecast data lands at runtime. Only this
README is committed — every landing zone below is created on demand by the
pipeline or the server and must never be committed (raw CSVs would bloat the
repo and may carry pre-validation rows).

## The three landing zones

| Path | Writer | Contents | Committed? |
|---|---|---|---|
| `data/kaggle_notebook_output/` | `scripts/fetch_kaggle_forecast.py` (`--dest`, hourly workflow) | Raw `kaggle kernels output` bundle (+ `fetch-manifest.json`) | No (CI diagnostics artifact only) |
| `backend/data/forecasts/` | `fetch_kaggle_forecast.py` (`--csv-out`/`--json-out`) + validation | Validated `hazardnet_forecasts_latest.csv/.json` + `manifest.json` | **Yes** — committed by the hourly workflow as the auditable ingest input |
| `frontend/public/data/forecasts-latest.json` | `scripts/build_forecast_snapshot.mjs` (hourly workflow) | Static website snapshot; ships inside every deployment | **Yes** — the offline fallback `useForecasts()` reads when the API is down |

## Lifecycle (hourly)

1. `hourly_forecast.yml` downloads the notebook's latest-run output into
   `data/kaggle_notebook_output/` (gitignored scratch).
2. `scripts/validate_forecasts.py` gates the CSV; on success the validated
   files land in `backend/data/forecasts/`.
3. The CSV is ingested into the forecast store (`POST /api/v1/forecasts/update`).
4. `build_forecast_snapshot.mjs` regenerates the frontend snapshot.
5. The workflow commits `backend/data/forecasts/` + the snapshot (API path and
   codebase path stay in lockstep).

## Local development

- Run `python scripts/fetch_kaggle_forecast.py --help` for fetch options.
- `backend/data/forecasts/` and `data/kaggle_notebook_output/` are safe to
  delete at any time — the next pipeline run recreates them.
- `uploads/` (repo root, multer landing dir for `POST /update`) is likewise
  runtime scratch and gitignored.

## Further reading

- `docs/ops/hourly_forecast.md` — hourly refresher runbook.
- `docs/adr/0008-hourly-refresh-snapshot-fallback.md` — why two paths (API +
  committed snapshot) exist.
- `docs/adr/0002-forecast-consolidation.md` — the forecast store abstraction.
