# Runtime data landing zones

This directory documents where forecast data lands at runtime. Some zones are
CI-only scratch and must never be committed; the others are committed on
purpose — they are the auditable ingest input and the offline website snapshot.
The table below says which is which.

## The four landing zones

| Path | Writer | Contents | Committed? |
|---|---|---|---|
| `data/kaggle_notebook_output/` | `scripts/fetch_kaggle_forecast.py` (`--dest`, hourly workflow) | Raw `kaggle kernels output` bundle (+ `fetch-manifest.json`) | No (CI diagnostics artifact only) |
| `backend/data/forecasts/` | `fetch_kaggle_forecast.py` (`--csv-out`/`--json-out`) + validation | Validated `hazardnet_forecasts_latest.csv/.json` + `manifest.json` | **Yes** — committed by the hourly workflow as the auditable ingest input |
| `frontend/public/data/forecasts-latest.json` | `scripts/build_forecast_snapshot.mjs` (hourly workflow) | Static website snapshot; ships inside every deployment | **Yes** — the offline fallback `useForecasts()` reads when the API is down |
| `data/manual_forecast.csv` (+ `.json` sidecar) | You, by hand (GitHub web UI → Add file → Upload files, or `git push`) | Hand-run Kaggle notebook output awaiting ingest | **Yes** — it is the trigger path for `manual_forecast_ingest.yml`, so it must be committed for the workflow to fire |

## Lifecycle (manual — first-run / hand-run notebook output)

`.github/workflows/manual_forecast_ingest.yml` exists for exactly one situation:
the notebook's output needs to reach the site and the hourly Kaggle fetch is not
available yet (no `KAGGLE_KEY`, quota, or the kernel has never published).
Upload the notebook's `/kaggle/working/hazardnet_forecasts_latest.csv` to
`data/manual_forecast.csv` on `main` and the workflow:

1. regenerates `data/manual_forecast.json` from the CSV;
2. validates both (`scripts/validate_forecasts.py --skip-freshness` — schema and
   ranges gate, staleness only warns, because a hand upload is deliberate);
3. promotes them to `backend/data/forecasts/hazardnet_forecasts_latest.{csv,json}`
   and writes `manifest.json` with `source: manual upload …`;
4. rebuilds `frontend/public/data/forecasts-latest.json`;
5. ingests through the same endpoint the hourly job uses
   (`POST /api/v1/forecasts/update`) and commits steps 3–4.

It is skipped when the CSV's sha256 still matches the committed manifest and
`force_refresh` is not set. It triggers on `push` to `main` only — pushing the
CSV on a feature branch will not run it. The hourly job then supersedes this
data on its next run.

⚠️ The workflow trusts the file: it stamps
`source: kaggle kernels output ashifahmedshuvo/hazardnet-auto-forecast-pipeline`
on the snapshot regardless of where the CSV actually came from. Upload real
notebook output, not a fixture — anything else will be published as a forecast.

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
