# Verified three-hour Kaggle forecasts

## Status and scope

The automation, atomic Firebase serving path, profile card and workflow hardening
are implemented in the worktree. **This is not evidence of a live Kaggle execution
or production publication.** Provider setup and notebook scientific review remain
activation gates. Existing draft PR #21 contains the preceding Firebase remediation;
this change must also pass review and CI before activation on the default branch.

```
GitHub schedule (UTC 00,03,06,09,12,15,18,21)
  → pull approved private notebook and metadata
  → inject fresh nonce/header + provenance footer
  → push NEW Kaggle version (failure is fatal)
  → poll actual status, up to 90 minutes
  → download exact CSV + matching execution manifest
  → validate 128 rows, SI units, dates, district coverage, artifact hashes
  → one Firestore transaction publishes current snapshot, history and receipt
  → Express/Vercel bulk and district APIs → profile district card
```

GitHub cron is best-effort, not a punctual scheduler. A 25–30 minute notebook run
normally publishes after completion, not after a blind sleep. Quotas, queued Kaggle
sessions, network failures and invalid outputs can prevent a refresh. Failure
preserves the last successfully published snapshot; a six-hour monitor detects a
missed refresh. No workflow performs automatic emergency notifications.

## Required operator setup (do not put credentials in chat or Git)

1. Confirm the private **forecast notebook** owner/slug. The repository previously
   assumed `ashifahmedshuvo/hazardnet-auto-forecast-pipeline`; do not confuse it with
   the model-conversion notebook. The new workflow requires an explicit variable.
2. Create GitHub environment **`forecast-production`**, restrict deployments to the
   default branch, and decide an approval policy. Requiring a human reviewer on every
   deployment pauses every scheduled run; choose a policy compatible with unattended
   execution. Do not grant arbitrary PR branches these credentials.
3. Provision environment secrets:
   - `KAGGLE_USERNAME`, `KAGGLE_KEY`: identity authorized to pull/push that notebook
     and access its private datasets/model inputs.
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: narrowly scoped server Firestore writer.
     This pipeline does not need `BACKEND_API_KEY`, a Vercel token, or Firebase client keys.
4. Set environment variables:
   - `KAGGLE_KERNEL`: confirmed `owner/slug`.
   - `KAGGLE_SOURCE_SHA256`: approved source digest, computed below.
   - `FIREBASE_PROJECT_ID`: `hazardnet-aas48424`.
   - `FIREBASE_DATABASE_ID`: `ai-studio-hazardnet-55b49dbf-625b-492b-9cff-feabd729e843`.
5. Review/correct the notebook contract below. It must use the authoritative model
   and normalization files whose hashes are in `Models/VERSION.json`.
6. Complete the existing [Firebase/model rollout](firebase-model-rollout.md), including
   backup/privacy migration/rules and both deployment configurations. Latest APIs now
   read `forecast_publications/current` via Admin SDK; browser rules deny direct access
   to publication and run-receipt collections. The API is the public serving boundary.
7. Land reviewed changes through PR, with all checks including **Release gate** green.
   No direct push to `main`, auto-merge, automated tags or patch releases. The schedule
   only becomes active with this workflow on the default branch. Manually dispatch it
   there once, verify the run, then observe two scheduled publications.

The earlier provider audit found GitHub workflow-dispatch/environment-secret APIs
inaccessible, Firebase CLI unauthenticated, and no Vercel CLI session. If still true,
reconnect/authorize those integrations in Arena/provider settings. Do not paste keys.

### Source approval

Use an authenticated Kaggle CLI in a private temporary directory:

```bash
python -m pip install -r scripts/requirements-pipeline.txt
NOTEBOOK_DIR=$(mktemp -d)
kaggle kernels pull "$KAGGLE_KERNEL" -p "$NOTEBOOK_DIR" -m
PYTHONPATH=scripts python - "$NOTEBOOK_DIR" <<'PY'
import json, sys
from pathlib import Path
from kaggle_trigger import source_cells, source_digest
folder = Path(sys.argv[1])
metadata = json.loads((folder / 'kernel-metadata.json').read_text())
notebook = json.loads((folder / metadata['code_file']).read_text())
print(source_digest(source_cells(notebook)))
PY
```

Review the downloaded notebook before approving this digest. It covers code and
markdown sources, excluding execution outputs/metadata and previous automation
cells. The adapter strips its old cells before injecting a fresh nonce, so its own
previous execution does not change the approval digest. Source changes require a
new review/digest. Keep pulled source/logs private and out of the repository.

Kaggle metadata preserves inputs and compute settings. The adapter refuses a public
notebook. Review Earth Engine service-account dataset access separately: private
notebook visibility does not make a public credential dataset private. Rotate that
key if it was ever accessible publicly. Use least privilege for Earth Engine; do not
reuse a broadly privileged Firebase publishing credential inside the notebook.

## Notebook contract: `hazardnet-si-v1`

**The supplied notebook/CSV does not satisfy this contract. Do not add the contract
constant merely to bypass the gate.** Temperature values around 24–33 under `_k`
are Celsius, not Kelvin. The supplied wind/ET/solar conventions also need correction.
Corrections must apply before tensor normalization, model execution and physics
calculations; converting output labels cannot repair invalid model predictions.

| Output columns | Required values / backend conversion |
|---|---|
| `om_temp_2m_k`, `om_max_temp_k`, `om_min_temp_k`, `om_dewpoint_k` | Kelvin, finite 230–340; backend subtracts 273.15 once |
| `om_precip_m` | Whole-horizon precipitation in metres; backend ×1000 to mm |
| `om_wind_max_ms` | Maximum wind in m/s; backend ×3.6 to km/h |
| `om_solar_rad_j` | Whole-horizon J/m²; backend ÷1e6 ÷days to MJ/m²/day |
| `om_et_sum_m` | Whole-horizon evapotranspiration in metres; backend ×1000 ÷days to mm/day |

Open-Meteo defaults: explicitly request/convert wind to m/s, add 273.15 to Celsius,
convert precipitation and ET mm to m, and daily shortwave MJ/m² to J/m² using **1e6**,
not 1000. Retrieve enough daily values to cover tomorrow through UTC prediction date
plus 7 or 15 days, excluding today; do not sum 8/16 days and label them 7/15. Verify
these aggregates and features match the training contract, not just the suffixes.

Additional notebook review requirements:

- Fail on Earth Engine authentication/data-fetch failures, missing imagery/weather
  and district inference errors. Do not emit partial forecasts or silently replace
  missing physical observations with zeros/constant soil values.
- Validate model input shape, feature order, normalization and output head/label
  mapping against the repository bundle. Do not assume `output_details` list order
  identifies classification/severity heads.
- Separate maximum daily precipitation from horizon precipitation totals in physics
  formulas. Verify clipping/saturated severity/confidence values against reference
  cases; 1.0 outputs are not an accuracy certificate.
- Load downloaded NumPy data without `allow_pickle=True` where possible; do not
  unpickle untrusted data. Keep Earth Engine credentials outside output artifacts.
- Emit exactly one top hazard row for each of all 64 named Bangladesh districts for
  each horizon. Canonical district names/aliases are checked; ordinal IDs must be
  unique and consistent across horizons. UI selection is by name, **not ordinal ID**.
- Use one UTC `prediction_date` for the whole run and correct `target_date` offsets.
- Keep model/normalization source paths tied to the actual loaded artifacts. Once
  corrected and reviewed, expose these notebook globals:

```python
HAZARDNET_FORECAST_CONTRACT = 'hazardnet-si-v1'
HAZARDNET_MODEL_PATH = actual_loaded_model_path
HAZARDNET_NORMALIZATION_PATH = actual_loaded_normalization_stats_path
```

The injected footer hashes those artifacts and the exact CSV and writes
`hazardnet_run.json`. Python validation and the Node publisher both require the
model and normalization hashes to equal `Models/VERSION.json`. Artifact changes
therefore require a coordinated reviewed repository/model update.

## Why an old Kaggle output cannot count as this run

Kaggle SDK 1.8.4 exposes latest-only status/output calls; adding `/version` to the
slug is **not** a verified way to pin those calls. The push response supplies a new
version number, and injected code records a unique GitHub run/attempt + random nonce,
requested/start/completion timestamps, source hash and CSV hash. A previous COMPLETE
status can be observed, but its old marker cannot pass validation. The recorded
version comes from the successful push response. Wrong/missing output is retried
within the deadline; a matching run with invalid CSV fails immediately. An ambiguous
push/network failure is not retried as another push. No arbitrary CSV fallback exists.

The production trigger does not call the legacy `fetch_kaggle_forecast.py` or legacy
validator/parser. Those remain tools for historic compatibility, not publication
certification. Their permissive/manual behavior cannot advance the current snapshot.

## Firebase publication and profile behavior

- `forecast_publications/current`: manifest + 128 normalized rows + publish timestamp,
  written as one transaction with the historical rows and `forecast_runs/{run_id}` receipt.
- Same-run replay is idempotent; conflicting digests and out-of-order runs are rejected.
  Transaction contention rechecks the current marker. No two scheduled writers compete.
- Stable history IDs replace that date's previous horizon/district predictions; obsolete
  legacy rows for the date are deleted inside the same transaction. Oversized legacy
  cleanup is rejected before writes and requires a separate reviewed migration.
- Latest APIs read the whole current snapshot before filtering; individual reads cannot
  mix executions. A missing snapshot permits legacy rollout fallback. A database read
  error does not silently substitute the legacy database collection.
- Both Express and Vercel reuse this store. Existing latest district/bulk endpoints
  expose execution provenance on rows; `/metadata` exposes the publish timestamp.
- The dashboard overview uses `primaryDistrict`, then `district`, with district alias
  matching and 7/15-day selection. It shows model/physics severity, confidence, dates,
  and freshness. Missing profile/location/data is explicit. Confidence is not represented
  as a calibrated probability of harm.
- Browser polling remains every five minutes. Legacy committed snapshots are **offline
  fallbacks only**, no longer auto-committed or rebuilt. The profile card labels them
  unverified/stale. Historical map fallback behavior remains separate from this card.

## CI/CD and recovery

All external actions are pinned to immutable commits; Dependabot still updates Actions.
CI has read-only permissions, npm lock installs without redundant `node_modules`/build
caches, merge-queue/manual triggers, and one required Release gate covering every job.
Existing model, rules, frontend, backend, security and E2E checks remain required.
Site health checks ingestion age (six hours), both 64-district horizons and run identity.
Firebase verification uses the protected production environment and default-branch guard.
Hourly/weekly/manual legacy workflow entry points are dispatch-only retirement notices;
they cannot publish data, push commits, or create tags/releases.

On failure, inspect Actions and private Kaggle status. Only validated CSV/manifest/JSON
and publication receipt are retained as Actions artifacts for 14 days; notebook source,
Kaggle logs and credentials are never uploaded. GitHub Actions failure notifications
must be enabled by operators. Review Kaggle daily/weekly compute quotas: eight runs/day
at 30 minutes uses about 28 compute hours/week; queued/retried execution may exceed it.

Recovery is a fresh dispatch of the same pipeline after correcting the cause. Do not
re-enable old CSV writers or change the live pointer to an older run. For a model/code
rollback, restore the reviewed notebook/model contract, update approval/configuration
through review, and generate a **new** execution. Stop the schedule via Actions when
investigating, not by force-pushing default-branch history. Retain Firebase backups;
per-run receipts are provenance records, not a complete disaster-recovery backup.

## Local verification and handoff — 2026-09-14

Executed against these worktree changes:

```text
python -m pytest scripts/tests -q
59 passed

npx jest --runInBand
Test Suites: 49 passed, 49 total
Tests:       452 passed, 452 total

npm run lint                       # TypeScript: exit 0
npm run lint:eslint                 # 0 errors, 276 existing warnings
npm run build                      # built successfully
npm run check:bundle                # PASS, 1130.0 kB gzip
npm run check:env                   # PASS
npm run check:rag-freshness          # PASS
node scripts/npm-audit-ci.mjs       # critical=0 high=0 moderate=4; PASS
bash scripts/check-secrets.sh       # PASS
```

Tests cover old-complete output rejection, nonce/hash/model pin mismatches, invalid
and partial CSVs, timeouts, failed pushes/execution, authoritative unit conversion,
idempotent/monotonic transactional publication, atomic cleanup limits, serving
snapshot reads, profile selection/horizon/loading/fallback states and workflow guards.
These are offline/mocked contracts, **not** a live Kaggle/Firebase integration test.
Rules/model/browser checks remain in CI; earlier green CI for `10cd584` does not
certify these new changes. No new remote CI or deployment is claimed.

Following the requested Git workflow, attempted:

```text
git commit -S --signoff -m "feat(forecasts): publish verified three-hour Kaggle executions"
error: cannot run gpg: No such file or directory
error: gpg failed to sign the data
fatal: failed to write commit object
commit_exit=128
head_before=10cd58470b9112129b19379368469f15f9132b1a
head_after=10cd58470b9112129b19379368469f15f9132b1a
```

The initial attempt left HEAD unchanged and all changes saved locally. The operator
then **explicitly authorized an unsigned, signed-off commit** for this change, with
push restricted to the existing session branch `arena/01a0a0a6-hazardnet` and draft
PR #21. This is a one-change signing waiver, not a repository policy change.
Remote CI must be checked on the resulting commit. Never commit directly to or
push `main`.
