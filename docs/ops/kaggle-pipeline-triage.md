# Kaggle pipeline triage — why a forecast job is red and what to do

The three Kaggle-backed workflows (`HazardNet Automated Forecast Pipeline`,
`Hourly Forecast Refresh`, `Weekly Forecast Pipeline`) all depend on two things
the repository does not control: **the Kaggle API token** and **the notebook's
slug**. When either drifts, the job dies at its first Kaggle call. Since
2026-09-15 those failures are self-describing (`scripts/kaggle_trigger.py` emits
a `::error::` annotation; `fetch_kaggle_forecast.py` prints the CLI output per
attempt) — start with the failing step's log; this page is the decision table
behind it.

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
kaggle kernels output ashifahmedshuvo/hazardnet-auto-forecast-pipeline -p /tmp/ko   # what the hourly job fetches
python scripts/kaggle_trigger.py --kernel <slug> --max-retries 1 --poll-interval 1  # same code path as CI
```

A `401`/`404` from `kernels status` is the same failure CI reports — and it
reproduces in one second, without burning a 150-minute job slot.

## 3. Repoint every pipeline at once

`KAGGLE_KERNEL` is read as
`${{ vars.KAGGLE_KERNEL || 'ashifahmedshuvo/hazardnet-auto-forecast-pipeline' }}`
by `forecast-pipeline.yml`, `hourly_forecast.yml` and `weekly_forecast.yml`
(the weekly job's env key is `KERNEL_SLUG`). Setting the **variable** overrides
all three; unsetting it falls back to the committed default. No code change, no
PR, no re-merge.

```bash
# what is it set to right now?
gh variable list --repo myself-aas/HazardNet
gh variable set KAGGLE_KERNEL --repo myself-aas/HazardNet --body 'owner/notebook-slug'
```

## 4. When Kaggle output exists but the site is still stale

That is a different failure: the fetch and validate steps passed and the ingest
step failed. Use the manual path documented in `data/README.md`
(`data/manual_forecast.csv` → `Manual Forecast Ingest`), which publishes a
hand-run notebook CSV without touching the Kaggle API.
