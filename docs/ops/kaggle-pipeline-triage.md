# Kaggle pipeline triage — why a forecast job is red and what to do

Since 2026-09-20 Kaggle is the forecast **producer** and
`.github/workflows/daily_forecast.yml` (00:00 UTC) is the pull that publishes it
([ADR 0013](../adr/0013-kaggle-is-the-forecast-producer.md)). Two dispatch-only
workflows sit around it: `HazardNet Automated Forecast Pipeline` (trigger the
notebook, wait, pull) and `Weekly Forecast Pipeline` (the heavy ADM3/507-unit run
and the patch release).

All three depend on two things the repository does not control: **the Kaggle API
token** and **the notebook's slug**. When either drifts, the job dies at its first
Kaggle call. Since 2026-09-15 those failures are self-describing
(`daily_forecast.yml`'s preflight maps 401/403/404 onto the three different owner
actions they mean; `scripts/kaggle_trigger.py` emits a `::error::` annotation;
`fetch_kaggle_forecast.py` prints the CLI output per attempt) — start with the
failing step's log; this page is the decision table behind it.

## 1. Read the annotation

| Annotation / log line | Meaning | Fix |
|---|---|---|
| `Kaggle rejected the credentials (401/Unauthorized)` | `KAGGLE_USERNAME` / `KAGGLE_KEY` are present but no longer accepted (expired, revoked, or rotated without updating the secret — the preflight only checks *presence*) | Rotate at kaggle.com → avatar → **Settings → API → Create New Token**, update both repo secrets, then run the **Verify GitHub Actions Secrets** workflow |
| `Kernel '<slug>' was not found` (404) | The notebook was renamed, re-uploaded, or deleted — the slug changed | Set the repo **variable** `KAGGLE_KERNEL` (Settings → Secrets and variables → Actions → **Variables**) to the current slug, e.g. `ashifahmedshuvo/hazardnet-auto-forecast-pipeline` |
| `Kaggle returned 403 (Forbidden)` | Token valid but not the owner of that kernel | Make `KAGGLE_USERNAME` match the notebook owner, or fork the notebook under the owning account |
| `Kaggle rate limit / quota hit (429)` | Too many runs / GPU quota window exhausted | Re-run later; check kaggle.com → Settings → Quota |
| `Kernel has never been run` | The kernel exists but has no run to poll or fetch | Run it once from the Kaggle UI. Nothing in CI *starts* a run: `kaggle kernels push` only happens when `kaggle_notebooks/<slug>/kernel-metadata.json` exists in the repo, and that directory is not committed |
| `Timed out waiting for Kaggle kernel …` (22.5 min at the CI defaults: 45 polls × 30 s) | Still queued/running, or silently never started | Open `https://www.kaggle.com/code/<slug>` and look at the run log |
| `KernelWorkerStatus.ERROR` / `CANCEL` / `FAILED` | The notebook itself failed — that log lives on Kaggle | Fix the notebook on Kaggle, re-run, then re-run the workflow |

## 2. Reproduce the Kaggle call locally (no CI needed)

With your own token in `~/.kaggle/kaggle.json` (or `KAGGLE_USERNAME`/`KAGGLE_KEY`
exported):

```bash
kaggle kernels status ashifahmedshuvo/hazardnet-auto-forecast-pipeline   # 'complete' / 'running' / 401 / 404
kaggle kernels list --mine --page-size 30                                # which kernels THIS token can see
kaggle kernels output ashifahmedshuvo/hazardnet-auto-forecast-pipeline -p /tmp/ko   # what the daily job fetches
python scripts/kaggle_trigger.py --kernel <slug> --max-retries 1 --poll-interval 1  # same code path as CI
```

A `401`/`404` from `kernels status` is the same failure CI reports — and it
reproduces in one second, without burning a 150-minute job slot.

## 3. Repoint every pipeline at once

`KAGGLE_KERNEL` is read as
`${{ vars.KAGGLE_KERNEL || 'ashifahmedshuvo/hazardnet-auto-forecast-pipeline' }}`
by `daily_forecast.yml`, `forecast-pipeline.yml` and `weekly_forecast.yml` (the
weekly job's env key is `KERNEL_SLUG`). The daily job also reads
`KAGGLE_BUILDER_KERNEL` (`ashifahmedshuvo/4-hazardnet-dataset-builder`) and
`KAGGLE_DATASET` (`ashifahmedshuvo/hazardnet-datasets`) for its metadata pull,
both as variables with the same fallback shape. Setting a **variable** overrides
them all; unsetting it falls back to the committed default. No code change, no PR,
no re-merge.

```bash
# what is it set to right now?
gh variable list --repo myself-aas/HazardNet
gh variable set KAGGLE_KERNEL --repo myself-aas/HazardNet --body 'owner/notebook-slug'
```

## 4. When the pull succeeds but the run is still red

Those failures come from the bridge in `scripts/fetch_kaggle_forecast.py`, and each
one is a refusal rather than a guess — the log names what it refused and why.

| Log line | Meaning | Fix |
|---|---|---|
| `the kernel output carries 2 CSVs … and none of them is a name this pipeline knows` | The notebook wrote a second CSV (a debug dump, a per-horizon split) | Rename the real one to `hazardnet_advisories_latest.csv`, or pass `--file-pattern`. Choosing by glob order is how a debug dump once became the day's forecast |
| `shape 'unknown'` | The producer's columns changed | Read the printed fieldnames; the bridge knows two shapes (`canonical`, `advisory`) and refuses a third rather than publishing rows nobody can interpret |
| `rows disagree about the date they were produced` | The pull spans two notebook runs, or `target_date − horizon` is not constant | Re-run after the notebook finishes; a mixed-output kernel is not publishable |
| `N row(s) name district 'X', which the identity table does not carry` | A district name no identity layer knows | Check `scripts/etl/districts.py` — if the producer renamed a district, its alias belongs there (the frontend parity test guards that table), not in the fetch script |
| `the GAUL id rule … does not reproduce N published district_id(s)` | The published artifact's ids stopped following "position in the sorted 64-name vocabulary" | Do not paper over it: the artifact's ids and the snapshot disagree, and deriving more ids on top would give two districts one id. Publish a corrected artifact first |
| `⚠️ Partial run: 120/128 requested units` | The notebook skipped districts (an Earth Engine fetch or an Open-Meteo call failed) | Allowed and labelled — the site shows those districts as baseline. If it persists, the notebook's log on Kaggle says which fetch failed |
| `❌ Forecast data is stale` | `prediction_date` is more than three days old | The Kaggle notebooks did not run. Open `https://www.kaggle.com/code/<slug>` and check the schedule; the site is still serving the last committed snapshot |
| `::error::dataset metadata …` (step continues) | The builder notebook published no `normalization_stats.json` / `dataset_config.json` that day | Advisory by design: the forecast still commits. Re-run with `require_dataset_meta=true` when you want it to be fatal |

## 5. When Kaggle output exists but the site is still stale

That is a different failure: the fetch and validate steps passed and the ingest
step failed. Use the manual path documented in `data/README.md`
(`data/manual_forecast.csv` → `Manual Forecast Ingest`), which publishes a
hand-run notebook CSV without touching the Kaggle API.

## 6. The model the producer actually loads

The forecast notebook reads its TFLite from
`/kaggle/input/notebooks/ashifahmedshuvo/hazardnet-model-conversion/…/hazardnet_fp32.tflite`
and its normalization from the `hazardnet-datasets` dataset — neither from this
repository. So after merging a monthly model PR, refresh that Kaggle output, or the
site keeps being served by the previous model. The daily manifest records what it can
prove: `model_version` (the version the repository promotes) and
`model_bytes_verified: false`.
