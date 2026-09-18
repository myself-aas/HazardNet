# Retraining and champion/challenger promotion

The quarterly cycle, the promotion gates, and how to roll back.

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

## The quarterly retrain

Triggered by `.github/workflows/mlops.yml` (first of Jan/Apr/Jul/Oct), which opens or
updates an issue with the brief. **The workflow does not retrain anything**: training
runs `ml/HazardNet_auto_train.ipynb` on a machine with Earth Engine credentials, and
that is a deliberate human step.

Checklist:

1. **Refresh the archive.** `python -m etl.cli events --input <fresh extract> --apply`
   (or `--dry-run` first — see `scripts/etl/README.md`). Record the ingested count
   against the 2,931-event claim; drift is reported, not assumed away.
2. **Freeze the window.** Choose the train/validation/test split and write it down
   *before* fitting anything. Temporal leakage is the failure mode
   `docs/MODEL_CARD.md` §4.1 records, and it is why the evaluation join refuses to
   score an outcome that predates its forecast.
3. **Retrain** (`ml/HazardNet_auto_train.ipynb`), keeping the preprocessing contract
   intact: band order and z-score statistics come from
   `Models/preprocessing_config.json`, and `SOIL_MODE` decides how the unobserved
   soil channels are handled (`mean` or `forbid`). Changing either invalidates
   comparisons with the previous champion.
4. **Publish the artifacts** and regenerate the handshake
   (`node scripts/gen-model-version.mjs`); CI fails if `Models/VERSION.json` is stale.
   Record the new artifact hash in the registry (`mlops.cli registry --write`).
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
