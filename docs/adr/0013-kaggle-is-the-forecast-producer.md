# ADR 0013 — Kaggle is the forecast producer; the monthly training run is a human act

- **Status:** Accepted (2026-09-20)
- **Context:** the owner's operating model — four Kaggle notebooks scheduled daily on
  Kaggle, one training notebook run by hand on Colab T4 once a month — against a
  repository that generated its own forecast on the GitHub runner and tried to drive
  the Colab run from Actions
- **Supersedes in part:** ADR 0008 (the hourly Kaggle-output refresh; the committed
  snapshot fallback and the three-stage frontend freshness ordering stay as decided
  there) and the 2026-09-16 decision recorded in `daily_forecast.yml` that the runner
  should be the scheduled producer
- **Related:** ADR 0002 (forecast consolidation), ADR 0004 (retire legacy weekly
  pipeline), ADR 0007 (no int8 bundle), ADR 0009 (single inference path),
  ADR 0010 (alert-engine persistence), `docs/mlops/ARCHITECTURE.md`,
  `docs/mlops/RETRAIN_AND_PROMOTION.md`, `docs/ops/kaggle-pipeline-triage.md`

## Context

By 2026-09-19 the repository had **two producers for one artifact**. Four Kaggle
notebooks (`1-hazardnet-bgd-climatic-hazards`, `3-hazardnet-with-severity`,
`4-hazardnet-dataset-builder`, `hazardnet-auto-forecast-pipeline`) ran daily on
Kaggle's own schedule and published `hazardnet_advisories_latest.csv` plus the
`hazardnet-datasets` dataset. Separately, `daily_forecast.yml` ran
`scripts/auto_forecast.py` on the GitHub runner — Earth Engine + Open-Meteo +
TFLite, about nineteen minutes — and committed `hazardnet_forecasts_latest.csv`.

Three consequences followed:

1. **Whichever job ran last decided what the website served.** The two producers
   wrote the same path with different schemas, different district sets and
   different severities. Nothing in the repository could say which one a given
   day's rows came from except a `data_source` string nobody validated.
2. **The runner-side producer held the fragile credential.** It needed an Earth
   Engine service-account key in GitHub secrets. When that key rotated, the
   scheduled run died one minute in with a bare traceback, and because the site
   serves the last committed snapshot (ADR 0008) the failure was invisible: a
   green-looking website serving rows that were quietly getting older.
3. **The monthly training run was automated end to end and never worked.**
   `model_retrain.yml` provisioned a Colab T4, `model_retrain_watch.yml` followed a
   run marker through git every twenty minutes, and `model_intake.yml` collected the
   bundle over SSH. Colab exposes no non-interactive session: `colab auth` and
   `drivemount` need a TTY and browser consent, and a free-tier session can be
   recycled at any moment. The launcher's own comments conceded the point. The
   chain was three workflows, two Python modules and a watcher cron whose only
   observed behaviour was failing.

Meanwhile the owner's actual practice was stable and worked: the notebooks run
daily on Kaggle, and the training notebook is opened on Colab once a month by a
person who reads the fold metrics and the conversion-parity numbers before
deciding anything.

## Decision

**Kaggle produces; GitHub Actions pulls, validates, publishes and gates.**

1. **The daily job is a pull, not a generation.** `daily_forecast.yml` downloads the
   forecast notebook's output with `kaggle kernels output`, translates the advisory
   shape into the committed canonical row schema
   (`scripts/fetch_kaggle_forecast.py`), validates it
   (`scripts/validate_forecasts.py`), ingests, rebuilds the snapshot and commits.
   `scripts/auto_forecast.py` stays in the repository — tested, runnable by hand,
   the offline fallback — but no schedule invokes it. One producer, one artifact.
2. **The translation refuses rather than guesses.** The advisory table has no
   `district_id`, no `pcode` and no `prediction_date`, so those come from the last
   published canonical artifact (unioned with `git show HEAD:` of it, so a short day
   cannot erode the identity table); `prediction_date` is derived as
   `target_date − horizon` and cross-checked across every row; a district the
   identity table does not carry is dropped and reported, never fuzzy-matched into
   someone else's pcode; a measurement the notebook did not fetch is empty, which
   the JSON sidecar types as `null` — never `0.0`, which would read as 0 kelvin or a
   sunless day. The notebook's own `advisory_tier` and `final_severity` are recorded
   in the manifest and deliberately not published as row columns: they are an
   editorial blend, and inventing a column for them would put an unvalidated
   severity into the website's data path.
3. **The pulled payload is the forecast plus kilobytes of dataset metadata.**
   `scripts/fetch_kaggle_dataset_meta.py` also pulls `normalization_stats.json` and
   `dataset_config.json` from `hazardnet-datasets` into `data/kaggle/dataset-meta/`,
   validates their shape, and reports how far the dataset's normalization has
   drifted from the copy the *shipped model* was trained with. It never writes
   `Models/`: the shipped normalization belongs to the model that uses it, and only a
   training pull request changes it. `master_tensors.h5` is not pulled at all — it is
   hundreds of megabytes, and the training notebook reads it straight from the Kaggle
   dataset. That step is `continue-on-error`; a Kaggle-side gap must not cost the
   day's forecast its commit.
4. **The Colab automation is deleted, not repaired.** `model_retrain.yml`,
   `model_retrain_watch.yml`, `scripts/mlops/colab_session.py`,
   `scripts/mlops/retrain_cli.py`, `docs/mlops/COLAB_AUTOMATION.md` and
   `data/mlops/retrain-runs/` are gone, and `scripts/tests/test_workflows.py` fails
   if any of them returns. The monthly run is a person on a T4.
5. **The notebook opens its own pull request.** Its last cell stages the five
   contract artifacts into a shallow clone, writes `Models/VERSION.json` and
   `Models/REGISTRY.json` through `mlops.retrain_state.write_version_handshake` (the
   same writers CI uses — `scripts/tests/test_model_handshake.py` pins the two
   implementations to each other), prompts for a fine-grained PAT with `getpass`, and
   creates blobs, a tree, a commit, a ref and a pull request over the GitHub API.
   The API rather than `git push` because a push needs the token inside a remote URL,
   and git copies remote URLs into `.git/config` — a credential at rest on a VM whose
   lifetime nobody controls. The token is asked for once, in the last cell, used for
   those calls, and cleared.
6. **CI gates the pull request and stops.** `model_intake.yml` runs on `Models/**`:
   the bundle validator, the run manifest, handshake currency against the PR's own
   bytes, a TFLite smoke test under `tflite-runtime==2.14.0` (the runtime the API
   loads, and the same pins as `model-validation.yml`), and a `mlops.cli promote`
   **dry run**. It comments and exits. It never merges, never pushes, never records a
   champion — the human merge gate stays a constraint rather than a convention, and
   `champion` still needs `--by <named approver> --write`.

## Consequences

- One producer means the `data_source` on every committed row says
  `Kaggle_Advisory_Pipeline`, and the manifest carries the kernel slug, the source
  file's sha256, the detected shape and the derived prediction date: an auditable
  answer to "where did today's numbers come from" (constraint C3).
- The Earth Engine service-account key is no longer needed in GitHub secrets; the
  daily job needs only `KAGGLE_USERNAME` and `KAGGLE_KEY`, and its preflight maps
  401/403/404 to the three distinct owner actions they mean (rotate the token, fix
  the notebook's ownership, repoint the `KAGGLE_KERNEL` variable).
- **The site's freshness now depends on Kaggle's schedule.** If the notebooks do not
  run, the pull publishes the previous run's rows; `validate_forecasts.py` fails the
  run once `prediction_date` is more than three days old, and the workflow's summary
  step reports the age of the rows it committed. That is a real coupling to a
  third-party scheduler and it is the accepted cost of having one producer.
- The advisory shape has fewer columns than the canonical one, so several
  meteorological fields are `null` in the committed artifact until the notebook
  fetches them. Consumers already treat an absent number as "not measured"
  (`backend/utils/forecastRow.js`, `scripts/build_forecast_snapshot.mjs`); anything
  new must do the same.
- `hourly_forecast.yml` is deleted: it pulled the same notebook output on an hourly
  cron, which the daily pull and `forecast-pipeline.yml`'s dispatch (trigger the
  notebook, then pull) cover between them. ADR 0008's *fallback* half — the
  committed snapshot and the frontend's live → snapshot → static-baseline ordering —
  is unchanged and still the reason a Kaggle outage degrades instead of blanking.
- Two writers for `Models/VERSION.json` (Node in CI, Python on the VM) is a standing
  duplication risk. It is contained by deriving both from the same rule and testing
  them against each other on identical bytes; if the two ever diverge, the intake
  gate reports the PR as stale and the divergence is visible in a comment rather
  than in production.
- A monthly model update now costs a human about a day of attention (run, read,
  merge, promote) instead of zero attention and a red workflow. That is the intended
  trade: the promotion decision was never automatable, and the automation was only
  ever hiding who makes it.
