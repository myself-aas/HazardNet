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
| `scripts/mlops/retrain_state.py` | The training run's contract: version handshake, run manifest, the manifest gate | `test_retrain_notebook.py`, `test_model_handshake.py` |
| `scripts/gen-model-version.mjs` | The Node writer of the same handshake, for CI and the verify gates | `test_model_handshake.py` |
| `.github/workflows/model_intake.yml` | The PR gate's inline smoke test: every `.tflite` loaded under `tflite-runtime` and fed a zero input | `test_model_intake_smoke.py` |

Everything is stdlib-only and offline: the same code runs on a GitHub runner, in CI
with no network, and on an analyst's laptop. The parts that genuinely need a model
runtime or Earth Engine credentials (quantizing, verifying against observed outcomes)
are not implemented here and are not simulated to look implemented — see
[`RETRAIN_AND_PROMOTION.md`](RETRAIN_AND_PROMOTION.md).

The one piece of model-side logic that lives in a workflow rather than a module is the
gate's smoke test, and it is tested where it lives: `test_model_intake_smoke.py` lifts
the Python block out of `model_intake.yml` and runs it against a stub interpreter, so a
change to the step is a change to code under test. It earned that treatment the hard way
— the step's first run failed because `get_input_details()['shape']` is a numpy `int32`
array and `isinstance(d, int)` is False for every element of one, which collapsed the
input to all-ones and made a healthy bundle look unloadable. The same file runs the block
against the committed artifacts in the gate job, which is the only job that installs
`tflite-runtime`.

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

The retrain itself is **not** automated, as of 2026-09-20. The monthly run is a human
act: the owner opens [`ml/HazardNet_auto_train.ipynb`](../../ml/HazardNet_auto_train.ipynb)
on a Colab T4, runs the monthly block, and the notebook's last cell takes a fine-grained
PAT at a `getpass` prompt, pushes an artifact branch and opens the pull request itself.
`model_intake.yml` then gates that PR — bundle validator, run manifest, handshake
regeneration, the smoke test, a dry-run promotion preview — comments the report and
stops. What was automated before (a launcher that provisioned the VM, a watcher on a
20-minute cron that kept the session warm, and a collector that pulled the bundle over
SSH and opened the PR) is deleted, because every hop depended on a machine reaching a
surface Colab only exposes interactively. ADR 0013 and
[`RETRAIN_AND_PROMOTION.md`](RETRAIN_AND_PROMOTION.md) record the reasoning and the
removal; `scripts/tests/test_retrain_notebook.py` fails if the automation comes back.

What stays human is unchanged, and is now the only path: merging the pull request, and
`promote --by <approver>`. The limits that matter most are also unchanged — the free tier
does not guarantee a T4, and intake cannot prove a new model *verifies* better, only that
it is the bundle its manifest describes and that the conversion did not change its
predictions.
