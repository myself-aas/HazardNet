# HazardNet MLOps Architecture (Two-Profile Split)

This document describes how HazardNet decouples **everyday inference** (cheap, frequent, CPU) from **model retraining** (expensive, infrequent, GPU) so the entire pipeline runs on zero-cost infrastructure.

```
   model_retrain.yml (monthly, ~5 min)      Google Colab — free T4
   ┌────────────────────────────────┐      ┌──────────────────────────────────┐
   │ colab new --gpu T4             │─────▶│ ml/HazardNet_auto_train.ipynb    │
   │ upload notebook + run_config   │      │ launched detached, 7–9 h         │
   │ launch over `colab ssh`, exit  │      │ checkpoints + heartbeat + bundle │
   └────────────────┬───────────────┘      └───────────┬───────────────┬──────┘
                    │ commits                          │               │ mirrored to
                    ▼                                  │               ▼ Google Drive
   ┌────────────────────────────────┐                  │   (survives a recycled session)
   │ data/mlops/retrain-runs/<id>.json│◀─── heartbeat ──┘
   │  the run marker: git is how a   │
   │  run that outlives every job    │      model_retrain_watch.yml (every 20 min)
   │  keeps one history              │      status · classify · carry the newest
   └────────────────┬───────────────┘      checkpoint out to a workflow artifact ·
                    │                      relaunch with resume · release the VM
                    │
                    ▼  reads a marker whose status is `complete`
   ┌────────────────────────────────────────────────────┐
   │ model_intake.yml — `colab download` the bundle,    │
   │ validate it against its manifest, smoke-test it    │
   │ with tflite-runtime, regenerate VERSION.json,      │
   │ rebuild REGISTRY.json, open a pull request         │
   └───────────────────────────┬────────────────────────┘
                               │ a human reviews and merges
                               ▼
                         ┌───────────────────────────────┐
                         │        GitHub repository       │
                         │  Models/hazardnet_fp32.tflite  │
                         │  Models/normalization_stats.jsn│
                         └──────────────┬────────────────┘
                                        │ checkout on schedule
                                        ▼
            ┌─────────────────────────────────────────────────────────┐
            │  GitHub Actions — daily_forecast.yml (ubuntu-latest)   │
            │  • Python 3.11, tflite-runtime (~2 MB), cv2 headless   │
            │  • ~19 min wall-time, ~45 s pip install               │
            │  • GEE imagery + Open-Meteo forecasts → TFLite infer   │
            │  • POST CSV → https://hazardnet.live/api/v1/forecast…  │
            └──────────────────────────────┬──────────────────────────┘
                                           │ Bearer-authenticated POST
                                           ▼
                                 ┌─────────────────────┐
                                 │ Production (Vercel / │
                                 │ Supabase / Firestore)│
                                 └─────────────────────┘
```

## Profile 1 — Daily Auto-Forecast (CPU)

> **2026-09-16 — this is now the ONLY scheduled forecast producer.** The three
> Kaggle-backed workflows (`forecast-pipeline`, `hourly_forecast`, `weekly_forecast`)
> were retired from the schedule and are `workflow_dispatch`-only legacy: they
> need a valid Kaggle token *and* a runnable kernel, and after the token rotation
> every scheduled run failed at the first Kaggle call with a bare `exit code 1`.
> Nothing in the forecast path needed Kaggle any more — this job generates the
> forecasts itself. See
> [`docs/audits/2026-09-15-ci-backend-tests-and-workflow-green.md`](../audits/2026-09-15-ci-backend-tests-and-workflow-green.md).

| | |
|---|---|
| **Where** | GitHub Actions: `.github/workflows/daily_forecast.yml` |
| **Schedule** | `0 0 * * *` UTC (midnight) + `workflow_dispatch` |
| **Runtime** | `ubuntu-latest` · 2-core CPU · 7 GB RAM · 6 h job limit |
| **Wall-time** | ~19 minutes |
| **Cost** | Free (unlimited minutes for public repos; private repos have 2,000 min/month) |
| **Script** | `scripts/auto_forecast.py` |
| **Dependencies** | `scripts/requirements-inference.txt` |

### How the dependencies stay small

The daily job **does not** install TensorFlow (~500 MB) or PyTorch (~2 GB):

| Heavy package | Replaced by | Savings |
|---|---|---|
| `tensorflow` | `tflite-runtime` (~2 MB) | ~500 MB install, ~1.5 GB RAM at runtime |
| `torch.nn.functional.interpolate` | `cv2.resize` (`opencv-python-headless`) | ~2 GB install |
| `geopandas` (unused import) | removed | ~100 MB of GDAL/SHAPELY wheels |

A cold-start pip install now takes ~45 seconds instead of ~4 minutes.

### Inputs (GitHub Actions Secrets)

| Secret | Purpose | Required? |
|---|---|---|
| `EE_SERVICE_ACCOUNT_JSON` | Google Earth Engine service-account key — the satellite data source, so this one is unavoidable | **yes** |
| `HAZARDNET_API_URL` | Ingest endpoint (e.g. `https://hazardnet.live/api/v1/forecasts/update`) | only with `PUSH_TO_API=true` |
| `HAZARDNET_API_KEY` | Bearer token for the ingest endpoint | only with `PUSH_TO_API=true` |

No Kaggle credential is needed anywhere in this path.

### Output — one chain, three artifacts

`scripts/auto_forecast.py` writes `hazardnet_forecasts_latest.csv` into the
workspace; the job then runs the same steps the website depends on:

1. `scripts/publish_forecast_csv.py` → `backend/data/forecasts/hazardnet_forecasts_latest.{csv,json}`
   + `manifest.json` (provenance, row count, sha256);
2. `scripts/validate_forecasts.py` → schema/hazard/bounds gate;
3. `scripts/build_forecast_snapshot.mjs` → `frontend/public/data/forecasts-latest.json`
   (the bundle-carried snapshot `useForecasts()` falls back to);
4. **commit** of 1–3 on the branch → the site redeploys carrying the new data.

The store write is the optional 5th step: with the repository variable
`PUSH_TO_API=true`, the CSV is POSTed to `POST $HAZARDNET_API_URL` with
`Authorization: Bearer $HAZARDNET_API_KEY` and `Content-Type: text/csv`, and the
server upserts rows into Firestore/Supabase. It ships **off** by default because
the production deployment does not serve an ingest API yet
(`/api/v1/forecasts/*` → 404, see [`docs/ops/owner-actions.md`](../ops/owner-actions.md) §2a-bis) —
so the committed snapshot is the delivery path that always works. Once an API is
deployed, set the variable and the push becomes a hard gate.

### Guard-rails

* The workflow has a preflight step that checks all three secrets are present and that `HAZARDNET_API_URL` starts with `http(s)://` — failures produce an actionable `::error::` annotation instead of a Python traceback.
* A separate `.github/workflows/model-validation.yml` workflow runs on every change to `Models/**` and smoke-tests the TFLite bundle with `tflite-runtime` (same wheel the daily job uses), so a bad conversion from Colab cannot land silently.
* All workflow hygiene invariants (permissions, concurrency, timeouts, action version consistency) are enforced by `scripts/tests/test_workflows.py` in CI.

## Profile 2 — Training & Conversion (GPU, unattended)

| | |
|---|---|
| **Where** | Google Colab (Free Tier) — [`ml/HazardNet_auto_train.ipynb`](../../ml/HazardNet_auto_train.ipynb) |
| **Cadence** | Monthly, by cron: `model_retrain.yml` at 18:00 UTC on the 1st (00:00 BDT on the 2nd) |
| **Hardware** | NVIDIA T4 (16 GB VRAM), requested with `colab new --gpu T4` |
| **Runtime** | 7–9 h for 50 epochs under `event_kfold`, spread over as many sessions as the free tier allows |
| **Cost** | Free (Colab Free Tier) + a few runner-minutes a month |
| **Output** | a pull request touching `Models/*`, opened by `model_intake.yml` and merged by a human |
| **Setup** | one repository secret — see [`COLAB_AUTOMATION.md`](COLAB_AUTOMATION.md) |

### Why three workflows and not one

Training takes longer than a GitHub-hosted job is allowed to exist: the runner is killed at
six hours, and a Colab free-tier session is recycled whenever Google decides, without telling
anybody. So the run is split into three short jobs that pass state through two durable places
— git for the run's history, Drive for its bytes:

| Workflow | Cadence | Job length | What it does |
|---|---|---|---|
| `model_retrain.yml` | monthly cron + dispatch | ~5 min | provisions a T4, uploads the notebook and its `run_config.json`, launches it **detached** over `colab ssh`, commits the run marker |
| `model_retrain_watch.yml` | every 20 min | ~2 min | re-attaches to the session (which refreshes the CLI's keep-alive), reads the heartbeat, and either leaves a live run alone, relaunches a dead one with `resume: true`, releases the VM on completion, or gives up with a reason |
| `model_intake.yml` | hourly + dispatch | ~10 min | downloads the bundle, validates it against its manifest, smoke-tests it with the same pins `model-validation.yml` uses, regenerates `Models/VERSION.json` with the repository's canonical writer (`scripts/gen-model-version.mjs`), rebuilds `Models/REGISTRY.json`, opens the pull request |

The handoff between them is `data/mlops/retrain-runs/<run_id>.json`, committed by the launch
and updated by every watch tick. That is what makes the split safe: no job has to stay alive to
remember what happened, and the question "did we retrain this month, and what happened" is
answerable from the repository alone, without a Colab account. Schemas and the state machine
live in [`scripts/mlops/retrain_state.py`](../../scripts/mlops/retrain_state.py), which the
notebook imports *inside Colab* — one definition, two machines.

### Surviving a recycled session

Free-tier sessions die mid-epoch, so the notebook writes two files per epoch:

* `<fold>_resume.pt` — model, optimizer, cosine scheduler, RNGs, best-val state and the epoch
  reached. A relaunched attempt restores all of it and continues the fold. Restoring weights
  alone would silently restart the learning-rate schedule and converge to something nobody
  validated. A fold deletes its own resume state when it finishes, so a completed fold cannot
  be "resumed" and reported twice.
* `heartbeat.json` — phase, fold, epoch, validation loss and accuracy. This is the only signal
  that crosses from the VM to a runner, and it is what lets the watcher tell "inside a long
  epoch" from "the session was recycled forty minutes ago". Those need opposite responses, so
  the thresholds are explicit: 45 min of silence is a dead session, 25 min without a first
  heartbeat is a provisioning failure, 15 h is the budget for one run, three attempts is the
  budget for one month.

**Where those files live is the part that is easy to get wrong.** `colab drivemount` needs a TTY
and browser consent, so a *headless* session — every session Actions launches — has no Google
Drive at all. Checkpoints therefore go to the VM's own disk, and the watcher downloads every
`*_resume.pt` on each tick and uploads it as a workflow artifact, deleting the previous one:
GitHub is the durable store, in the same trust boundary as the rest of the pipeline and with no
third credential. A relaunch fetches that artifact and uploads the states back into the fresh VM
at the same path, which is what makes `resume: true` mean something. An interactive run with
Drive mounted keeps its checkpoints there instead, where they survive on their own.

The same reasoning applies to the finished bundle: the watcher carries it off the VM on the tick
that sees the manifest, because a run that completes and then loses its session ten minutes later
has still done the work.

The training tensor is resolved in the order that survives the most situations — a path Actions
staged, then Drive when it is mounted, then the Kaggle dataset the Drive copy was made from
(using the repository's existing `KAGGLE_USERNAME`/`KAGGLE_KEY`, uploaded to the VM as
`~/.kaggle/kaggle.json`). Once local it stays local: reading 5 GB of HDF5 batch by batch through
a FUSE mount is the slowest way to feed a GPU, and slow epochs are what make a live run look dead
from outside.

### What the run publishes

The notebook's last publishing cell writes `run_manifest.json`: every artifact with its size
and sha256, the fold metrics the training actually returned, the converter's ONNX→TFLite parity
numbers, and the environment that produced them. It validates that manifest with the same
function intake uses, and refuses to publish one it would reject — failing in the session, where
the log can be read, rather than hours later in a pull request nobody can act on.

The parity gate is `retrain_state.PARITY_GATE_PCT` (99.0% hazard agreement between PyTorch and
TFLite) and it now **stops the run**. It used to print `[WARN] BELOW 95% THRESHOLD` and carry on,
which published a conversion that had changed the model's predictions and let the pull request be
the first place anybody noticed. A conversion that changes predictions is not a conversion.

### Credentials

Two secrets: `COLAB_TOKEN_JSON` for the VM, and the `KAGGLE_USERNAME`/`KAGGLE_KEY` the forecast
workflows already use, for the training data. And `COLAB_TOKEN_JSON` first: the contents of `~/.config/colab-cli/token.json` after a human
runs `colab auth` once. Colab quota and Drive belong to a person, so there is no service-account
variant of this — the CLI's `--auth=adc` path has no free-tier GPU allocation to draw on. The
token is written 0600 on the runner, never echoed, and never passed on a command line.

The notebook holds no GitHub credential at all. It used to prompt for a fine-grained PAT with
`getpass` — which makes an unattended run impossible, since a prompt nobody answers hangs until
the session is recycled — and then clone, push and open a PR from inside Colab. All git work now
happens in Actions with `GITHUB_TOKEN`, scoped to one run.

### Dataset hosting

1. **Google Drive** (the supported path): the master tensor lives at
   `HazardNet_Deployment/tensors_output/HazardNet_Event_Based_Datasets/master_tensors.h5`, and the
   notebook's dataset cell downloads from Kaggle only when that file is absent — so an unattended
   run never depends on a `kaggle.json` being present in a Drive folder.
2. **HuggingFace Datasets**: the branch is still there and still refuses to guess a repository
   URL; it says so and exits instead of interpolating a name nothing defines.

## Why this is better than the all-Kaggle setup

> Acted on 2026-09-16: the Kaggle schedulers are off. What follows is the
> original rationale — now the state of the repository rather than the plan.

* **CI/CD decoupling.** Your GitHub repository is the single source of truth. The web app pulls models from Git; GitHub Actions runs the cron jobs. No dependency on Kaggle's notebook scheduler or uptime.
* **Cold-start speed.** Stripping TF/PyTorch from the operational pipeline cuts install time from ~4 minutes to ~45 seconds.
* **No file wrangling.** Models flow Colab → Drive → intake PR → merge → daily Action automatically. Data flows GEE/Open-Meteo → Actions → Firestore automatically.
* **Safer promotion.** New TFLite models are validated by CI before hitting production.
* **Zero cost.** No cloud GPU, no Actions minutes overage, no Kaggle dataset quotas.

## Operational playbook

### To retrain the model

Nothing, normally: `model_retrain.yml` runs on the 1st of each month and
`model_intake.yml` opens the pull request when the run finishes. To do it deliberately:

1. `Actions → Monthly Model Retrain (Colab T4) → Run workflow`, pick the validation
   strategy, and watch the launch (about five minutes — it provisions the T4 and hands
   the notebook to it, then exits).
2. `Actions → Retrain Watcher` follows the run every twenty minutes. Its summary says
   which phase the run is in and, when it relaunches a dead session, that it resumed from
   checkpoints rather than starting over.
3. When the run completes, `Actions → Model Intake` collects the bundle on its next hourly
   tick and opens a pull request whose body carries the fold metrics, the parity numbers,
   the artifact hashes and the proposed `Models/VERSION.json` version.
4. Review the diff (it should touch only `Models/*`), wait for the `model-validation`
   check, and merge. Merging replaces the bundle the daily forecast runs; it does **not**
   promote anything — the artifact enters the registry as a `candidate`, and `champion`
   still needs `python -m mlops.cli promote --by <you>` against a challenger report.
5. The next 00:00 UTC daily run uses the new model.

To run it by hand instead, open the notebook in Colab with a T4 runtime and run all cells:
with no `run_config.json` on the VM it behaves as an interactive run, prints the same
manifest, and touches no GitHub credential. Full setup and failure triage:
[`COLAB_AUTOMATION.md`](COLAB_AUTOMATION.md).

### To verify everything is wired up

1. Run `Actions → Verify GitHub Actions Secrets` to confirm the secrets are
   present — `EE_SERVICE_ACCOUNT_JSON` is the one the forecast path requires.
2. Trigger `Actions → HazardNet Daily Forecast Pipeline → Run workflow` and
   confirm it completes in ~19 minutes (no Kaggle involved at any step).
3. Check that the run committed `backend/data/forecasts/` +
   `frontend/public/data/forecasts-latest.json` with today's `prediction_date`
   (`jq . prediction_date frontend/public/data/forecasts-latest.json`).
4. If `PUSH_TO_API=true`: check `$HAZARDNET_API_URL`'s sibling metadata route for
   a fresh `prediction_date`.

## Rollback

If a new model produces bad forecasts, revert the merge commit on `main` (or roll forward with a hotfix PR). The daily job pulls `Models/hazardnet_fp32.tflite` from the tip of `main` at checkout time, so a revert is effective on the next scheduled run.
