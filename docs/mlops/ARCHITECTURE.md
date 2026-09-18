# HazardNet MLOps Architecture (Two-Profile Split)

This document describes how HazardNet decouples **everyday inference** (cheap, frequent, CPU) from **model retraining** (expensive, infrequent, GPU) so the entire pipeline runs on zero-cost infrastructure.

```
                          ┌──────────────────────────────┐
                          │  Google Colab (free T4 GPU)  │
                          │  ml/train_and_convert.ipynb  │
                          │  ~3 h, once/month or quarter │
                          └──────────────┬───────────────┘
                                         │ git push (PR → main)
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

## Profile 2 — Training & Conversion (GPU)

| | |
|---|---|
| **Where** | Google Colab (Free Tier) — `ml/train_and_convert.ipynb` |
| **Cadence** | Manual, once per month/quarter |
| **Hardware** | NVIDIA T4 GPU (16 GB VRAM), same as Kaggle |
| **Runtime** | ~3 hours |
| **Cost** | Free (Colab Free Tier) |
| **Output** | `Models/hazardnet_fp32.tflite` + `Models/normalization_stats.json` + `Models/labels.json` |

### Dataset hosting (zero-cost options)

1. **Google Drive** (simplest): mount with `from google.colab import drive; drive.mount('/content/drive')` and copy from Drive. The first `wget`/copy happens once; subsequent runs are instant.
2. **HuggingFace Datasets**: host the `master_tensors.h5` file (hundreds of GB free) and pull with `wget <hf raw URL>`.

### Auto-push to GitHub

The notebook's final cell:

1. Configures git identity.
2. Shallow-clones `myself-aas/HazardNet` using a Fine-Grained Personal Access Token.
3. Copies the new `Models/` bundle in.
4. Creates a branch named `auto-ml/model-update-<timestamp>`, commits, pushes, and opens a Pull Request against `main` via the GitHub REST API.

Using a PR (instead of a direct push to `main`) gives CI (`model-validation.yml`) a chance to smoke-test the new artifact before it becomes the production model.

> To skip the PR flow and push directly to `main`, replace the branch/push cell with `!git checkout main && !git push origin main`.

## Why this is better than the all-Kaggle setup

> Acted on 2026-09-16: the Kaggle schedulers are off. What follows is the
> original rationale — now the state of the repository rather than the plan.

* **CI/CD decoupling.** Your GitHub repository is the single source of truth. The web app pulls models from Git; GitHub Actions runs the cron jobs. No dependency on Kaggle's notebook scheduler or uptime.
* **Cold-start speed.** Stripping TF/PyTorch from the operational pipeline cuts install time from ~4 minutes to ~45 seconds.
* **No file wrangling.** Models flow Colab → GitHub PR → merge → daily Action automatically. Data flows GEE/Open-Meteo → Actions → Firestore automatically.
* **Safer promotion.** New TFLite models are validated by CI before hitting production.
* **Zero cost.** No cloud GPU, no Actions minutes overage, no Kaggle dataset quotas.

## Operational playbook

### To retrain the model

1. Open [`ml/train_and_convert.ipynb`](../../ml/train_and_convert.ipynb) in Colab (GitHub → Open in Colab).
2. Runtime → Change runtime type → **GPU (T4)**.
3. Run all cells. Paste your GitHub PAT when prompted.
4. Wait for the PR to appear on GitHub.
5. Review the diff (should only touch `Models/*`), wait for the `model-validation` check to pass, then merge.
6. The next 00:00 UTC daily run automatically uses the new model.

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
