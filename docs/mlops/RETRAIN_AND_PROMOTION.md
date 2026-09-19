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

The run itself is a human act; the gate around it is a machine's.

**Human.** Open [`ml/HazardNet_auto_train.ipynb`](../../ml/HazardNet_auto_train.ipynb) on
Colab with a T4 runtime and run it. Mount Drive when prompted (or decline and let the
dataset cell download `master_tensors.h5` from the Kaggle `hazardnet-datasets` dataset).
The notebook trains, converts, enforces the 99% parity gate, writes `run_manifest.json`,
and its last cell stages `Models/`, writes the version handshake through
`mlops.retrain_state.write_version_handshake`, prompts for a fine-grained PAT with
`getpass`, and opens the pull request over the GitHub API. The token is used for those
calls, cleared, and never written to a file, a git remote or an output cell.

**Machine.** `model_intake.yml` gates that pull request: the bundle validator, the run
manifest, handshake currency against the PR's own bytes, a TFLite smoke test under
`tflite-runtime==2.14.0` (the same pins `model-validation.yml` uses), and a
`mlops.cli promote` **dry run**. It comments and stops. It never merges, never pushes and
never records a champion.

> **What used to be here.** Until 2026-09-20 the monthly run was automated end to end:
> `model_retrain.yml` provisioned a Colab VM, `model_retrain_watch.yml` followed a run
> marker through git every twenty minutes, and `model_intake.yml` collected the bundle over
> SSH and opened the PR itself. Colab exposes no non-interactive session — `colab auth` and
> `drivemount` need a TTY and browser consent — so the chain never worked and is deleted
> (`scripts/mlops/colab_session.py`, `scripts/mlops/retrain_cli.py`,
> `docs/mlops/COLAB_AUTOMATION.md`, `data/mlops/retrain-runs/`). The schemas it introduced
> are what survived, in `scripts/mlops/retrain_state.py`, and
> `scripts/tests/test_workflows.py` fails if the automation returns. See
> [ADR 0013](../adr/0013-kaggle-is-the-forecast-producer.md).

`.github/workflows/mlops.yml` still opens the quarterly brief issue, because the brief is
about *whether* retraining is worth anything this quarter — a question a training run
cannot ask, since it has no idea what the truth data says.

Everything below is human either way: the run produces a candidate; it does not decide the
window, fit calibration, score the challenger, or promote.

Checklist:

1. **Refresh the archive.** `python -m etl.cli events --input <fresh extract> --apply`
   (or `--dry-run` first — see `scripts/etl/README.md`). Record the ingested count
   against the 2,931-event claim; drift is reported, not assumed away. *This one has to
   come first: the run trains on whatever tensor the Kaggle dataset builder last
   published, so an archive refreshed after it produces a candidate that cannot be
   compared with the champion. The daily pull's drift report
   (`data/kaggle/dataset-meta/`) is how you can tell the dataset moved.*
2. **Freeze the window.** Choose the train/validation/test split and write it down
   *before* fitting anything. Temporal leakage is the failure mode
   `docs/MODEL_CARD.md` §4.1 records, and it is why the evaluation join refuses to
   score an outcome that predates its forecast. The notebook's strategy
   (`event_kfold`, `spatial_lodo`, `temporal`, `spatio_temporal`) is the split; put it in
   the VM's `run_config.json` (`HN_RUN_CONFIG`) and the run manifest records which one was
   used.
3. **Retrain** — the contract is yours to keep intact: band order
   and z-score statistics come from `Models/preprocessing_config.json`, and `SOIL_MODE`
   decides how the unobserved soil channels are handled (`mean` or `forbid`). Changing
   either invalidates comparisons with the previous champion, and the manifest will not
   tell you: it records what ran, not whether what ran is comparable.
4. **Publish the artifacts** — the notebook's last cell copies the bundle into `Models/`
   in its shallow clone and writes `Models/VERSION.json` and `Models/REGISTRY.json` with
   the repository's canonical writers (`retrain_state.write_version_handshake` and
   `mlops.cli registry --write`, the same two CI regenerates them with — there is no
   Node.js on a Colab VM, and `scripts/tests/test_model_handshake.py` pins the two
   implementations to each other). `model_intake.yml` then re-derives both from the PR's
   own bytes and fails if they differ, rather than repairing them: a silently fixed
   handshake hides a notebook that stopped writing one. The PR body carries the fold
   metrics, the parity numbers and the artifact hashes. **Merging is the human step**, and
   merging is not promotion.
5. **Refresh the Kaggle model output.** The daily forecast notebook loads
   `/kaggle/input/notebooks/ashifahmedshuvo/hazardnet-model-conversion/HazardNet_Deployment_Bundles/deployment_bundle/hazardnet_fp32.tflite`
   — a Kaggle artifact, not a repository one. Merging the PR therefore changes nothing
   about what Kaggle infers with until that output is refreshed: re-run or re-upload
   `hazardnet-model-conversion` so it carries the new bundle, then check the next daily
   pull's `backend/data/forecasts/manifest.json` (`model_version`, and
   `model_bytes_verified: false` — the pull records the version the repository promotes and
   says plainly that it could not verify the bytes Kaggle executed). Skipping this step is
   how a merged model silently never ships.
6. **Fit calibration on held-out outcomes only** — never on the training window, and
   never on the same rows used to compute the champion's reliability
   (`docs/mlops/CALIBRATION.md`). A map fitted on the rows it is evaluated on has an
   ECE of ~0 and measures nothing.
7. **Evaluate both models on the same window**:

   ```bash
   python -m mlops.cli evaluate --predictions challenger.csv --outcomes archive.json \
     --absence-means-no-event --json challenger.json
   python -m mlops.cli evaluate --predictions champion.csv  --outcomes archive.json \
     --absence-means-no-event --json champion.json
   ```

8. **Promote, with an approver** — or record why not. A challenger that loses should
   leave a note in the issue, because "we trained again and kept the old model" is a
   result.
9. **Watch the first week.** The nightly job's drift report is the early-warning
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
