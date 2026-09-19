# MLOps (Phase 3)

What this covers, what it deliberately does not, and how to run it.

The plan's Phase 3 asks for a model registry, FP32/INT8 handling, isotonic
calibration, nightly evaluation (POD/FAR/CSI + drift PSI), quarterly retraining and
a champion/challenger policy. This directory documents the two decisions that shape
all of it, and [`docs/phase-reports/phase-3-mlops.md`](../phase-reports/phase-3-mlops.md)
is the report of the work itself.

## The two rules

**1. No metric without evidence.** Every score in this phase is computed from a
contingency table whose four cells are printed next to it, and a score with an empty
denominator is `None` with the reason — never `0.0`. The most expensive instance of
this rule: an event-archive join can only produce positive samples, so
`mlops.cli evaluate` reports `FAR`, `CSI` and `accuracy` as *unmeasurable* unless the
caller explicitly asserts that absence of a record means no event
(`--absence-means-no-event`). Without that assertion a false-alarm ratio of 0.0 would
print as perfection.

**2. No promotion without a human.** The registry's `champion` stage requires a
comparison that clears the policy's bars *and* a named approver
(`Models/REGISTRY.json` → `policy`). There is no automatic promotion path, and
`scripts/tests/test_mlops_registry.py` fails if one is added.

## Commands

Run from `scripts/` (the package is not installed; this is the same convention as
`python -m etl.cli`):

```bash
python -m mlops.cli audit                     # handshake vs bytes on disk, exit 1 on mismatch
python -m mlops.cli registry --write          # refresh Models/REGISTRY.json (idempotent)
python -m mlops.cli evaluate --predictions <csv> --outcomes <json|csv> --json out.json
python -m mlops.cli drift --reference <older run> --current <newer run> --json out.json
python -m mlops.cli calibrate --fit-from <labelled predictions> --outcomes <outcomes> --out map.json
python -m mlops.cli apply-calibration --csv <forecast csv> --map map.json --out calibrated.csv
python -m mlops.cli promote --registry ../Models/REGISTRY.json --artifact hazardnet_fp32.tflite \
    --report challenger.json --champion champion.json --by "<name>" --write
```

Exit codes: `0` success, `1` the operation ran and the result is bad (a hash
mismatch, a refused promotion, a condition named by `--fail-on`), `2` the input was
unusable. "We could not measure" and "we measured a problem" are different failures
and both stay visible.

## Module map

| Module | Responsibility | Tests |
| --- | --- | --- |
| `scripts/mlops/metrics.py` | POD/FAR/CSI, reliability (ECE/MCE/Brier/BSS/log-loss), PSI | `test_mlops_metrics.py` |
| `scripts/mlops/calibration.py` | Isotonic (PAVA) and Platt fits, the artifact, the refusal rules | `test_mlops_calibration.py` |
| `scripts/mlops/registry.py` | Bundle audit, stages, promotion gates | `test_mlops_registry.py` |
| `scripts/mlops/evaluate.py` | The prediction↔outcome join, scoring, lead time | `test_mlops_evaluate_drift.py` |
| `scripts/mlops/drift.py` | PSI over the published driver columns, class shares, severity | `test_mlops_evaluate_drift.py` |
| `scripts/mlops/cli.py` | The commands above | via the suites plus `test_mlops_artifacts.py` |
| `scripts/mlops/retrain_state.py` | The retrain run's contract: marker, heartbeat, manifest, state machine, manifest gate | `test_retrain_automation.py`, `test_retrain_notebook.py` |
| `scripts/mlops/colab_session.py` | The Colab CLI wrapped for unattended use: timeouts, actionable errors, detached launch | `test_retrain_automation.py` |
| `scripts/mlops/retrain_cli.py` | `start`, `watch`, `collect`, `validate`, `mark`, `status` | `test_retrain_automation.py` |

Everything is stdlib-only and offline: the same code runs on a GitHub runner, in CI
with no network, and on an analyst's laptop. `colab_session.py` is the one module that
shells out — it drives the Colab CLI — and its tests drive a stub `colab` binary on
`PATH`, so even that is exercised without a Google account. The parts that genuinely
need a model runtime or Earth Engine credentials (quantizing, verifying against
observed outcomes) are not implemented here and are not simulated to look implemented
— see [`RETRAIN_AND_PROMOTION.md`](RETRAIN_AND_PROMOTION.md).

## The FP32/INT8 question

`Models/hazardnet_int8.tflite` is **byte-identical** to `Models/hazardnet_fp32.tflite`
(ADR 0007: TFLite's converter crashes on `CONV_3D`, so the "int8" name is
historical). The registry records one model and one retired alias, and
`mlops.cli registry` reports the duplicate content rather than letting a reader
count two deployment options. There is no quantization script in this phase, because
writing one that cannot be run or verified would be worse than the honest gap.

## Automation

`.github/workflows/mlops.yml` runs nightly (audit, registry, evaluation, drift,
reports as artifacts) and quarterly (the retrain brief, which opens or updates an
issue). It never promotes a model and never stamps a calibrated probability: both of
those are human steps, by design.

The retrain itself is automated as of 2026-09-19 by three workflows that hand off
through a committed run marker — `model_retrain.yml` (monthly: provision a Colab T4
and launch the notebook detached), `model_retrain_watch.yml` (every 20 min: keep the
session warm, relaunch a dead one from its Drive checkpoints) and `model_intake.yml`
(hourly: collect the bundle, validate it, open the pull request). What stays human is
unchanged: merging the pull request, and `promote --by <approver>`.

Read [`COLAB_AUTOMATION.md`](COLAB_AUTOMATION.md) for the one-time setup, the triage
table and the limits — including the ones that matter most: the free tier does not
guarantee a T4, and intake cannot prove a new model *verifies* better, only that it is
the bundle its manifest describes and that the conversion did not change its
predictions.
