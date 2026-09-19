# `data/mlops/`

Machine-written MLOps state. Two directories, with opposite relationships to git.

## `bundles/` — committed

One directory per monthly training run: `bundles/<run_id>/run_manifest.json`, where the
run id is `YYYYMMDDTHHMMSS-<strategy>` in UTC (`20261001T180000-event_kfold`).

The manifest is the run's own account of itself, written by
`ml/HazardNet_auto_train.ipynb` on the Colab VM and published by the pull request the
notebook opens: every artifact with its size and sha256, the fold metrics the training
actually returned, the converter's ONNX→TFLite parity numbers, and the environment that
produced them. Its schema and its validator live in
`scripts/mlops/retrain_state.py` — the same module the notebook imports inside Colab, so
the two sides cannot drift.

`model_intake.yml` reads it from the pull request and prints it into the gate report:
fold table, parity block, artifact hashes. Numbers a human typed into Markdown and
numbers the gate can re-check are not the same evidence, which is why the manifest
travels with the bytes it describes. A PR with no manifest still gates (the bundle is
loadable and smoke-testable), but the report says loudly that the run's claims could not
be verified, and the gate's own `::warning::` is what tells the reviewer to ask for it.

## `incoming/` — git-ignored

A place to stage a bundle by hand before opening a pull request — a bundle copied off a
Drive folder, or downloaded from a Kaggle output, that you want the intake gate to look
at without committing it. The gate searches this directory for a `run_manifest.json` as
well as `bundles/` and `Models/`. Nothing writes here automatically: keeping a second
copy of a 790 KB model in the working tree of every checkout would buy nothing, because
the bytes that matter end up in `Models/` on a branch.

## What was here before

`retrain-runs/` — one committed JSON marker per monthly run, written by
`model_retrain.yml` when it provisioned a Colab T4, updated every twenty minutes by
`model_retrain_watch.yml`, and closed out by the collector that opened the pull request.
It existed because three separate workflow runs, hours apart, needed one history, and git
was the only place they could meet. Deleted 2026-09-20 with the rest of the Colab
automation ([ADR 0013](../../docs/adr/0013-kaggle-is-the-forecast-producer.md)): the
monthly run is a person on a T4 now, and the pull request it opens *is* the record —
the run marker was a workaround for a handoff that no longer exists.
