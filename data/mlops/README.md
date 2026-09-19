# `data/mlops/`

Machine-written MLOps state. Two directories, with opposite relationships to git:

## `retrain-runs/` — committed

One JSON file per monthly retrain: `<run_id>.json`, where the run id is
`YYYYMMDDTHHMMSS-<strategy>` in UTC (`20261001T180000-event_kfold`).

This is how a run that spans two machines and eight hours has a single history.
`model_retrain.yml` writes the marker when it provisions a Colab T4;
`model_retrain_watch.yml` updates it every twenty minutes with the latest heartbeat
and every status transition; `model_intake.yml` records the pull request the bundle
became. Each of those is a *different* workflow run, on a different runner, hours
apart — the repository is the only place they can meet.

The schema and the state machine live in `scripts/mlops/retrain_state.py`, which is
the same module the notebook imports inside Colab, so the two sides cannot drift.

A marker's `events` list is capped at forty entries: a run that is relaunched many
times should not grow a file that every workflow checks out.

Statuses: `pending` → `provisioning` → `training` → `converting` → `complete`, with
`stalled` (the session went quiet and may be relaunched), `failed` (the run reported a
problem, or its manifest did not validate) and `abandoned` (the attempt or lifetime
budget ran out) as the exits. `complete`, `failed` and `abandoned` are terminal.

## `incoming/` — git-ignored

Where `model_intake.yml` downloads a finished bundle before validating it and opening a
pull request. The bytes end up in `Models/` on a branch; keeping a second copy here would
put a 790 KB model in the repository twice and in the working tree of every checkout.
