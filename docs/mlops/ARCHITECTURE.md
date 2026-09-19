# HazardNet MLOps Architecture (Kaggle produces, GitHub pulls)

Two profiles, one direction of travel. **Everyday inference** happens on Kaggle, where
the notebooks, the Earth Engine token and the trained model already live; GitHub Actions
pulls the result, validates it, publishes it and commits it. **Model retraining** happens
on a Colab T4 once a month, driven by a person, and lands as a pull request that CI gates
and a human merges. Nothing in `.github/workflows/` trains a model or generates a forecast.

Decided in [ADR 0013](../adr/0013-kaggle-is-the-forecast-producer.md) (2026-09-20),
reversing the 2026-09-16 "the runner is the producer" arrangement and deleting the Colab
automation that never worked.

```
  KAGGLE — four notebooks on Kaggle's own daily schedule
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 1-hazardnet-bgd-climatic-hazards  →  3-hazardnet-with-severity         │
  │        →  4-hazardnet-dataset-builder                                  │
  │              publishes the `hazardnet-datasets` dataset:               │
  │              master_tensors.h5 · normalization_stats.json ·            │
  │              dataset_config.json · fold CSVs                           │
  │        →  hazardnet-auto-forecast-pipeline                             │
  │              reads that dataset + the `hazardnet-model-conversion`     │
  │              bundle + the `ee-token-json` EE key, and writes           │
  │              hazardnet_advisories_latest.csv (64 districts × 7/15 d)   │
  └───────────────────────────┬───────────────────────┬────────────────────┘
                              │ kaggle kernels output │ kaggle datasets download -f
                              ▼                       ▼
  GITHUB ACTIONS — daily_forecast.yml (0 0 * * * UTC, ~6 min)
  ┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
  │ fetch_kaggle_forecast.py             │  │ fetch_kaggle_dataset_meta.py         │
  │  advisory shape → canonical row      │  │  normalization_stats.json +          │
  │  identity from the published artifact│  │  dataset_config.json →               │
  │  ∪ git HEAD ∪ the 64-district        │  │  data/kaggle/dataset-meta/           │
  │  snapshot                            │  │  + a drift report against the        │
  │  prediction_date = target − horizon  │  │  normalization the MODEL shipped with│
  │  coverage tally + model provenance   │  │  (continue-on-error: advisory)       │
  └───────────────┬──────────────────────┘  └──────────────────────────────────────┘
                  ▼
  validate_forecasts.py (schema · hazards · bounds · freshness · coverage)
                  ▼
  store ingest (optional) → alert engine → alert + forecast snapshots
                  ▼
  commit backend/data/forecasts/* · frontend/public/data/* · data/kaggle/dataset-meta/*
                  ▼
        Production (Vercel / Supabase / Firestore) redeploys carrying the new data

  COLAB T4 — monthly, a person at the keyboard
  ┌────────────────────────────────────────────────────────────────────────┐
  │ ml/HazardNet_auto_train.ipynb                                          │
  │  reads master_tensors.h5 from Drive or from `hazardnet-datasets`       │
  │  event_kfold training → ONNX → TFLite + a golden parity gate           │
  │  writes run_manifest.json, then the last cell:                         │
  │   stage Models/ → write_version_handshake → getpass PAT →              │
  │   GitHub API (blobs · tree · commit · ref · pull request)              │
  └───────────────────────────────┬────────────────────────────────────────┘
                                  ▼
        model_intake.yml gates the PR (bundle · manifest · handshake currency ·
        TFLite smoke test · promote dry run) and comments. A human merges.
                                  ▼
                    Models/hazardnet_fp32.tflite + VERSION.json + REGISTRY.json
                    ⚠ the Kaggle notebook still loads its model from the
                      `hazardnet-model-conversion` output — refreshing that is a
                      separate owner step (see "To retrain the model" below).
```

## Profile 1 — Daily forecast pull (CPU, ~6 minutes)

| | |
|---|---|
| **Where** | GitHub Actions: `.github/workflows/daily_forecast.yml` |
| **Schedule** | `0 0 * * *` UTC (06:00 Bangladesh) + `workflow_dispatch` |
| **Runtime** | `ubuntu-latest` · Python 3.11 · Node 20 |
| **Producer** | the Kaggle notebook `ashifahmedshuvo/hazardnet-auto-forecast-pipeline`, on Kaggle's schedule |
| **Scripts** | `scripts/fetch_kaggle_forecast.py`, `scripts/fetch_kaggle_dataset_meta.py`, `scripts/validate_forecasts.py`, `scripts/build_forecast_snapshot.mjs` |
| **Dependencies** | `scripts/requirements-pipeline.txt` (kaggle CLI 1.8.x, pandas) + `npm ci` for the snapshot and content builders |
| **Secrets** | `KAGGLE_USERNAME`, `KAGGLE_KEY`; optionally `BACKEND_API_KEY`/`HAZARDNET_API_*` for the store ingest |

### What the run does, in order

1. **Preflight.** Writes `~/.kaggle/kaggle.json` (0600) from the two secrets and asks
   `kaggle kernels status` whether the kernel is visible. A 401, a 403 and a 404 are three
   different owner actions — rotate the token, fix the notebook's ownership, repoint the
   `KAGGLE_KERNEL` repository variable — and the preflight says which one instead of
   letting the CLI die with a bare exit code mid-pipeline.
2. **Pull.** `kaggle kernels output` into `data/kaggle_notebook_output/` (gitignored,
   uploaded as a run artifact). The CSV to publish is chosen **by name** —
   `hazardnet_forecasts_latest.csv`, then `hazardnet_advisories_latest.csv`, then a lone
   `*.csv` — and two unrecognised CSVs is a hard failure: glob order once decided which
   file became the day's forecast.
3. **Bridge the shape.** See below.
4. **Validate.** `scripts/validate_forecasts.py` with both gates on: freshness
   (`prediction_date` within three days) and coverage (the manifest's tally against the
   rows). A partial day is allowed; an unlabelled one is not.
5. **Dataset metadata.** `scripts/fetch_kaggle_dataset_meta.py` pulls
   `normalization_stats.json` and `dataset_config.json` from `hazardnet-datasets` into
   `data/kaggle/dataset-meta/`, validates their shape, and reports drift against
   `Models/normalization_stats.json`. `continue-on-error`: a Kaggle-side gap must not cost
   the day's forecast its commit.
6. **Publish.** Store ingest (guarded on `BACKEND_API_KEY`) → alert engine → alert and
   forecast snapshots → content rebuild → commit → run summary with the age of the rows.

### The shape bridge

The producer writes an **advisory** table; the repository's artifact, validator, ingest
path and website snapshot all expect the **canonical** row. The bridge is
`scripts/fetch_kaggle_forecast.py`, and its rule is that anything it cannot derive from
real data is left empty rather than invented.

| canonical | from the advisory table | note |
|---|---|---|
| `district_name` | `district` | the producer's own spelling (FAO GAUL 2015) |
| `district_id`, `pcode`, `division` | the identity table | see below |
| `hazard_type` | `hazard` | must be one of the 8 model classes |
| `model_severity` | `cnn_severity` | |
| `physics_severity`, `confidence` | same names | |
| `target_date` | `target_date` | |
| `prediction_date` | **derived** | `target_date − horizon_days`, cross-checked across every row; rows that disagree fail the run |
| `data_source` | **set** | `Kaggle_Advisory_Pipeline` |
| `om_max_temp_k`, `om_min_temp_k` | `om_*_temp_c` + 273.15 | conversions, not guesses |
| `om_precip_m` | `om_precip_mm` / 1000 | |
| `om_wind_max_ms` | `om_wind_kmh` / 3.6 | |
| `om_dewpoint_k`, `om_solar_rad_j`, `om_et_sum_m`, `dewpoint_mean`, `solar_radiation_mj_m2`, `evapotranspiration_mm` | **empty** | the notebook does not fetch them; empty becomes `null` in the JSON sidecar, never `0.0` |
| `final_severity`, `advisory_tier` | **manifest only** | the notebook's editorial blend; no canonical column exists for it and inventing one would put an unvalidated severity into the website's data path |

**The identity table.** `district_id` and `pcode` are real identifiers, so they come from
real records, in three layers:

1. the last published canonical artifact (`backend/data/forecasts/hazardnet_forecasts_latest.csv`);
2. `git show HEAD:` of the same file — a floor, so a day when the producer reports fewer
   districts cannot erode the table and lose them permanently;
3. `scripts/etl/districts.py`, the repository's tested 64-district snapshot, which supplies
   pcode and division for whatever the artifact lacks, and whose `resolve()` maps GAUL
   spellings ("Chittagong", "Jessore") onto the current ones ("Chattogram", "Jashore").

Layer 3 also supplies `district_id` for those districts, by the rule both producers already
follow — enumerate FAO GAUL ADM2 sorted by name, number from 1 — and that rule is **checked
against every published id before it is used for a single new one**. When it does not
reproduce them, the derivation is refused and the rows are dropped and reported instead.
This matters concretely: on 2026-09-19 the published artifact carried 60 of the 64
districts, because the runner-side generator had dropped Bandarban, Barisal, Jhenaidah and
Khagrachhari. Without layer 3 a faithful 64-row pull would have published 60 forever, with
the gap reported as "unmatchable" rather than as a hole.

A district that still cannot be identified is **dropped and reported** — never matched by
fuzzy name, because the alternative is one district wearing another district's pcode.

### The payload boundary

Pulled daily: the forecast CSV, its JSON sidecar, the manifest, and two kilobyte-scale
dataset documents. **Not** pulled: `master_tensors.h5` (hundreds of megabytes; the training
notebook reads it straight from the Kaggle dataset) and anything under `Models/` — model
artifacts arrive through the monthly pull request and its gate, never through a data pull.
`scripts/tests/test_workflows.py` fails a workflow that writes `Models/` from the daily job.

### The generator that is no longer scheduled

`scripts/auto_forecast.py` (Earth Engine + Open-Meteo + TFLite, ~19 min) is still in the
repository, still tested, and still runnable by hand — it is the offline fallback for a
Kaggle outage. It needs `EE_SERVICE_ACCOUNT_JSON`, which is why it is not on the schedule:
when that key rotated, the scheduled run died one minute in with a bare traceback while the
site kept serving the last committed snapshot. No workflow invokes it any more, and
`test_workflows.py` fails if one does.

### Guard-rails

* The preflight maps Kaggle's 401/403/404 onto named remedies, and never prints a
  credential (the only expansion allowed is the write into `~/.kaggle/kaggle.json`).
* `validate_forecasts.py` runs with freshness **and** coverage on.
* `model-validation.yml` smoke-tests the TFLite bundle on every change to `Models/**`.
* Workflow hygiene invariants (permissions, concurrency, timeouts, action versions, shell
  syntax of every `run:` block, no `secrets` in `if:`) are enforced by
  `scripts/tests/test_workflows.py`; the pull's own refusals by
  `scripts/tests/test_kaggle_forecast_fetch.py` and `test_kaggle_dataset_meta.py`.

## Profile 2 — Monthly training & conversion (GPU, human-driven)

| | |
|---|---|
| **Where** | Google Colab (free T4) — [`ml/HazardNet_auto_train.ipynb`](../../ml/HazardNet_auto_train.ipynb) |
| **Cadence** | Monthly, started by the owner |
| **Runtime** | 7–9 h for 50 epochs under `event_kfold`, across as many sessions as the free tier allows |
| **Cost** | Free (Colab free tier); a few runner-minutes for the PR gate |
| **Output** | a pull request touching `Models/*` + `data/mlops/bundles/<run_id>/run_manifest.json`, opened by the notebook and merged by a human |
| **Credentials** | a fine-grained PAT typed into a `getpass` prompt in the last cell; `~/.kaggle/kaggle.json` only if Drive has no tensor |

### Why it is manual

The automated version existed for three weeks in September 2026 and never worked. Colab
exposes no non-interactive session: `colab auth` and `drivemount` need a TTY and browser
consent, and a free-tier session can be recycled at any moment. The chain was a launcher
that provisioned a VM, a watcher on a twenty-minute cron that followed a run marker through
git, and a collector that pulled the bundle over SSH — three workflows and two Python
modules whose only observed behaviour was failing. All of it is deleted, and
`scripts/tests/test_workflows.py` fails if any of it returns.

What survives from that design is the part that was actually valuable: the **schemas**.
`scripts/mlops/retrain_state.py` still defines the run manifest, the artifact inventory,
the resume-state contract and the version handshake, and the notebook still imports it
inside Colab — one definition, two machines, so the notebook cannot claim a version the PR
gate will not reproduce.

### Surviving a recycled session

Free-tier sessions die mid-epoch, so the notebook writes two files per epoch:

* `<fold>_resume.pt` — model, optimizer, cosine scheduler, both RNGs, best-val state and
  the epoch reached. A restart restores all of it and continues the fold; restoring weights
  alone would silently restart the learning-rate schedule and converge to something nobody
  validated. A fold deletes its own resume state when it finishes, so a completed fold
  cannot be "resumed" and reported twice.
* `heartbeat.json` — phase, fold, epoch, validation loss and accuracy. No watcher reads it
  now; it is the run's own diary, and an eight-hour run that dies in fold four should leave
  a record of how far it got on a disk that outlives the session.

Mount Drive when you run it: checkpoints and the published bundle then survive a recycle on
their own. Without a mount they live on the VM, and the last cell has to run before the VM
is recycled.

The training tensor is resolved in the order that survives the most situations: a path in
`run_config.json`, then Drive
(`HazardNet_Deployment/tensors_output/HazardNet_Event_Based_Datasets/master_tensors.h5`),
then a download of the `hazardnet-datasets` Kaggle dataset. Once local it stays local —
reading 5 GB of HDF5 batch by batch through a FUSE mount is the slowest way to feed a GPU.

### What the run publishes

The publishing cell writes `run_manifest.json`: every artifact with its size and sha256,
the fold metrics the training actually returned, the converter's ONNX→TFLite parity
numbers, and the environment that produced them. It validates that manifest with the same
function the PR gate uses and refuses to publish one it would reject — failing in the
session, where the log can be read, rather than hours later in a pull request nobody can
act on.

The parity gate is `retrain_state.PARITY_GATE_PCT` (99.0% hazard agreement between PyTorch
and TFLite) and it **stops the run**. It used to print `[WARN] BELOW 95% THRESHOLD` and
carry on, which published a conversion that had changed the model's predictions. A
conversion that changes predictions is not a conversion.

### The pull request the notebook opens

The last cell stages the five contract artifacts into the shallow clone, writes
`Models/VERSION.json` and `Models/REGISTRY.json` through
`retrain_state.write_version_handshake` and `mlops.cli registry --write` (the repository's
canonical writers), prompts for a fine-grained PAT with `getpass`, and creates blobs, a
tree, a commit, a ref and a pull request over the GitHub API.

The API rather than `git push` because a push needs the token inside a remote URL, and git
copies remote URLs into `.git/config` — a credential at rest, on a VM whose lifetime nobody
controls. The token is asked for once, in the last cell, used for those calls, cleared, and
never written to a file, a remote or an output cell. `scripts/tests/test_retrain_notebook.py`
pins all of it: the prompt exists in exactly one cell, and no cell pushes, merges or
promotes.

Two writers produce `Models/VERSION.json` — Node (`scripts/gen-model-version.mjs`) in CI and
Python on the VM, where there is no Node.js. `scripts/tests/test_model_handshake.py` runs
both over identical bytes and fails if the version strings, artifact entries or key order
differ, and it also fails if the committed handshake does not match the committed artifacts.

### What CI does with the PR

`model_intake.yml` triggers on `Models/**` and:

1. records what the PR changed under `Models/`, with sizes and sha256s;
2. runs `scripts/validate_model_bundle.py` — the same validator `model-validation.yml` runs;
3. validates `run_manifest.json` with `retrain_state.validate_manifest` and prints the fold
   metrics, the parity numbers and the artifact table into the report (and says loudly when
   the PR carries no manifest, because then the run's claims are unverifiable);
4. regenerates `VERSION.json` and `REGISTRY.json` from the PR's own bytes and **fails if they
   differ** — reporting rather than repairing, because a silently fixed handshake hides a
   notebook that stopped writing one;
5. smoke-tests every `.tflite` under `tflite-runtime==2.14.0` (the wheel the API loads, and
   the pins `model-validation.yml` uses — a test asserts the two files agree);
6. runs `mlops.cli evaluate` + `mlops.cli promote` **without `--write`** and prints the
   decision, labelled as a preview and not a sign-off;
7. comments all of it on the PR and stops.

It never merges, never pushes, never records a champion. Merging is the review; promotion is
a second act that needs `python -m mlops.cli promote --artifact hazardnet_fp32.tflite
--report <evaluation.json> --by <you> --write`.

## Why one producer

* **One artifact, one writer.** Two producers for `hazardnet_forecasts_latest.csv` meant
  whichever job ran last decided what the website served, with different schemas and
  different district sets, and no way to say which one a given day came from except a
  `data_source` string nobody validated.
* **The fragile credential stays where the work is.** The Earth Engine key lives in Kaggle
  (the `ee-token-json` dataset), not in GitHub secrets, so its rotation cannot kill the
  scheduled run.
* **The promotion decision is visible.** It was never automatable; the automation only hid
  who makes it. Now it is a PR a person reads, with the fold metrics and parity numbers in
  the body and a gate comment underneath.
* **Zero cost.** No cloud GPU, no Actions minutes overage, no paid Kaggle tier.

The accepted cost: the site's freshness now depends on a third-party scheduler. If the
Kaggle notebooks do not run, the pull publishes the previous run's rows; the freshness gate
fails the run once `prediction_date` is more than three days old, and the run summary
reports the age of the rows it committed.

## Operational playbook

### To retrain the model

1. Open [`ml/HazardNet_auto_train.ipynb`](../../ml/HazardNet_auto_train.ipynb) in Colab with
   a T4 runtime. Mount Drive when prompted (or decline and rely on the Kaggle tensor
   download).
2. Run the cells in order. Watch the fold metrics and the conversion parity numbers; the
   notebook stops the run if parity is below 99%.
3. Run the last cell. It stages the bundle, writes the handshake, asks for a fine-grained
   PAT (**Contents: read/write** and **Pull requests: read/write** on this repository only)
   and opens the pull request.
4. Read the `Model Bundle PR Gate` comment on the PR, review the diff (it should touch only
   `Models/*` and `data/mlops/bundles/<run_id>/`), wait for `model-validation`, and merge.
5. **Refresh the Kaggle model output.** The forecast notebook loads
   `/kaggle/input/notebooks/ashifahmedshuvo/hazardnet-model-conversion/.../hazardnet_fp32.tflite`,
   so merging alone changes nothing about what Kaggle infers with. Re-run (or re-upload)
   the `hazardnet-model-conversion` notebook so its output carries the new bundle, and check
   the daily pull's manifest `model_version` against the bundle you published. Until that
   step, the site is served by the previous model — which is why the manifest says
   `model_bytes_verified: false` rather than claiming a version it cannot check.
6. Optionally promote: `cd scripts && python -m mlops.cli evaluate … && python -m mlops.cli
   promote --artifact hazardnet_fp32.tflite --report <evaluation.json> --by <you> --write`.

Full detail and failure triage: [`RETRAIN_AND_PROMOTION.md`](RETRAIN_AND_PROMOTION.md).

### When the daily pull fails

Read the run summary first — it names the shape, the row and district counts, the derived
`prediction_date`, the coverage verdict and any dropped districts. Then
[`docs/ops/kaggle-pipeline-triage.md`](../ops/kaggle-pipeline-triage.md), which maps each
failure onto an owner action. The two most common:

* **preflight 401/403/404** — a rotated Kaggle token, a notebook owned by another account,
  or a renamed slug (fix with the `KAGGLE_KERNEL` repository variable, no code change);
* **freshness gate** — the Kaggle notebooks did not run; the site is still serving the last
  committed snapshot, which is now more than three days old.

### To verify everything is wired up

1. `Actions → Verify GitHub Actions Secrets` — `KAGGLE_USERNAME` and `KAGGLE_KEY` are the
   ones the forecast path requires; `EE_SERVICE_ACCOUNT_JSON` is no longer in it.
2. `Actions → HazardNet Daily Forecast Pipeline → Run workflow` and confirm the summary
   reports the shape, the district count and the coverage verdict.
3. Check the committed artifact carries today's `prediction_date`
   (`jq -r .prediction_date frontend/public/data/forecasts-latest.json`).
4. Check the dataset-metadata step committed `data/kaggle/dataset-meta/` and read its drift
   report — a growing delta between the dataset's normalization and the shipped model's is
   the signal that the model is due for its monthly run.

## Rollback

If a new model produces bad forecasts, revert the merge commit on `main` — and revert the
Kaggle `hazardnet-model-conversion` output to the previous bundle, because that is what the
producer actually loads. If a daily pull publishes bad rows, revert the data commit; the
site redeploys from the committed snapshot, and the next scheduled pull overwrites it.
