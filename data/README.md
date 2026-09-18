# Runtime data landing zones

This directory documents where forecast data lands at runtime. Some zones are
CI-only scratch and must never be committed; the others are committed on
purpose — they are the auditable ingest input and the offline website snapshot.
The table below says which is which.

> The Kaggle landing zones (`data/kaggle_notebook_output/`,
> `data/manual_forecast.csv`) and their workflows were removed on 2026-09-17:
> nothing runs on the Kaggle platform any more — `daily_forecast.yml` on the
> GitHub runner is the single producer.

## The landing zones

| Path | Writer | Contents | Committed? |
|---|---|---|---|
| `hazardnet_forecasts_latest.csv` (workspace root) | `scripts/auto_forecast.py` on the runner (`daily_forecast.yml`) | The freshly generated forecast rows | No (workflow artifact) |
| `backend/data/forecasts/` | `scripts/publish_forecast_csv.py` + validation | Validated `hazardnet_forecasts_latest.csv/.json` + `manifest.json` | **Yes** — committed by the producing workflow as the auditable ingest input |
| `frontend/public/data/forecasts-latest.json` | `scripts/build_forecast_snapshot.mjs` (the same workflow) | Static website snapshot; ships inside every deployment | **Yes** — the offline fallback `useForecasts()` reads when the API is down. **This is the delivery path while the deployment serves no ingest API.** |

## Lifecycle (daily, GitHub-native — the production path)

1. `daily_forecast.yml` runs `scripts/auto_forecast.py` on the runner
   (GEE + Open-Meteo + TFLite); the CSV lands in the workspace root. No Kaggle.
2. `scripts/publish_forecast_csv.py` sanity-checks it and writes
   `backend/data/forecasts/*.csv|json` + `manifest.json` (provenance + sha256).
3. `scripts/validate_forecasts.py` gates the promoted artifacts.
4. `build_forecast_snapshot.mjs` regenerates the frontend snapshot with the
   `SNAPSHOT_SOURCE` provenance.
5. The workflow commits `backend/data/forecasts/` + the snapshot, so the site
   redeploys with the new data. With `PUSH_TO_API=true` it additionally POSTs the
   CSV to the ingest API (the store path).

## Local development

- Run `python scripts/auto_forecast.py` to generate a CSV locally (needs the GEE
  service account), then `python scripts/publish_forecast_csv.py` to promote it.
- `backend/data/forecasts/` is safe to delete at any time — the next pipeline
  run recreates it.
- `uploads/` (repo root, multer landing dir for `POST /update`) is likewise
  runtime scratch and gitignored.

## Further reading

- `docs/adr/0008-hourly-refresh-snapshot-fallback.md` — why two paths (API +
  committed snapshot) exist.
- `docs/adr/0002-forecast-consolidation.md` — the forecast store abstraction.
