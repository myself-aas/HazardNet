# Audit — the CI fleet's standing failures, and the fabricated series the claims gate cannot see

**Date:** 2026-09-19 · **Scope:** all 13 files in `.github/workflows/` plus the five in
`.github/workflow-templates/`; the two red jobs on `main` (run `35431686874`), the red
`Site Health Probe` (runs `35429281418` and the six before it), the red `HazardNet Daily
Forecast Pipeline` (run `35428338259`), the red `Hindcast (Phase 9)` commit step (runs
`35430992137`, `35430976805`); and — found while closing the embargo question — the
generated chart series in `frontend/src/data/disasterDetails.ts`,
`frontend/src/pages/DistrictDetailPage.tsx` and `frontend/src/components/ThirtyDayTrendChart.tsx`.
**Severity:** the workflow defects are high (a fleet where three jobs are always red stops
being read); §3 is **critical** (visitor-facing numbers that no data source produced).

---

## 1. What was red, and why

| Run / job / step | Symptom | Cause | Fix |
| --- | --- | --- | --- |
| `ci.yml` → *Code Quality & Build* → "Committed content index matches this build" | `content-index.json is stale` on every push to `main` | Genuine drift: the `/archive` route joined `frontend/src/content/site-routes.json`, so the build prerenders **99** HTML files and lists **90** sitemap URLs; the committed index still said **98 / 89**. It was committed before the route landed, and the daily pipeline that would have refreshed it was itself red | Rebuilt (`npm run build:frontend`, verified byte-stable across two runs) and committed `content-index.json` + `generated-routes.json` |
| `ci.yml` → *E2E Tests* → "Run E2E tests" | 18 failed / 118 passed | Nine tests × two projects, every one on the same evidence: `502 http://127.0.0.1:3000/api/v1/forecasts/bulk…` and `502 …/api/predict`. The job serves the built frontend with `vite preview`, whose proxy targets `127.0.0.1:3001` (`frontend/vite.config.ts`), and no backend is started — so the *proxy* answers 502 for every API call | §2.1: the QA suite now treats gateway statuses on `/api` as environmental **only** when the runner declares it has no API runtime (`QA_NO_API_RUNTIME=1`, set by this job), and a new positive test proves each forecast surface resolved rows from the API or the committed snapshot |
| `site-health.yml` → *probe* → "Publish the probe result to the branch" | `exit code 128` | The job had **no `actions/checkout`** — no working tree at all, so `git` died with `fatal: not in a git directory`, and the freshness rebuild could only warn `could not rebuild the freshness artifact` because the script was not on disk | checkout@v7 + setup-node@v7 added (no `npm ci`: the script imports `node:` builtins only), push made explicit (`HEAD:main`) |
| `site-health.yml` → *probe* → "Probe the generated content pages" | Red on every run since the step was written | It required **every** sampled path to carry the prerenderer's `HN_STATIC_START` marker — including `/data/content-index.json`, which is a JSON artifact and can never carry an HTML marker. The failure was always that one path while all ~20 HTML pages passed | Each path is now checked against the contract it has: HTML → the prerender marker; `*.json` → valid JSON carrying its `schema` field. Verified against production (`hazardnet.live/data/content-index.json` serves `schema: hazardnet-content-index/v1`) |
| `hindcast.yml` → "Commit the drivers, the reports and the artifacts derived from them" | `Process completed with exit code 128`, after every scoring step passed | Two candidate causes, both real: (a) the step ran `npm run build:frontend`, which regenerates the *stale* content index above, so there was always something to commit and the step always reached `git push`; (b) a bare `git push` exits 128 when there is no upstream or the checkout is not on a local branch. Logs are unreachable (Actions log blobs 404 from the API), so both were closed | The content-index drift is fixed at the source (row 1). `git add` now stages only paths that exist — `git add <pathspec>` is *fatal* when a pathspec matches nothing — and the push uses an explicit refspec with branch/remote diagnostics in the job summary |
| `daily_forecast.yml` → "Execute pipeline" | Failed in 1 m 46 s (a healthy run takes ~19 min), no readable cause | `scripts/auto_forecast.py` calls `ee.Initialize()` at import time with nothing around it, so a rotated or malformed service-account key surfaces as a bare traceback one minute in | §2.2: a ~10 s preflight that parses the key, checks its fields, cross-checks `EE_SERVICE_ACCOUNT_EMAIL` against `client_email`, authenticates and issues one trivial EE call — each failure mode named, with the owner action that fixes it. The generator's output is now tee'd, and its last 40 lines go to the job summary and the artifact |
| `daily_forecast.yml` → "Run the alert engine" | **Latent** — never failed, because it never ran | §2.3 | §2.3 |
| `Postgres-cutover-verify.yml` → "Verify Postgres schema" | **Latent** — dispatch-only, and every dispatch would die with `Cannot find module` | It invoked `scripts/verify-postgres-cutover.mjs`, which has never existed. So have `scripts/db/002_forecasts_postgres.sql` (apply-order item 2 in `scripts/db/README.md`, cited by ADR 0002) and `scripts/migrate-firestore-to-postgres.mjs` (runbook step 3) | The workflow now preflights the three paths, names each missing one as an `::error::`, writes the gap to the job summary, and still runs the live backend smoke test (which needs none of them). The dead invocation is gone, with the exact step to restore spelled out in a comment. Owner decision: `docs/ops/owner-actions.md` **Action 14** |
| `/download` (the last red route in the QA suite) | 7 external requests failing per page load | The page queried `registry.npmjs.org/hazardnet` and `pypi.org/pypi/hazardnet/json` for packages this project has never published | **ADR 0011**: no registry publication, no registry queries. The lookups, their types, the ownership guard and both `VITE_*_PACKAGE_NAME` variables are removed; the page makes no network request by default; each channel states what is distributed; `package.json` is `"private": true` |
| `scripts/check-severity-embargo.mjs` review tier | Two composite-index blocks printed as "awaiting owner classification" on every run since the checker landed | Nobody had answered the question the review tier exists to ask | **ADR 0012**: both classified `presentation-aggregation`, kept, labelled — and the label is now enforced (missing or drifted label ⇒ build failure) |

`weekly_forecast.yml`'s historical failure (run `34744501583`) is **not** a current defect: it
ran against commit `a91e62c`, whose workflow file differs from `main`'s. `mlops.yml`,
`model-validation.yml`, `v3-ml-contracts.yml`, `verify-secrets.yml` and the three Kaggle-backed
pipelines were green and are unchanged except for the push hardening below.

## 2. The three defects worth reading

### 2.1 A mute that is only honest if something else asserts the truth

Muting `502 /api/...` in the QA suite would have made 18 tests green and taught nobody
anything: the same mute would hide a real gateway failure. So the change is three-part.

1. **The mute is scoped to statuses that mean "no runtime here"** — 404/501 (nothing serves
   that path; production's `/api/v1/forecasts/*` 404 is a known owner action) and 502/503/504
   (a proxy answering for a backend that is not running). **A 500 is never excused**: that is an
   API runtime failing, wherever it runs.
2. **It is opt-in per runner.** `QA_NO_API_RUNTIME` is set by the CI job that starts
   `vite preview` and no backend. Point the same suite at a deployment that *does* run the API
   and a 502 reddens the run again.
3. **A positive witness replaces the trust.** `Forecast data source — the ADR 0008 fallback
   chain` walks `/live`, `/forecast/overview` and `/forecast/district/dhaka` and asserts each
   resolved its rows from the API *or* from `/data/forecasts-latest.json`. The mute and the
   witness were added together; a mute without the second half is how a broken fallback stays
   green.

### 2.2 A preflight that names the cause instead of the exit code

The daily generator's failure mode was informative only in its timing: 1 m 46 s means it died
before the first district fetch. `ee.Initialize()` runs at import time with no handler, so the
log carried a traceback and no verdict. The new preflight separates four causes that all look
identical from the outside — secret not valid JSON, secret not a complete service-account key,
`EE_SERVICE_ACCOUNT_EMAIL` describing a *different* account than the key, and GEE rejecting a
well-formed key — and each prints the owner action that resolves it. It costs ~10 s on a
19-minute job.

### 2.3 A syntax error that only arms itself when the feature works

```bash
if [ -z "$HAZARDNET_API_KEY" ] || [ -z "$BACKEND_API_URL" ]; then
  echo "::notice::alert engine skipped: …"; exit 0        # ← every run so far
fi
…
  || { echo "::error::alert run report carries no alert rows …"; exit 1; }"    # ← stray quote
```

The trailing `"` is unbalanced, so bash reaches end-of-input looking for its partner — a
syntax error. It never fired because the credential guard returns before bash parses that far:
the step exited 0 on every run in which the alert engine was *not* configured, and would have
failed on the first run in which it *was*. A defect that activates when the feature it guards
starts working is the worst kind to leave in a file.

Fixed, and now guarded fleet-wide: `test_every_run_block_is_valid_shell` runs `bash -n` over
every `run:` block in all 13 workflows and all 5 templates (18 files, `${{ }}` rewritten to
`${ }` first, since GitHub substitutes before the shell sees the script). It found exactly this
one error and nothing else.

## 3. Found while closing the embargo question: series that no data source produced

Classifying the composite-index blocks meant reading every derived number on the national
overview, which led to the district surface. `docs/RUNBOOK_LOG.md` records a prior sweep that
removed **30 fabricated readouts across 9 files** — the 98.4 % softmax stamp, the 38.4 ms /
98.55 % / ±0.03 telemetry strip on `DistrictDetailPage`, the "TensorFlow Spatial Attention
Model v4.8" line. That sweep fixed the *literal* numbers. What remains is the *generated*
kind, which the claims gate cannot see because there is no literal to register:

| Where | What a visitor is shown | What produces it |
| --- | --- | --- |
| `frontend/src/data/disasterDetails.ts` | "Max Sustained Wind Speed 143 km/h", "Predicted Storm Surge Height 3.6 m", "SPEI Drought Index −1.65 (Extreme)", "Radar Echo Intensity 58 dBZ", attributed to a named sensor station | `Math.round(110 + sev * 65)`, `(2.2 + sev * 2.8).toFixed(1)` — linear functions of the district's severity score. No sensor is queried |
| same file | A four-way "softmax probability distribution" | `0.62 + sev * 0.32`, remainder split 0.55/0.25/0.20 |
| same file | `incidentDate: '2026-07-31 06:00 BST'`, `lastSatelliteUpdate: 'Sentinel-1 SAR • 2026-08-01 03:20 UTC'`, "closely aligns with Cyclone Sidr (2007) and Amphan (2020)", "severe driest period recorded in Barind since 2016" | Hardcoded strings. The historical comparisons are claims about the real world that nothing in the repository supports |
| `DistrictDetailPage.tsx:277` (`telemetryTrendData`) | A 24-hour "Water Stage Level" area chart in metres with a red **"Danger Threshold"** reference line | Comment says `Simulated 24-Hour Telemetry Sparkline`; values are `baseLevel + Math.sin(i/8·π)·(1.8 + sev·1.5) + i·0.15` |
| `DistrictDetailPage.tsx:354` (`hazardTrendData`) | A 7-day chart of the district's hazard, **"Compound Vulnerability"** and **"Historical Seasonal Benchmark"**, plus a `NN / 100` peak readout | `baseSev + sin·14 + i·1.8`; `primaryRisk·0.78 + i·2.1 − 5`; `55 + cos(i·0.7)·8` — the "historical benchmark" is a cosine with no history behind it |
| `ThirtyDayTrendChart.tsx:51` | A 30-day anomaly chart with a **"Catastrophic Threshold (75 %)"** line and tooltips dated "…, 2026" | Comment says `Simulate weather anomaly waves around day 12-18 and day 24-28` |
| `DistrictDetailPage.tsx:441` | A printable **"HAZARDNET OFFICIAL DISASTER INTELLIGENCE BRIEF"** quoting "Station Telemetry: <metric>: <value>" | The fabricated values above, formatted as an official brief |

Against the standing constraints this is C2 (*real data only*) and C3 (*every published number
auditable and traceable*), and the "official brief" makes it worse: the fabrication is
exportable, on letterhead, with a danger threshold on it. Two of these series also sit inside
the embargo's subject matter — "Compound Vulnerability" is a weighted composite on a visitor
surface, which is the same shape ADR 0012 had to classify for the national overview.

**Why no gate caught it.** `scripts/check-claims.mjs` scans public copy for *metric-shaped
numbers* and requires each to be registered in `docs/CLAIMS.md`. A computed value
(`Math.round(110 + sev * 65)`) has no literal to find, so the gate passes — it reports
"75 sources scanned, 20 registered values" over a tree that renders hundreds of unregistered
numbers per district. The embargo gate has the same shape of blind spot for anything not
phrased as derivation language.

**Not fixed here, deliberately.** Removing or rewiring these charts is a product decision with
three defensible answers — delete the panels, label them unmistakably as illustrative, or feed
them from real telemetry (the Open-Meteo drivers the pipeline already fetches) — and each
changes what `/forecast/district/:id` looks like. It is recorded as
`docs/ops/owner-actions.md` **Action 15** with the evidence above.

## 4. What is now guarded

| Guard | Where | Catches |
| --- | --- | --- |
| `test_every_run_block_is_valid_shell` | `scripts/tests/test_workflows.py` | A shell syntax error in any `run:` block of any workflow or template (18 files) |
| `test_workflows_only_invoke_scripts_that_exist` | same | A workflow invoking a file that is not in the repository, or an `npm run` script no manifest defines. Commented-out invocations are exempt (that is documentation) |
| `__tests__/severityEmbargo.test.js` (13 tests) | root jest suite | Registry shape; label enforcement (deleted ⇒ block, drifted beyond `LABEL_WINDOW_CHARS` ⇒ block); case-insensitive matching; no blanket allowlist; CLI exit code and both output formats; **and the exact list of still-undecided review items**, so a second open question fails instead of joining the noise |
| Explicit push refspecs + diagnostics | `daily_forecast`, `hindcast`, `forecast-pipeline`, `hourly_forecast`, `manual_forecast_ingest`, `site-health` | The `exit 128` class: no upstream, detached HEAD, missing pathspec. The job summary now carries `git status --short --branch`, the last commits and the remote |
| `QA_NO_API_RUNTIME` + the fallback-chain witness | `e2e/full-app-qa.spec.ts`, `ci.yml` | A gateway error being excused where an API runtime exists, and a mute outliving the fallback it depends on |

## 5. Verified locally

```
npm run lint (tsc)                    clean
npm run lint:eslint                   0 errors / 286 warnings (all pre-existing)
jest  (backend + root)                53 suites, 598 tests passed
jest  (frontend)                      34 suites, 390 tests passed
python -m pytest scripts/tests        566 passed, 3 skipped   (21 of them workflow guards)
npm run check:embargo                 PASS — classified: 2, review: 1 (pinned, ADR 0012)
node scripts/check-claims.mjs         PASS — 75 sources, 20 registered values
npm run check:bundle                  PASS — 1194.7 kB gzip total
npm run build:frontend                succeeds; content index byte-stable across two runs
ci.yml step 18 comparison             ✅ the committed content index describes this build
archive:check / archive:rag:check     PASS
build_content_engine --check          75 routes match their inputs
build_model_performance --check       5 episodes match their reports
build_freshness_artifact --check      artifact matches its inputs
bash -n over every run: block         18 files, 0 failures
```

Not verifiable from this sandbox: the Playwright run itself (no browser download), any GitHub
Actions run (log blobs are unreachable from the API — findings above come from check-run
annotations plus local reproduction), and anything needing the Postgres or Earth Engine
credentials.

## 6. Left open, on purpose

1. **`NationalOverview.tsx:434`** prints `Vulnerability Formula = (Division Avg District
   Severity × 0.6) + (High Risk Ratio × 0.4)`. Explicit coefficients on a visitor surface, and
   the owner directive covered the *composite-index* blocks. A new `review`-tier rule
   (`weighted-formula`) reports it on every run until it is classified — ADR 0012, "Not decided
   here".
2. **§3 above** — Action 15.
3. **The daily forecast's Earth Engine credential.** If the 2026-09-19 02:00 UTC failure was a
   key rotation, only the owner can complete it; the preflight now says so in words instead of
   as a traceback (`docs/ops/owner-actions.md`, Action 1b).
4. **Production `/api/v1/forecasts/*` still 404s** (Vercel Root Directory). ADR 0008's snapshot
   fallback is the delivery path and the QA suite now proves it resolves; the underlying
   deployment fix is Action 2a-bis.
