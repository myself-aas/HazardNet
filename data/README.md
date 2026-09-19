# Runtime data landing zones

This directory documents where forecast data lands at runtime. Some zones are
CI-only scratch and must never be committed; the others are committed on
purpose — they are the auditable ingest input and the offline website snapshot.
The table below says which is which.

## The landing zones

| Path | Writer | Contents | Committed? |
|---|---|---|---|
| `hazardnet_forecasts_latest.csv` (workspace root) | `scripts/auto_forecast.py` on the runner (`daily_forecast.yml`) | The freshly generated forecast rows | No (workflow artifact) |
| `hazardnet_run_report.json` (workspace root) | `scripts/auto_forecast.py` (same run) | Coverage tally + provenance for that run: `coverage.{requested_units, produced_units, per_horizon, missing_district_ids, skipped[], status}`, `model_version`, `model_sha256`, `pipeline_version`, `run_id`, `soil_channels_fabricated` | No (workflow artifact, uploaded for inspection) |
| `data/kaggle_notebook_output/` | `scripts/fetch_kaggle_forecast.py` (`--dest`, dispatch-only legacy Kaggle job) | Raw `kaggle kernels output` bundle (+ `fetch-manifest.json`) | No (CI diagnostics artifact only) |
| `backend/data/forecasts/` | `scripts/publish_forecast_csv.py` (GitHub run) or `fetch_kaggle_forecast.py` (legacy Kaggle run) + validation | Validated `hazardnet_forecasts_latest.csv/.json` + `manifest.json` | **Yes** — committed by the producing workflow as the auditable ingest input |
| `frontend/public/data/forecasts-latest.json` | `scripts/build_forecast_snapshot.mjs` (the same workflow) | Static website snapshot; ships inside every deployment | **Yes** — the offline fallback `useForecasts()` reads when the API is down. **This is the delivery path while the deployment serves no ingest API.** |
| `data/site-health/latest.json` | `.github/workflows/site-health.yml` (every 30 min on the default branch) | The machine-readable result of the last site-health probe: outcome + per-check results | **Yes** — the `/status` page and the freshness artifact quote it (never hand-edit; see `data/site-health/README.md`) |
| `frontend/public/data/freshness.json` | `scripts/build_freshness_artifact.mjs` (pipeline workflows, the probe workflow, or by hand) | Derived status artifact: per-source age vs SLO, coverage stamp, model provenance, probe result | **Yes** — it is what `/status` renders; `--check` gates it against its inputs |
| `frontend/src/content/generated-routes.json` | `scripts/build_content_engine.mjs` (`npm run build` runs it first; the pipeline workflows re-run it with their data) | The content engine's output: one entry per hazard methodology page, district outlook and retrospective, with the prose and numbers the pages render | **Yes** — it is what the prerenderer writes into `dist/`, and `--check` fails when it stops matching the committed snapshot + methodology |
| `frontend/public/data/content-index.json` | `frontend/scripts/prerender.mjs` (from the generated routes) | The reviewable inventory of what the build published: route paths, titles, robots directive, sitemap flag, counts, inputs, and any snapshot district the alias map could not match | **Yes** — 8 kB of routing facts instead of the 400 kB of page copy; the site-health probe reads it to check the deployment still serves what the index claims |
| `data/events/hazardnet-events.json` | `python -m etl.cli events --input <raw> --export-json …` (the normalised event export) | The historical archive the district history sections and the retrospectives are built from | **No** — `data/events/.gitignore` keeps it untracked; the archive is compiled from third-party records and is not redistributed (see `data/events/README.md`) |
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
CSV on a feature branch will not run it. The next daily pull then supersedes this
data.

⚠️ The workflow trusts the file: it stamps its own provenance
(`source: kaggle kernels output ashifahmedshuvo/hazardnet-auto-forecast-pipeline`)
on the snapshot regardless of where the CSV actually came from. Upload real
notebook output, not a fixture — anything else will be published as a forecast.
(The GitHub-native producer stamps its own source explicitly, so a snapshot can
never claim a producer that did not make it: `SNAPSHOT_SOURCE`.)

## Lifecycle (daily, pulled from Kaggle — the production path)

The producer is the Kaggle notebook
`ashifahmedshuvo/hazardnet-auto-forecast-pipeline`, on Kaggle's own daily schedule;
`daily_forecast.yml` (00:00 UTC) pulls what it wrote. See
[`docs/adr/0013-kaggle-is-the-forecast-producer.md`](../docs/adr/0013-kaggle-is-the-forecast-producer.md).

1. The preflight writes `~/.kaggle/kaggle.json` from `KAGGLE_USERNAME`/`KAGGLE_KEY`
   and asks Kaggle whether it can see the kernel — a 401, a 403 and a 404 are three
   different owner actions, and the step says which.
2. `scripts/fetch_kaggle_forecast.py` downloads the notebook output into
   `data/kaggle_notebook_output/` (gitignored scratch, uploaded as a run artifact),
   picks the CSV **by name**, bridges the advisory shape onto the canonical row
   schema, and writes `backend/data/forecasts/*.csv|json` + `manifest.json`
   (provenance, sha256, a coverage tally and the promoted model version).
3. `scripts/validate_forecasts.py` gates the promoted artifacts with freshness
   **and** coverage on: a partial day is allowed, an unlabelled one is not.
4. `scripts/fetch_kaggle_dataset_meta.py` also pulls the dataset builder's
   `normalization_stats.json` + `dataset_config.json` into `data/kaggle/dataset-meta/`
   and reports how far they have drifted from the normalization the shipped model was
   trained with. Advisory (`continue-on-error`): a Kaggle-side gap must not cost the
   day's forecast its commit.
5. Store ingest (when `BACKEND_API_KEY` is set) → alert engine →
   `build_alert_snapshot.mjs` / `build_forecast_snapshot.mjs` /
   `build_freshness_artifact.mjs` → content rebuild.
6. The workflow commits `backend/data/forecasts/`, `frontend/public/data/` and
   `data/kaggle/dataset-meta/`, so the site redeploys with the new data.

`scripts/auto_forecast.py` (the runner-side GEE + Open-Meteo + TFLite generator) is
still in the repository and still tested, but no schedule invokes it: it is the offline
fallback for a Kaggle outage, and it needs `EE_SERVICE_ACCOUNT_JSON`, which is no longer
part of the daily path.

## Lifecycle (dispatch-only)

`forecast-pipeline.yml` triggers the notebook, waits for it and pulls the result — use it
after changing the notebook, when you want today's rows from the new code rather than
waiting for Kaggle's schedule. `weekly_forecast.yml` is the heavy weekly run (ADM3/507
units, OSM exposure overlay) and the patch release around it. Both need a valid token and
a runnable kernel, which is why neither is scheduled: a dispatch failure is read by the
person who clicked the button.

## Local development

- Run `python scripts/fetch_kaggle_forecast.py --help` for fetch options.
- `backend/data/forecasts/` and `data/kaggle_notebook_output/` are safe to
  delete at any time — the next pipeline run recreates them.
- `uploads/` (repo root, multer landing dir for `POST /update`) is likewise
  runtime scratch and gitignored.

## Further reading

- `docs/ops/kaggle-pipeline-triage.md` — the decision table behind a red pull.
- `docs/adr/0013-kaggle-is-the-forecast-producer.md` — one producer, and what the
  pull may and may not write.
- `docs/adr/0008-hourly-refresh-snapshot-fallback.md` — why two paths (API +
  committed snapshot) exist; its cadence half is superseded by ADR 0013.
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

Invariants the builder enforces (tested in `__tests__/alertSnapshot.test.js` and
`scripts/tests/test_frontend_alert_surface.py`):

1. only `PUBLISHED` rows reach the file, and every row carries the §1.7 disclaimer;
2. an empty run **cannot** replace a non-empty snapshot unless `--allow-empty` is passed —
   a failed pipeline must not silently become "no alerts today";
3. a payload with no recognisable alert list (`published_alerts`, `alerts` or
   `batch.alerts`) exits 2 and writes nothing — an integration error is not a quiet day.
   The first version of the CI wiring tripped this: the workflow called
   `/api/v1/alerts/run` without `include_alerts: true`, the route strips the row list, and
   every night would have produced an empty snapshot.

The committed file carries two different counters, and they are not interchangeable:
`counts.dropped_unpublished` is list-local (rows in the payload that were not `PUBLISHED`),
while `counts.not_published` is the engine's own tally of rows it assessed but could not
publish (blocked / pending review / held). Today the file has
`dropped_unpublished: 0` and `not_published: 74` — the correct reading of "74 rows assessed,
0 published" — and that is the number the page prints.
