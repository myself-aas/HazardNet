# Retraining and champion/challenger promotion

The monthly cycle, the promotion gates, and how to roll back.

## Stages

`Models/REGISTRY.json` assigns every model artifact one stage — `candidate`,
`shadow`, `champion` or `retired` — and `scripts/mlops/registry.py` enforces the
invariants: **exactly one champion**, only a model can hold a stage, and no two
*non-retired* models may have identical bytes (which is why promoting
`hazardnet_int8.tflite` over its byte-identical FP32 twin is refused, not
"allowed but pointless"). The registry is rebuilt from the bytes on disk on every
run; a rebuild never loses a promotion, and a rebuild that changes nothing writes
nothing (`unchanged`), so the committed file stays clean in CI.

## Promotion policy

Recorded in the registry itself (`policy`) rather than in prose only:

| Gate | Rule |
| --- | --- |
| Status | the challenger's evaluation must be `ok`, not `insufficient_truth` |
| Sample | at least 30 observed events |
| Metrics | `ece`, `csi`, `far` present, and no regression beyond a 1 % relative tolerance |
| First champion | no baseline to compare: the challenger must clear absolute bars (CSI ≥ 0.20, POD ≥ 0.30, FAR ≤ 0.80, ECE ≤ 0.20) |
| Approver | a named human, always. There is no automatic path |

`mlops.cli promote` prints the comparison table, refuses when any gate fails, and
only records the promotion with `--write`. The previous champion is demoted to
`shadow` (not deleted), so rolling back is one command:

```bash
cd scripts
python -m mlops.cli promote --registry ../Models/REGISTRY.json \
  --artifact hazardnet_fp32.tflite --report rollback-report.json --by "<name>" \
  --stage champion --write
```

An artifact rollback also means swapping the file `Models/VERSION.json` points at
and regenerating the handshake:

```bash
node scripts/gen-model-version.mjs && python -m mlops.cli audit
```

## The monthly retrain

Two things happen each month, and only one of them is a machine's job.

**Automated.** `model_retrain.yml` runs at 18:00 UTC on the 1st (00:00 BDT on the 2nd),
provisions a Colab T4, and launches `ml/HazardNet_auto_train.ipynb` detached;
`model_retrain_watch.yml` follows it every twenty minutes and relaunches it from its
Drive checkpoints when the free tier recycles the session; `model_intake.yml` collects
the finished bundle, validates it against the manifest the notebook wrote, regenerates
the handshake and opens a pull request. Setup, triage and the limits are in
[`COLAB_AUTOMATION.md`](COLAB_AUTOMATION.md).

`.github/workflows/mlops.yml` still opens the quarterly brief issue, because the brief
is about *whether* retraining is worth anything this quarter — a question the automated
run cannot ask, since it has no idea what the truth data says.

**Human.** Everything below. Automation produces a candidate; it does not decide the
window, fit calibration, score the challenger, or promote.

Checklist:

1. **Refresh the archive.** `python -m etl.cli events --input <fresh extract> --apply`
   (or `--dry-run` first — see `scripts/etl/README.md`). Record the ingested count
   against the 2,931-event claim; drift is reported, not assumed away. *This one has to
   come first: the automated run trains on whatever tensor is already in Drive, so an
   archive refreshed after it produces a candidate that cannot be compared with the
   champion.*
2. **Freeze the window.** Choose the train/validation/test split and write it down
   *before* fitting anything. Temporal leakage is the failure mode
   `docs/MODEL_CARD.md` §4.1 records, and it is why the evaluation join refuses to
   score an outcome that predates its forecast. The notebook's strategy
   (`event_kfold`, `spatial_lodo`, `temporal`, `spatio_temporal`) is the split; it is a
   `workflow_dispatch` input, and the run marker records which one was used.
3. **Retrain** — automated, but the contract is still yours to keep intact: band order
   and z-score statistics come from `Models/preprocessing_config.json`, and `SOIL_MODE`
   decides how the unobserved soil channels are handled (`mean` or `forbid`). Changing
   either invalidates comparisons with the previous champion, and the manifest will not
   tell you: it records what ran, not whether what ran is comparable.
4. **Publish the artifacts** — automated up to the pull request. `model_intake.yml`
   copies the bundle into `Models/`, runs `node scripts/gen-model-version.mjs` (the only
   writer of `Models/VERSION.json`; CI fails if it is stale) and `mlops.cli registry
   --write`, then opens the PR with the fold metrics, the parity numbers and the artifact
   hashes in the body. **Merging is the human step**, and merging is not promotion.
5. **Fit calibration on held-out outcomes only** — never on the training window, and
   never on the same rows used to compute the champion's reliability
   (`docs/mlops/CALIBRATION.md`). A map fitted on the rows it is evaluated on has an
   ECE of ~0 and measures nothing.
6. **Evaluate both models on the same window**:

   ```bash
   python -m mlops.cli evaluate --predictions challenger.csv --outcomes archive.json \
     --absence-means-no-event --json challenger.json
   python -m mlops.cli evaluate --predictions champion.csv  --outcomes archive.json \
     --absence-means-no-event --json champion.json
   ```

7. **Promote, with an approver** — or record why not. A challenger that loses should
   leave a note in the issue, because "we trained again and kept the old model" is a
   result.
8. **Watch the first week.** The nightly job's drift report is the early-warning
   signal; a class-share PSI in `significant` with the dominant share ≥ 95 % is the
   collapse signature from `docs/MODEL_CARD.md` §6.1, and the correct response is a
   rollback, not a re-run.

## What retraining cannot fix

Two of the model card's known defects are not training problems:

* **Optical-blind channels.** Blue/Red/NIR/SWIR are dark or cloudy through the
  monsoon, so a retrain on the same inputs inherits the same blindness (Phase 2's
  ingestion covers Sentinel-1 SAR and ERA5-Land soil to widen the input mix).
* **A degenerate output distribution.** If the challenger also returns one class for
  every district, no calibration map or threshold repairs it — calibration is
  monotone, so it cannot make a collapsed classifier informative. Verify the class
  shares before believing a POD improvement (`mlops.cli evaluate` prints the
  confusion matrix; `drift.class_share_drift` reports the collapse).
