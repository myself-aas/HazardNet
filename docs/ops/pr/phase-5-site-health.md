# Phase 5 — Verify the site-health record lands · `ops/site-health-verify`

**Base:** `main` @ `70a052a` → Phases 0–4. **Session branch:** `arena/02ded3da-hazardnet`.
**Date:** 2026-10-27. **Actions touched:** Action 9 (measured row + verification commands),
Action 21 (Phase 5 row), change log, `docs/ops/deployment.md` §4, `data/site-health/README.md`.
**Actions closed:** none — Action 9 stays **Open** until an owner observes a scheduled run
writing the record with no Pages build, and Action 12 stays owner-side. Nothing in this phase
is claimed closed on an intention.
**Constraint honoured:** free tier only, no new dependencies (both new scripts use `node:`
built-ins), `PUSH_TO_API` stays `false`.

## Phase table

| Phase | Branch (notional) | What it fixed | Status |
|---|---|---|---|
| 0 | `fix/openmeteo-shape-audit` | Shared normaliser, object + array contract, comments matching code | committed `c673472` |
| 1 | `fix/latent-route-sweep` | Reachability invariant, dated dispositions, shared query parser | committed `39e2e26` |
| 2 | `fix/cache-verify-then-write` | Verify-then-write on all read-through caches, hollow-point fixture | committed `fb52e3b` |
| 3 | `test/parity-value-assertions` | Provenance fixtures + value assertions for every edge integration test | committed `7dd2d35` |
| 4 | `chore/disposition-latent-routes` | historical/metrics deleted, kaggle scheduled (Action 24) | committed `3ebbaa4` |
| **5** | **`ops/site-health-verify`** | **The probe record lands, is served, is verified against three other surfaces, and every second runtime path gets a scenario** | **this commit** |
| 6 | `chore/action-12-close` | Owner binds Analytics Engine Production-only; endpoint fail-open 204 | next |

## What was actually broken

| Symptom | Evidence | Fix |
|---|---|---|
| The committed record had **no weather check at all** | `data/site-health/latest.json` @ `ran_at 2026-10-27T14:43:47Z` lists 8 checks; `weather_api` and `alerts_api` are absent even though `#107` added both steps to the workflow. The last successful scheduled run (`40523871728`, 14:43Z) predates that merge; no run has republished since. | The publish step now records `weather_api` **with a `detail` that names the missing field**, a new `runtime_paths` check, and `alerts_api` is already in the outcome list. `scripts/verify_site_health_record.mjs` rejects a failing check whose `detail` is `null` — a hollow failure is not accepted. |
| `/data/site-health/latest.json` was **not a URL** | The record lives in the repo root; Cloudflare Pages publishes `dist/`. A page fetch of the URL returned the SPA/noindex shell. | `scripts/copy-dist.mjs` copies the canonical record into `dist/data/site-health/latest.json` at the next ordinary build. The probe still triggers **no** build, so the CDN copy can lag by one deploy; the repo file and the run artifact are canonical. Documented in `data/site-health/README.md` and `deployment.md` §4. |
| The commit step ran **before** the aggregate check and was easy to lose on a red site | Step order in the old workflow: publish → commit → artifact → summary → enforce. | Aggregate check moved to step 18 with `continue-on-error: true`; commit is step 19 with `if: always()`; a final gate (step 23) makes the job red by reading `steps.aggregate.outcome`. A failing check therefore still writes the record. |
| A dispatch could never prove the record lands | The old publish step had `if: "${GITHUB_REF_NAME}" != "main" → exit 0`, and committed only on a **state change** — so a healthy dispatch produced no commit at all. | `workflow_dispatch` now adds `site_url` + `expect` (healthy/broken), publishes to `HEAD:${GITHUB_REF_NAME}` (never `main` from a dispatch), forces a publish for the dispatch event, and fails loudly if the push fails. |
| Nothing compared the record to the summary, artifact or status page | All four surfaces were written independently; `detail: null` on every check meant a red run sent triage to the step log. | `scripts/verify_site_health_record.mjs` compares `ran_at`, `outcome`, every check outcome/detail and `detail.failed` across record ↔ freshness artifact ↔ `$GITHUB_STEP_SUMMARY`; the uploaded artifact contains the same two committed files, asserted by the workflow's `--expect` step. |
| One-step monitors are blind to the second runtime path | `#107`'s weather probe covered single + batch GET only. ANALYTICS bound/unbound, cache hit/miss, mini/full, POST-only telemetry and POST batch had no scenario. | `scripts/probe_runtime_paths.mjs` runs **8 scenarios** with leaf value assertions. Scenario names are pinned by `__tests__/siteHealthRecord.test.js`. |

## The eight sibling scenarios

| # | Scenario | Second runtime path | Leaf asserted |
|---|---|---|---|
| 1 | `telemetry_post_204_bound_or_unbound` | ANALYTICS bound vs unbound | 204 (fail-open) |
| 2 | `telemetry_post_invalid_400` | validation in either sink state | 400 |
| 3 | `telemetry_get_405` | POST-only vs GET | 405 + `error: "method not allowed"` |
| 4 | `weather_cache_miss` | cold cache | `current.temperature_2m` is a finite number |
| 5 | `weather_cache_hit` | warm cache (same URL) | same numeric reading, not `{id,_meta}` |
| 6 | `weather_full_shape` | `mini` vs full response | `daily.temperature_2m_max[0]` is finite |
| 7 | `batch_get_two_points` | GET batch | `count === 2` **and** 2 numeric readings |
| 8 | `batch_post_two_points` | POST batch | `count === 2` **and** 2 numeric readings |

The one thing an external probe **cannot** distinguish is which sink accepted a telemetry event:
both the bound and unbound states answer 204 by design. That distinction is the Analytics Engine
SQL query in Action 12 (Phase 6), and the script says so in its output rather than faking a
`bound: true` field.

## Captured command output

### 1. Workflow contract, parsed (not eyeballed)

```
$ node -e "const y=require('yaml'),fs=require('fs');const d=y.parse(fs.readFileSync('.github/workflows/site-health.yml','utf8')); ... "
job permissions: {"contents":"write"}
workflow-level permissions block present: false
 1 -                  -                                                    Checkout repository
 2 -                  github.event_name == 'workflow_dispatch'             Apply workflow_dispatch overrides
 3 -                  -                                                    Set up Node.js
 4 -                  -                                                    Configure probe authentication
 5 edge_challenge     -                                                    Detect an edge challenge (Cloudflare "Just a moment…")
 6 homepage           -                                                    Probe homepage
 7 deep_links         -                                                    Probe deep links resolve with prerendered content
 8 security_headers   -                                                    Probe security headers
 9 sitemap            -                                                    Verify every sitemap URL resolves
10 forecast_data      -                                                    Probe forecast data (API, falling back to the committed snapshot)
11 alerts_api         -                                                    Probe the alerts API (the front door's live path)
12 weather_api        -                                                    Probe the weather proxy (single point and batch)
13 runtime_paths      -                                                    Probe the runtime sibling paths
14 status_page        -                                                    Probe the status page and its freshness artifact
15 content_pages      -                                                    Probe the generated content pages
16 canonical_host     -                                                    Probe the canonical www host
17 -                  always()                                             Publish machine-readable probe result
18 aggregate          always()                                             Enforce aggregate site-health probe outcome
19 -                  always()                                             Publish the probe result to the branch
20 -                  always()                                             Verify the committed record
21 -                  always()                                             Upload the probe result
22 -                  always()                                             Summarize
23 -                  always() && steps.aggregate.outcome == 'failure'     Fail the run when a check is red
```

Step 18 (`continue-on-error: true`) precedes step 19 (`if: always()`): the check's failure is
known before the commit, and cannot suppress it. Step 23 restores the red run.

### 2. Healthy sibling scenarios — all 8, with leaf values

```
$ node scripts/probe_runtime_paths.mjs --self-test
{
  "schema": "hazardnet-runtime-paths/v1",
  "base_url": "http://127.0.0.1:34319",
  "ran_at": "2026-10-27T18:48:06.105Z",
  "scenarios": 8,
  "failed": 0,
  "results": [
    { "name": "telemetry_post_204_bound_or_unbound", "status": 204, "pass": true,
      "detail": "204 — the fail-open contract holds whether or not ANALYTICS is bound" },
    { "name": "telemetry_post_invalid_400", "status": 400, "pass": true,
      "detail": "400 — validation still runs in either sink state" },
    { "name": "telemetry_get_405", "status": 405, "pass": true,
      "detail": "405 — POST-only route exists" },
    { "name": "weather_cache_miss", "status": 200, "pass": true,
      "detail": "200 with numeric current.temperature_2m = 31.1", "leaf": 31.1 },
    { "name": "weather_cache_hit", "status": 200, "pass": true,
      "detail": "200 with numeric current.temperature_2m = 31.1", "leaf": 31.1 },
    { "name": "weather_full_shape", "status": 200, "pass": true,
      "detail": "200 with current.temperature_2m = 31.1, daily.temperature_2m_max[0] = 36.7", "leaf": 36.7 },
    { "name": "batch_get_two_points", "status": 200, "pass": true,
      "detail": "200 with count=2 and 2 numeric current.temperature_2m readings" },
    { "name": "batch_post_two_points", "status": 200, "pass": true,
      "detail": "200 with count=2 and 2 numeric current.temperature_2m readings" }
  ],
  "note": "The bound/unbound sink distinction is verified by the Analytics Engine SQL query in Action 12; from the outside both states must answer 204."
}
$ echo $?
0
```

(Leaf values 31.1 / 36.7 come from the provenance-backed Open-Meteo fixtures captured
2026-10-27 — see `__tests__/fixtures/site-health/fixture.provenance.md`.)

### 3. Broken sibling scenarios — hollow points, named field, exit 1

```
$ node scripts/probe_runtime_paths.mjs --self-test=broken >/dev/null
[self-test] broken mock at http://127.0.0.1:40797
::error::weather_cache_miss: expected 200 with a numeric current.temperature_2m, got 200 (missing: current.temperature_2m)
::error::weather_cache_hit: expected 200 with a numeric current.temperature_2m, got 200 (missing: current.temperature_2m)
::error::weather_full_shape: expected the full shape with current.temperature_2m and daily.temperature_2m_max[0], got 200 (missing: daily.temperature_2m_max[0])
::error::batch_get_two_points: expected count=2 with 2 numeric readings, got count=2 readings=0 (missing: current.temperature_2m)
::error::batch_post_two_points: expected count=2 with 2 numeric readings, got count=2 readings=0 (missing: current.temperature_2m)
$ echo $?
1
```

### 4. Record parity — healthy

```
$ node scripts/verify_site_health_record.mjs --record __tests__/fixtures/site-health/healthy-record.json --freshness __tests__/fixtures/site-health/healthy-freshness.json --summary __tests__/fixtures/site-health/healthy-summary.md --expect pass
{
  "schema": "hazardnet-site-health-verify/v1",
  "record": "__tests__/fixtures/site-health/healthy-record.json",
  "ran_at": "2026-10-27T18:00:00Z",
  "outcome": "pass",
  "checks": 11,
  "weather_api": { "outcome": "success", "detail": null },
  "runtime_paths": { "outcome": "success", "detail": "8 sibling runtime paths passed" },
  "surfaces": { "freshness": true, "summary": true, "artifact": true },
  "problems": []
}
✅ site-health record pass — 11 checks, freshness artifact and run summary agree
$ echo $?
0
```

### 5. Record parity — wrong expectation is refused, with named fields

```
$ node scripts/verify_site_health_record.mjs --record __tests__/fixtures/site-health/healthy-record.json --freshness __tests__/fixtures/site-health/healthy-freshness.json --summary __tests__/fixtures/site-health/healthy-summary.md --expect fail
{
  "schema": "hazardnet-site-health-verify/v1",
  "record": "__tests__/fixtures/site-health/healthy-record.json",
  "ran_at": "2026-10-27T18:00:00Z",
  "outcome": "pass",
  "checks": 11,
  "weather_api": { "outcome": "success", "detail": null },
  "runtime_paths": { "outcome": "success", "detail": "8 sibling runtime paths passed" },
  "surfaces": { "freshness": true, "summary": true, "artifact": true },
  "problems": [
    "outcome: expected fail on a broken dispatch, got pass",
    "checks.weather_api.outcome: expected failure, got success",
    "checks.weather_api.detail: a broken route must name the missing field current.temperature_2m"
  ]
}
::error::site-health record: outcome: expected fail on a broken dispatch, got pass
::error::site-health record: checks.weather_api.outcome: expected failure, got success
::error::site-health record: checks.weather_api.detail: a broken route must name the missing field current.temperature_2m
$ echo $?
1
```

### 6. New test suite

```
$ npx jest __tests__/siteHealthRecord.test.js --ci --runInBand
PASS __tests__/siteHealthRecord.test.js
  site-health workflow contract
    ✓ contents: write is job-scoped, not workflow-scoped
    ✓ the aggregate check runs BEFORE the commit, and the commit is never gated on its exit
    ✓ the commit carries [skip ci] and the watch-path exclusion is documented
    ✓ both verification scripts are invoked and the record names the new checks
    ✓ workflow_dispatch offers healthy and broken expectations
    ✓ the served URL is produced at build time, not by a probe-triggered deployment
  verify_site_health_record.mjs — value assertions
    ✓ the checked-in healthy fixtures agree with each other and with the derived surfaces
    ✓ a broken route lands a failing weather_api check with the named missing field
    ✓ a hollow weather failure with detail: null is rejected instead of widened away
    ✓ an outcome that disagrees with checks[] is rejected
    ✓ a stale freshness artifact is rejected with the differing field named
    ✓ a run summary that quotes a different outcome is rejected
    ✓ a healthy expectation rejects a failing record
  probe_runtime_paths.mjs — sibling scenarios against a local mock
    ✓ all eight sibling scenarios pass against a complete mock, with the captured leaf
    ✓ the documented --self-test / --self-test=broken commands behave as written
    ✓ a hollow batch point fails with current.temperature_2m named on both GET and POST paths

Test Suites: 1 passed, 1 total
Tests:       16 passed, 16 total
```

### 7. Full verification matrix

```
$ npx jest --ci --silent
Test Suites: 2 skipped, 194 passed, 194 of 196 total
Tests:       24 skipped, 2093 passed, 2117 total

$ npx tsc -p frontend/tsconfig.json --noEmit
$ echo $?
0
$ npx tsc -p functions/tsconfig.json --noEmit
$ echo $?
0
$ node scripts/build_freshness_artifact.mjs --check
[freshness] --check: artifact matches its inputs (stale overall).
$ echo $?
0

$ node scripts/copy-dist.mjs
[copy-dist] Copied frontend/dist -> dist
[copy-dist] Published data/site-health/latest.json -> frontend/dist/data/site-health/latest.json
[copy-dist] Published data/site-health/latest.json -> dist/data/site-health/latest.json
$ find dist -type f | sort
dist/data/site-health/latest.json
dist/index.json
```

## Owner verification (the parts this sandbox cannot do)

A page fetch cannot dispatch a workflow, and `wrangler`/Cloudflare dashboard access is not
available here. **These are commands for the owner, not claims of results:**

```bash
# Healthy dispatch — record must land on the dispatched branch, weather_api: success.
gh workflow run site-health.yml --ref <this-branch> \
  -f site_url=https://hazardnet.live -f expect=healthy
gh run list --workflow=site-health.yml --limit 3
gh run view <run-id> --log | grep -E 'Verify the committed record|site-health record|published data/site-health'
git pull --rebase
jq '.outcome, (.checks[] | select(.id=="weather_api"))' data/site-health/latest.json

# Compare the committed record with the uploaded artifact and the served URL.
gh run download <run-id> -n site-health-result -D /tmp/site-health-result
diff data/site-health/latest.json /tmp/site-health-result/data/site-health/latest.json
curl -s https://www.hazardnet.live/data/site-health/latest.json \
  | jq '.outcome, (.checks[] | select(.id=="weather_api"))'

# No Pages build may be triggered by the "[skip ci]" commit.
npx wrangler pages deployment list --project-name=<project>   # before and after; identical

# Broken dispatch — record must show outcome: fail with current.temperature_2m named.
gh workflow run site-health.yml --ref <this-branch> \
  -f site_url=<a-deployment-with-hollow-points> -f expect=broken
git pull --rebase
jq '.outcome, (.checks[] | select(.id=="weather_api"))' data/site-health/latest.json
```

Action 9 closes only when all four surfaces agree **and** the deployment list is unchanged.
Action 12 (Analytics Engine binding, `VITE_ANALYTICS_ENABLED` Production-only, SQL query) is
Phase 6 and remains open; the `runtime_paths` monitor deliberately reports that it cannot see
which sink was used.
