# Colab Automation — the monthly retrain, end to end

How a model gets retrained without anybody at a keyboard, and what to do when it does not.

For the shape of the whole pipeline (and why inference and training are two profiles), read
[`ARCHITECTURE.md`](ARCHITECTURE.md). For what has to be true before a model goes live, read
[`RETRAIN_AND_PROMOTION.md`](RETRAIN_AND_PROMOTION.md). This document is the operating manual
for the training half.

---

## The three workflows

| Workflow | Trigger | Length | Role |
|---|---|---|---|
| [`model_retrain.yml`](../../.github/workflows/model_retrain.yml) | `0 18 1 * *` (00:00 BDT on the 2nd) + dispatch | ~5 min | provision a T4, upload the notebook, launch it **detached**, commit the run marker |
| [`model_retrain_watch.yml`](../../.github/workflows/model_retrain_watch.yml) | `*/20 * * * *` + dispatch | ~2 min | keep the session warm, read the heartbeat, relaunch a dead run from its checkpoints, release the VM when the run completes |
| [`model_intake.yml`](../../.github/workflows/model_intake.yml) | `10 * * * *` + dispatch | ~10 min | download the bundle, validate it, smoke-test it, regenerate the handshake, open the pull request |

None of them runs the training. The training runs on the Colab VM, launched with
`setsid nohup jupyter nbconvert …` over `colab ssh`, so it belongs to the VM rather than to any
job — which is the only way an eight-hour run fits inside GitHub's six-hour job limit.

Everything they share is a file with a schema:

* **`data/mlops/retrain-runs/<run_id>.json`** — committed. The run's identity, status, session,
  attempt number, last heartbeat and event log. Git is how a job at 23:40 knows what a job at
  18:00 did.
* **`<run_dir>/heartbeat.json`** — on the VM (mirrored to Drive when a human has mounted one).
  Written every epoch.
* **`<run_dir>/run_manifest.json`** — written once, at the end. Every artifact with its size and
  sha256, the fold metrics, the parity numbers, the environment.

Schemas, the state machine and the manifest gate live in
[`scripts/mlops/retrain_state.py`](../../scripts/mlops/retrain_state.py). The notebook imports
that same module inside Colab, so the two sides cannot drift.

---

## One-time setup

Five steps, once, by a human with a Google account.

**1. Install the Colab CLI on your own machine.**

```bash
python -m pip install google-colab-cli    # needs Python 3.12+
colab --version
```

This is Google's official CLI (`googlecolab/google-colab-cli`), and it is what makes headless
Colab possible at all: free-tier Colab has no execution API, and the CLI is the sanctioned way to
drive a session from a shell.

**2. Authenticate once, interactively.**

```bash
colab auth --auth=oauth2
```

It prints a URL, you paste back a code, and it writes a refresh token to
`~/.config/colab-cli/token.json`. That is the only interactive moment in the whole pipeline.

**3. Store the token as a repository secret.**

```bash
gh secret set COLAB_TOKEN_JSON < ~/.config/colab-cli/token.json
```

The workflows write it to `~/.config/colab-cli/token.json` on the runner with 0600 permissions.
It is never echoed, never passed on a command line, and never included in an error message —
`scripts/tests/test_workflows.py` fails a workflow that prints it.

> **Why not a service account?** Colab sessions draw on a *person's* quota and write to a
> *person's* Drive. The CLI's `--auth=adc` path exists, but a service account has no free-tier GPU
> allocation to draw on, so it does not help here. One personal OAuth token for the VM, and
> `GITHUB_TOKEN` for everything on the GitHub side. No third credential.

**4. Make sure the training data is reachable headlessly.**

`colab drivemount` needs a TTY and browser consent, so a session launched by Actions has **no
Google Drive**. The notebook resolves the master tensor in this order:

1. `tensor_path` in `run_config.json`, if you staged one;
2. `My Drive/HazardNet_Deployment/tensors_output/HazardNet_Event_Based_Datasets/master_tensors.h5`,
   when Drive *is* mounted — the interactive path, and the fast one;
3. the Kaggle dataset `ashifahmedshuvo/hazardnet-datasets`, downloaded and unzipped on the VM.

Path 3 is what an unattended run uses, and it needs the repository's existing `KAGGLE_USERNAME`
and `KAGGLE_KEY` secrets: the launch workflow writes them to `~/.kaggle/kaggle.json` on the VM
(0600) and deletes the local copy. `dataset_config.json`, the fold CSVs and
`normalization_stats.json` must be in that dataset too, beside the tensor — the converter reads
them from wherever the tensor turned out to be.

Checkpoints, heartbeats and the finished bundle go to the VM, and the watcher carries the ones
worth keeping out to workflow artifacts. With Drive mounted interactively, they are mirrored there
as well.

**5. Prove it end to end.**

`Actions → Monthly Model Retrain (Colab T4) → Run workflow`. Watch the launch (five minutes), then
`Actions → Retrain Watcher → Run workflow` once by hand to confirm it finds the marker and reports
a fresh heartbeat. When the run finishes, intake opens a pull request on its next hourly tick.

---

## What a month looks like

```
1st, 18:00 UTC   model_retrain.yml: colab new --gpu T4 → upload → launch detached → commit marker
every 20 min     model_retrain_watch.yml: keep-alive ping, read heartbeat, commit the marker
   …hour 3       a session is recycled. The watcher sees 45 min of silence, downloads the
                 checkpoint archive it made on an earlier tick, provisions a replacement,
                 uploads the states back in, and relaunches the same run id with resume: true
   …hour 8       the fold loop ends; the converter exports ONNX → TFLite, runs the golden
                 parity test (gate 99.0%), publishes the bundle + manifest to the VM and Drive
next :10         model_intake.yml: colab download the bundle → validate against the manifest →
                 copy into Models/ → node scripts/gen-model-version.mjs → rebuild
                 REGISTRY.json → smoke-test with tflite-runtime → open a pull request
                 a human reviews and merges
```

A run that dies three times is abandoned, with the reason in the marker and an issue opened. That
is the signal that the free tier is not keeping up — see *Limits* below.

---

## The run marker

`data/mlops/retrain-runs/<run_id>.json`, where the run id is `YYYYMMDDTHHMMSS-<strategy>` in UTC.

| Status | Meaning | What the watcher does |
|---|---|---|
| `provisioning` | session requested, no heartbeat yet | waits up to 25 min, then calls it stalled |
| `training` | heartbeat fresh, folds running | re-attaches (keep-alive) and leaves it alone |
| `converting` | fold loop done, converter running | same |
| `stalled` | no heartbeat for 45 min | provisions a replacement session and relaunches with `resume: true` |
| `complete` | manifest present **and valid** | releases the VM; intake takes over |
| `failed` | the run reported a problem, or the manifest did not validate | stops, records the reason, opens an issue |
| `abandoned` | past the 15 h budget, or three dead attempts | stops, opens an issue |

Only one run may be in flight: two attempts would share one free-tier quota and both would be
recycled. `retrain_cli start` refuses to launch over a live marker unless you pass `--force`.

---

## Triage

| Symptom | What it actually means | What to do |
|---|---|---|
| `colab new --gpu T4` fails | The free tier had no T4 to give. Not a bug. | Re-run the workflow, or move the cron to a quieter hour. The watcher retries on relaunch anyway. |
| Preflight fails: `COLAB_TOKEN_JSON is not set` | The secret was never added | Step 3 above |
| Preflight fails: `code cell N reads from the keyboard` | Somebody added `getpass`/`input()` to the notebook | Remove it. An unattended run cannot answer a prompt; put the value in `run_config.json`. |
| Watcher reports `stalled` after 25 min with no heartbeat ever | The notebook died before its first beat — usually the Drive mount or a missing tensor | Read `run.log` (the watcher prints its tail), check the Drive paths |
| Watcher relaunches every tick | The session dies faster than the heartbeat window, or the resume state is corrupt | Look for `⚠ could not resume` in the log; a truncated state file is a real case and the notebook starts that fold over |
| Relaunch says "no resumable state was available" | The checkpoint archive was never uploaded, or was deleted | Check the `Archive the resumable checkpoints` step of an earlier tick; a relaunch without it is a restart, and the log says so |
| Intake says `no bundle was staged` | The VM died before the watcher archived the bundle | Relaunch the run — the checkpoints make that a continuation, not a restart |
| Intake refuses: `parity … below 99.0%` | The ONNX→TFLite conversion changed predictions | Do not merge. This is a converter bug, not a threshold to relax. |
| Intake refuses: `not downloaded: …` | The VM died before the bundle was archived | Re-run intake with the run id; it falls back to the watcher's `retrain-bundle-<run_id>` artifact |
| Intake refuses: `on disk is … but the manifest claims …` | The download was truncated | Re-run intake |
| The PR's version string looks odd | It is `<package.json version>+model.<hash>`; the semver half follows `package.json`, the hash half follows the four artifacts | Bump `package.json` in the PR if the release deserves a new minor |

Every one of these is printed by the step that hit it, with the command and the tail of the output:
`ColabCliError` exists so that a maintainer reading a workflow log at 02:00, long after the VM is
gone, has something to act on.

---

## Doing it by hand

```bash
cd scripts

# What is in flight, and what happened to the last few runs?
python -m mlops.retrain_cli status

# Launch a run now (the CLI installs the Colab CLI, provisions, uploads, launches, writes the marker)
COLAB_TOKEN_JSON="$(cat ~/.config/colab-cli/token.json)" \
  python -m mlops.retrain_cli start --strategy event_kfold --gpu T4

# One watch tick, with the training log's tail
COLAB_TOKEN_JSON="$(cat ~/.config/colab-cli/token.json)" \
  python -m mlops.retrain_cli watch --tail

# Collect a finished bundle without opening a pull request
COLAB_TOKEN_JSON="$(cat ~/.config/colab-cli/token.json)" \
  python -m mlops.retrain_cli collect --run-id 20261001T180000-event_kfold

# Validate a bundle already on disk — no Colab, no network
python -m mlops.retrain_cli validate ../data/mlops/incoming/20261001T180000-event_kfold

# Regenerate the handshake after changing Models/ by hand (the canonical writer:
# `<package.json version>+model.<first 12 hex of sha256(the four artifact hashes)>`)
node scripts/gen-model-version.mjs

# Release the VM when you are done with it
colab stop --existing-session <session name>
```

To **abort a run**: `colab stop --existing-session <name>`, then set the marker's status to
`failed` (or let the watcher abandon it at the 15 h budget) and commit. To **run the notebook
interactively**, open it in Colab with a T4 runtime and run all cells: with no `run_config.json` on
the VM it trains under `event_kfold`, prints the same manifest, and touches no GitHub credential.

---

## Limits, stated plainly

* **A headless session has no Google Drive.** `colab drivemount` is interactive, so the
  automated path reads its data from Kaggle and keeps its durable state in GitHub artifacts.
  Anything that assumes a Drive path will work when you run the notebook by hand and fail under
  cron — which is why the notebook resolves both and says which one it used.
* **The free tier does not guarantee a T4.** Some months the launch will fail outright and the
  watcher will retry. If that becomes routine, the options are a Colab Pro+ seat, a self-hosted GPU
  runner, or a smaller epoch budget — in that order of cost.
* **Three attempts, then abandoned.** Each attempt resumes from Drive checkpoints, so a lost
  session costs an epoch rather than the run; but a session that dies every twenty minutes will
  exhaust the budget. The marker records how far each attempt got.
* **The OAuth token expires.** Google refresh tokens last until the account's password changes or
  the grant is revoked. When it does, the launch fails loudly and opens an issue — the retrain
  simply does not happen that month, and the champion model is unaffected.
* **Intake cannot prove the new model is *better*.** Verification scores (POD/FAR/CSI, reliability,
  drift) need observed outcomes, and a model trained today has none. What intake proves is narrower
  and still worth having: the bundle is the bundle its manifest describes, the conversion did not
  change predictions (99.0% hazard agreement), and it runs under the same `tflite-runtime` the daily
  forecast uses. The claim "this model verifies better" needs truth data from the nightly
  [`mlops.yml`](../../.github/workflows/mlops.yml) job and a named approver.
* **Merging is not promotion.** A merged pull request replaces the bundle the daily forecast runs
  and enters the registry as a `candidate`. `champion` requires
  `python -m mlops.cli promote --artifact … --report … --by <you>`, which refuses without an
  approver and without a passing challenger comparison. That is deliberate, and it is the one step
  in this pipeline no cron job can take.
* **The Colab CLI is young.** It is pinned by name, not by version, and its `ssh-run` convenience
  has a documented fallback to plain `ssh` with `colab ssh --proxy-mode` as `ProxyCommand`. If a CLI
  release breaks the launch, the failure is a `ColabCliError` naming the command — pin the version
  in the workflow's install step rather than debugging in place.

---

## Security

* `COLAB_TOKEN_JSON` is a refresh token for a person's Google account. It is written 0600 on the
  runner, used by the CLI, and never printed. A workflow that echoes it fails CI.
* The notebook holds no GitHub credential. It clones the public repository anonymously and
  shallowly, because it needs one module (`retrain_state`) and nothing else.
* Git operations use `GITHUB_TOKEN`, scoped per workflow: `contents: write` for the marker and the
  candidate branch, `pull-requests: write` for the PR, `issues: write` for the failure reports.
* Intake validates before it proposes: a bundle whose bytes disagree with its manifest never
  reaches a branch, so a truncated download cannot become a model update.
