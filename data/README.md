# Runtime data landing zones

This directory documents where forecast data lands at runtime. Some zones are
CI-only scratch and must never be committed; the others are committed on
purpose — they are the auditable ingest input and the offline website snapshot.
The table below says which is which.

## The four landing zones

| Path | Writer | Contents | Committed? |
|---|---|---|---|
| `hazardnet_forecasts_latest.csv` (workspace root) | `scripts/auto_forecast.py` on the runner (`daily_forecast.yml`) | The freshly generated forecast rows | No (workflow artifact) |
| `hazardnet_run_report.json` (workspace root) | `scripts/auto_forecast.py` (same run) | Coverage tally + provenance for that run: `coverage.{requested_units, produced_units, per_horizon, missing_district_ids, skipped[], status}`, `model_version`, `model_sha256`, `pipeline_version`, `run_id`, `soil_channels_fabricated` | No (workflow artifact, uploaded for inspection) |
| `data/kaggle_notebook_output/` | `scripts/fetch_kaggle_forecast.py` (`--dest`, dispatch-only legacy Kaggle job) | Raw `kaggle kernels output` bundle (+ `fetch-manifest.json`) | No (CI diagnostics artifact only) |
| `backend/data/forecasts/` | `scripts/publish_forecast_csv.py` (GitHub run) or `fetch_kaggle_forecast.py` (legacy Kaggle run) + validation | Validated `hazardnet_forecasts_latest.csv/.json` + `manifest.json` | **Yes** — committed by the producing workflow as the auditable ingest input |
| `frontend/public/data/forecasts-latest.json` | `scripts/build_forecast_snapshot.mjs` (the same workflow) | Static website snapshot; ships inside every deployment | **Yes** — the offline fallback `useForecasts()` reads when the API is down. **This is the delivery path while the deployment serves no ingest API.** |
| `data/manual_forecast.csv` (+ `.json` sidecar) | You, by hand (GitHub web UI → Add file → Upload files, or `git push`) | Hand-run Kaggle notebook output awaiting ingest | **Yes** — it is the trigger path for `manual_forecast_ingest.yml`, so it must be committed for the workflow to fire |

## Coverage gate (added 2026-09-17)

`scripts/publish_forecast_csv.py` requires the run report (`--run-report`, default
`hazardnet_run_report.json`) and refuses to publish:

* when the report is missing (the coverage of the run cannot be accounted for), or
* when its `coverage.produced_units` disagrees with the CSV row count.

A **partial** run still publishes — but it is labelled: `manifest.json` gets
`coverage_status: "partial"`, the full tally, and the list of districts with no forecast, and the
snapshot carries the same. `scripts/validate_forecasts.py` fails a manifest with no tally or no
model provenance. The legacy Kaggle producers have no run report, so their workflows pass
`--skip-coverage` explicitly — a deliberate, visible exemption rather than a silent one.

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

⚠️ The workflow trusts the file: it stamps its own provenance
(`source: kaggle kernels output ashifahmedshuvo/hazardnet-auto-forecast-pipeline`)
on the snapshot regardless of where the CSV actually came from. Upload real
notebook output, not a fixture — anything else will be published as a forecast.
(The GitHub-native producer stamps its own source explicitly, so a snapshot can
never claim a producer that did not make it: `SNAPSHOT_SOURCE`.)

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

## Lifecycle (hourly, legacy Kaggle worker — dispatch-only since 2026-09-16)

The `hourly_forecast.yml` steps below still work when dispatched by hand and its
Kernel token + slug are valid; it no longer runs on a timer.

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

## Alert snapshot (added Phase 5, 2026-09-18)

| Path | Writer | Contents | Committed? |
|---|---|---|---|
| `frontend/public/data/alerts-latest.json` | `scripts/build_alert_snapshot.mjs` from the engine output `alert-run.json` (`daily_forecast.yml`) | Published alerts only (`PUBLISHED`), schema `hazardnet-alerts/v1`, with `generated_at`, the policy copy, level counts and each row's evidence/provenance | **Yes** — the offline fallback `/alerts` reads when the API is unreachable, the service worker has no cached copy, or the user is in low-bandwidth mode |

The `alerts-latest.json` file that ships in this repository was produced by
`npm run alerts:snapshot`, i.e. by replaying the **real** engine over the committed
forecast snapshot offline. It is deliberately **empty**: the committed forecast snapshot
has `provenance.model_version: null`, §1.6 requires a model version before an alert may
be published, and the builder refuses to invent one. Its `counts.dropped_unpublished`
(74) and `assessed` (74) are how the web page can say *"74 rows assessed, none
publishable"* rather than *"all clear"*.

Two invariants the builder enforces (tested in `__tests__/alertSnapshot.test.js` and
`scripts/tests/test_frontend_alert_surface.py`):

1. only `PUBLISHED` rows reach the file, and every row carries the §1.7 disclaimer;
2. an empty run **cannot** replace a non-empty snapshot unless `--allow-empty` is passed —
   a failed pipeline must not silently become "no alerts today".
