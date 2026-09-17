# HazardNet — Phases 0–9: the audit

**Date:** 2026-09-18 · **Branch audited:** `arena/01a0afa0-hazardnet` · **Auditor:** the agent that
did the work, which is stated because a self-audit has a known bias: everything below is written
against **artifacts in this repository**, and where an artifact does not exist the verdict says so
rather than inferring it from intent.

**The question this answers:** *are phases 0–9 of the deployment plan complete?*
**The short answer:** **six phases are complete (0, 1, 2, 3, 5, 7), three are complete in-repository
and blocked on owner action for their last mile (4, 6, 8), and one — Phase 9 — is half done: the
validation half is now evidenced, the launch half is not.** Nothing in the plan is blocked on
engineering. Four things are blocked on credentials or people: the leaked-credential rotation, the
deployment root + live headers, the calibration map (which needs the event archive loaded), and the
tabletop exercise.

---

## 1. How to read this audit

**Status vocabulary** (used strictly, never as a compliment):

| Mark | Means |
| --- | --- |
| ✅ **Verified** | the artifact exists in the repository, is tested, and the claim can be reproduced by a command named here |
| 🟡 **Verified in-repo, owner-gated** | the code and tests exist; the *outcome* the phase promises needs a credentialed human step that has not happened |
| ⛔ **Owner-only** | no engineering work can substitute; a person with credentials or authority must act |
| ❌ **Not done** | no artifact, or an artifact that does not carry the claim |

**Evidence rule:** every row below names a file, a commit, a test module, a workflow or a command.
If a claim has no such citation, it is not made.

**Honesty rule:** nothing in this audit restates the 2,931-event figure, an accuracy figure, a
lead-time skill figure, a subscriber count or a portal listing as *achieved*. Where those appear,
they are labelled with what the repository actually knows about them.

## 2. The verdict at a glance

| Phase | Plan's intent | Verdict | The evidence that decides it | The one thing missing |
| --- | --- | --- | --- | --- |
| **0** | Ground truth: what is deployed, what it claims, what is true | ✅ **Verified** | `docs/PRODUCT_SPEC.md`, `docs/MODEL_CARD.md`, `docs/audits/2026-09-17-live-surface-audit.md` (commit `3651bc5`); unverifiable claims retired; `scripts/tests/test_model_claims.py` | nothing |
| **1** | Target architecture, technology decisions, one-inference-path ADR | ✅ **Verified** | `docs/architecture/TARGET_ARCHITECTURE.md`, `docs/adr/0001…0010` (commit `0337e4c`) | nothing |
| **2** | Data pipeline: ingestion, event store, COG contract, scene lineage | ✅ **Verified** | `scripts/etl/` + `scripts/db/008_hazard_events_postgis.sql` (commit `24e79f1`), `docs/phase-reports/phase-2-data-pipeline.md`, 4 ETL test modules | the archive itself is owner-side (Action 12) |
| **3** | MLOps: registry, calibration, evaluation, drift, promotion | ✅ **Verified** | `scripts/mlops/` (commit `951085b`), 6 test modules, `docs/phase-reports/phase-3-mlops.md` | no *fitted* calibration map (Phase 9) |
| **4** | Backend + alert engine with the §1.6 human gate | 🟡 **Owner-gated** | commit `e15eb8f` + `47d7c1a`; the engine stops every row above `WATCH` with `warning_requires_calibration`; `__tests__/alerts/` | thresholds are placeholders; duty officers, channels, subscriber list are owner actions (5a–5d) |
| **5** | Frontend: alert UI, bilingual, offline, exports | ✅ **Verified** | commits `18295b5`, `9dfee27`, `47d7c1a`; `docs/phase-reports/phase-5-frontend.md`; `scripts/tests/test_frontend_alert_surface.py` | Bengali copy wants a native-speaker review (Action 6c) |
| **6** | Security pass | 🟡 **Owner-gated** | commit `2315b19` + `4227bc0`; `docs/phase-reports/phase-6-security.md`: eleven findings, nine fixed in-repo | the leaked credentials are still live (Action 1) and the live headers are still unverified (Action 7) |
| **7** | Observability: freshness artifact + status page + probe | ✅ **Verified** | commit `ebd67e9`; `frontend/public/data/freshness.json`, `/status`, `.github/workflows/site-health.yml` | the probe stays red until Action 7 |
| **8** | SEO + content engine + structured data | 🟡 **Owner-gated** | commit `c9a4f70`; `docs/phase-reports/phase-8-seo-content.md`: 96 prerendered pages / 87 sitemap URLs, 9 tests | Search Console/Bing submission and every portal listing are owner actions (10, 11) — **none has been made, and none is claimed** |
| **9** | Validation (hindcast + calibration) and soft launch | ❌ **Half done** | `docs/phase-reports/phase-9-validation-and-soft-launch.md`; four CI-verified hindcast reports; `scripts/tests/test_hindcast.py` (23 tests) | calibration map, tabletop, metrics page, beta gate |

**Score: 6 ✅ · 3 🟡 · 1 ❌.** The ❌ is one phase, not one deliverable: its validation half is now
the strongest evidence the project has, and its launch half is deliberately closed.

## 3. Phase detail

### Phase 0 — Ground truth ✅

*Delivered:* a product contract (`docs/PRODUCT_SPEC.md`) that names the defects where the shipped
system contradicted it — partial silent coverage, degenerate forecasts, a non-independent physics
track, confidence semantics that no calibration supported, synthetic input channels, two inference
paths, missing provenance — and a **verifiable** model card (`docs/MODEL_CARD.md`). The retired
claims (98.8 % accuracy, 95.6 %, ~1.2 M users) are recorded as retired, and
`scripts/tests/test_model_claims.py` fails a build that reintroduces them.
*Audit note:* the 2,931-event figure is carried as **"reported, not verified"** in the model card,
the loader reports drift against it rather than asserting it, and this audit does not restate it any
other way. That is the correct handling; nothing further is needed from Phase 0.

### Phase 1 — Architecture ✅

*Delivered:* `docs/architecture/TARGET_ARCHITECTURE.md` — verified current state, target with explicit
data ownership (Firestore for forecasts, Postgres for alert lifecycle/audit, batch-only inference,
committed snapshot for availability), the five interfaces to freeze, and a keep/reject/defer table
where every plan recommendation carries **the trigger that would end its deferral** (no Next.js
rewrite, no FastAPI, no Kubernetes, no Triton, no Redis, no Vault, no MLflow for a one-job
single-maintainer deployment). Ten ADRs, including 0009 (one inference path).

### Phase 2 — Data pipeline ✅

*Delivered:* ingestion ETL with an event loader that *reports* drift against 2,931, the COG contract,
`scripts/db/008_hazard_events_postgis.sql`, per-prediction scene lineage
(`scripts/etl/scene_manifest.py`), coverage accounting, row provenance. Test modules:
`test_etl_events.py`, `test_etl_pipeline_lineage.py`, `test_etl_sources_cog.py`,
`test_etl_hydrology_bulletins.py`.
*Remaining:* the archive itself. `docs/ops/owner-actions.md` **Action 12** presents three coherent
options (load privately / deposit with a DOI / leave out). Until one is chosen, every district page
says "no archive loaded", which is the honest state and is enforced by a test.

### Phase 3 — MLOps ✅

*Delivered:* `scripts/mlops/cli.py` (`audit|registry|evaluate|drift|calibrate|apply-calibration|promote`),
metrics, an evaluation harness with `match_pairs`/`score_evaluation`, drift detectors, a model
registry, and the ambiguity/exclusion accounting the Phase 9 hindcast then reused. Six test modules;
`docs/phase-reports/phase-3-mlops.md`.
*Audit note:* the harnesses shipped; **none is fitted** — that is by design and is Phase 9's work.

### Phase 4 — Backend and alert engine 🟡

*Delivered:* `backend/alerts/assess.js` (rules, severity, blockers), the §1.6 human-in-the-loop gate,
SMS/Telegram delivery adapters, alert lifecycle persistence (ADR 0010), and the snapshot wiring from
`47d7c1a`. The engine **stops every row above `WATCH`** with `warning_requires_calibration`, and the
tests assert that (`__tests__/alerts/assess.test.js`, `report.test.js`). In the observed run the
blocker fired on all 74 rows — the intended, documented behaviour.
*Owner-gated remainder:* Action 5a (set the thresholds or accept the defaults **in writing**), 5b
(name the duty officers), 5c (choose channels + create credentials), 5d (create the subscriber
list). No subscriber count exists anywhere in this repository, and none is claimed.

### Phase 5 — Frontend ✅

*Delivered:* alert UI, a bilingual surface (137 keys per language, 274 strings — the corrected,
measured count), offline + low-bandwidth path, PDF/CSV export, and the alert-detail surface. Test
coverage: `scripts/tests/test_frontend_alert_surface.py` plus jest suites for `alerts/`.
*Owner-gated remainder:* Action 6c (native-speaker review of the Bengali copy), Action 6d
(accessibility walk-through on real devices), and Action 6a — **a model version, or nothing can be
published**: the site shows nothing above `WATCH` until a model version exists.

### Phase 6 — Security 🟡

*Delivered:* eleven findings from the audit; nine fixed in-repo with tests for each fix (Firestore
rules, blog/connector authorization parity, error sanitisation, secret-scan gate improvements). See
`docs/phase-reports/phase-6-security.md` and `docs/audits/2026-09-18-secret-scan-false-negative.md`.
*Owner-gated:* **Action 1 (rotate the leaked credentials)** is still the highest-priority item in the
repository and is untouched by every phase since — it is a `🔴 P0` owner action and cannot be
performed by code. **Action 7** (deployment root + confirm the live headers) is likewise owner-side;
until it is done, the security-header probe is red *by fact*, not by oversight.
*Audit note:* the repository is clean of those credentials in the sense that matters to an audit —
they are not used by any test, and the gate that should have caught them now does — but they remain
live at the provider until a human rotates them.

### Phase 7 — Observability ✅

*Delivered:* `scripts/build_freshness_artifact.mjs` → `frontend/public/data/freshness.json`
(schemas `hazardnet-freshness/v1`), the static `/status` page, the probe result published to the
branch, and `.github/workflows/site-health.yml` probing deep links, headers, sitemap honesty and the
generated content pages.
*Audit note:* freshness currently reports `overall.state = unknown` with one source not fresh
(`site_probe`) — which is the artifact doing its job: it says it does not know rather than
presenting green.

### Phase 8 — SEO and content 🟡

*Delivered:* the content engine (`scripts/build_content_engine.mjs`) generating 96 prerendered HTML
files / 87 sitemap URLs — per-hazard methodology pages, all 64 district hazard profiles, retrospectives
(suppressed while no archive is loaded), plus structured data (`WebSite`, `Organization`, `Dataset`,
`FAQPage`, `BreadcrumbList`, `Person`s) with a build-time `--check` against the committed snapshot, a
canonical host decision (apex), and nine tests including one that *executes* each published physics
formula against `scripts/physics_severity.py`.
*Owner-gated:* Action 10 (Search Console/Bing) and Action 11 (listings/backlinks from the named
portals). **No submission and no backlink is claimed anywhere**, and the audit treats the "pursue
listings" step as open.

### Phase 9 — Validation and soft launch ❌ (validation ✅ · launch ❌)

*Delivered this phase:* the hindcast harness (`scripts/hindcast/`, four modules), four curated
episodes with sourced truth sets, four committed driver series, four CI-verified reports, a producing
workflow (`hindcast.yml`) and an offline `check` gate wired into `ci.yml`; 23 tests; and the findings
in `docs/phase-reports/phase-9-validation-and-soft-launch.md`:

* **Detection:** 46 of 46 named districts across four episodes reached the alarm list at both
  horizons; the class was named for 12 (all in the 2024 flood); for 0 of 23 on the two cyclones.
* **Verification metrics:** the 2024 eastern flood is the project's first measured detection —
  POD 1.0, FAR 0.154, CSI 0.846 over 26 scored windows; the other three episodes give `misses: 0`,
  `POD: None`, `FAR: 1.0` under the class-strict rule, which the report explains rather than hides.
* **Threshold independence:** the 0.40 / 0.50 / 0.65 bands produce identical splits on all four
  episodes — so the calibration workstream cannot fix what the hindcast found.
* **Four findings with numbers:** the ERA5 sustained 10 m wind at district centroids on Amphan's
  landfall day is 44–69 km/h where the cyclone carried 130–155 km/h ashore; three physics terms are
  at their ceiling on every row (`fire_wind`, `fire_drying`, `heat_persistence`/`cold_persistence`);
  `Fire` outranks a cyclone, a flood and a monsoon onset on 75–127 of 128 windows; and the two
  wind-driven classes (TC vs SLS) and the two rain-driven classes (Flood vs Flash Flood) are not
  separable at district-point resolution.

*Blocked:* the calibration map (needs the archive; Action 12 → 13b), the tabletop (Action 13a, needs
people), the metrics page (§8.1 of the phase report, engineering), the beta gate (Action 13c).

## 4. What the repository can prove today

| Proof | Command | Result |
| --- | --- | --- |
| Whole Python suite | `python -m pytest scripts/tests -q` | **531 passed, 1 skipped** |
| Hindcast reports recompute from committed inputs | `cd scripts && python -m hindcast.cli check --require-reports` | ✅ 4 reports, every number matches |
| Backend + frontend JS suites | `npx jest` (root `jest.config.cjs`) | **passed in CI** on PR #29's run `35286726745` (Backend Tests, Frontend Tests, Code Quality & Build, Security Audit, TFLite bundle smoke) — the JS suites could not be re-run locally because `npm ci` cannot reach `storage.googleapis.com` from the sandbox |
| End-to-end browser suite | `npx playwright test` (CI job `E2E Tests`) | ❌ **failing** — see §5.1, which is the one red job on this branch |
| Content engine snapshot | `node scripts/build_content_engine.mjs --check` | 87 routes match their inputs |
| Hindcast end-to-end | `gh workflow run hindcast.yml -f episode=all` | run `35286394326`: fetch → score → check → test → commit |
| Phase reports | `docs/phase-reports/` | phase-2 … phase-9 present |

### 5.1 The one red job: E2E on this branch, and its evidence chain

This is the most important operational finding of the audit, and it was invisible until the PR was
opened: **`ci.yml` runs only on pushes to `main`/`develop` and on pull requests into them**, so the
531-test suite and the browser suite were never executed by GitHub for this branch's commits until
PR #29.

| Fact | Evidence |
| --- | --- |
| `main` at `3a44545` had E2E **green** | CI run `35119749079` (push to `main`, 2026-09-16): E2E Tests success |
| This branch's first CI run has E2E **red** | PR #29, run `35286726745` (head `939ef6b`): `Backend Tests`, `Frontend Tests`, `Code Quality & Build`, `Pipeline Scripts Tests`, `Security Audit`, `TFLite bundle smoke` all **success**; `E2E Tests` **failure** |
| The failure is in the test run, not the build | the job's steps `Install dependencies`, `Install Playwright browsers`, `Build frontend` and `Start preview server` all succeeded; step `Run E2E tests` failed |
| The cause is therefore in phases 0–9 | the only difference between the green run and this one is this branch's commits |
| It cannot be attributed from the sandbox | the job logs and the `playwright-report` artifact are served from `results-receiver.actions.githubusercontent.com` and Azure blob storage, both unreachable here; and Playwright's browser download plus `npm ci`'s binaries are blocked, so the suite cannot be reproduced locally |

**Consequence:** the branch is not mergeable as it stands — not because the work is wrong, but
because nobody has yet seen *which* E2E spec regressed. The fix path is one of two, and either is
fine: run `npx playwright test` on a machine with browsers (the suite's own README command), or
re-run the CI job and read the report artifact. The likeliest areas, given what the phases touched
and what the specs assert, are the surfaces Phase 5/7/8 edited — `Navbar.tsx`, `MenuDrawer.tsx`,
`Footer.tsx`, the `/documentation → /docs` redirect added in `c9a4f70`, and the strict
"no horizontal overflow" checks at 320/375/768/1280 px.

*What is **not** claimed here:* that the E2E suite is fine, that the failure is flaky, or that it is
unrelated to the phase work. It is a red job on a green baseline.

## 5. Claims that are **not** made (and must not be)

| Claim | Why it may not be made yet |
| --- | --- |
| "The model is X % accurate" | no fitted calibration, and the hindcast's FAR denominator is a reporting boundary. The site's own content engine fails a build that publishes such a number. |
| "Detects N of 4 events" | the four episodes are not independent samples (six districts shared between 2024 and 2025; the two cyclones overlap almost completely). |
| "Early warning at 7–15 days" | the drivers are reanalysis. Every report calls the result a *ceiling on detection*, not lead-time skill; archived forecast fields (ECMWF MARS/CDS) are what a lead-time claim needs. |
| "Validated with the CNN" | `cnn_evaluated: false` in all four reports; the tensor needs Earth Engine credentials for historical windows. |
| "2,931 events ingested" | the model card says *reported, not verified*; the loader reports drift. Nothing here restates it as achieved. |
| "Submitted to Search Console / listed on ReliefWeb / …" | Action 10–11 are owner actions and have not happened. No submission, no listing, no backlink is claimed. |
| "Security headers verified live" | Action 7 is open; the probe is red by fact. |
| Subscriber counts, delivery volumes | Action 5d is open; no such numbers exist in the repository. |

## 6. Recommendations, in the order they should be done

### P0 — this week (owner, ~2 hours total)

1. **Rotate the leaked credentials** (Action 1). Nothing else on this list matters while live
   provider credentials sit in a tracked file. Then verify with the `verify-secrets.yml` workflow.
2. **Fix the deployment root and confirm the live headers** (Action 7). One setting plus one probe
   run; it turns the red site-health probe green and closes the Phase 6 live-verification gap.
3. **Fix the one red CI job — E2E (§5.1).** PR #29 is open as a draft and CI has now run: five jobs
   are green, `E2E Tests` is red, and the baseline (`main` at `3a44545`) was green. Read the
   `playwright-report` artifact from run `35286726745` (or run `npx playwright test` locally) and fix
   the spec or the surface it caught. Until then the branch cannot pass branch protection (Action 3).

### P1 — next (owner + one engineering increment)

4. **Choose the archive's fate** (Action 12) — the single highest-leverage decision left: it unblocks
   the district history sections, the retrospectives, and the calibration map.
5. **Fit and stamp the calibration map** once the archive is in (Action 13b), then set the WARNING
   threshold in writing (Action 5a). Expect the first genuine `WARNING`-band alert to be *wrong in
   class* until P2-6 lands — see the hindcast §5.
6. **Publish the model-performance page** (§8.1 of the Phase 9 report): four episodes' detection
   table, POD/FAR/CSI with the `None`s explained, the threshold-band comparison, the driver
   comparison, and the "not claimed" list. This is the plan's public metrics dashboard, and it is a
   build task now, not a research task.

### P2 — the substantive fixes the hindcast found (pipeline owner)

7. **Fix the three saturated physics terms** — mean daily ET for the fire drying term, exceedance
   days for the two persistence terms. The counterfactual is already implemented and tested in
   `scripts/hindcast/score.py`; the measured effect is 9–21 windows per episode crossing a class
   boundary. *Acceptance:* the counterfactual and the shipped top-class distributions converge in a
   regenerated hindcast report.
8. **Fix the wind driver** — use (or additionally carry) `wind_gusts_10m_max`. *Acceptance:* the
   cyclic episode's cyclone-class score range moves from 0.014–0.248 toward 0.099–0.515, and the
   report's wind-driver block says the correct class is the track's pick.
9. **Address the `Fire` dominance** — with the wiring fixed, `Fire` still tops 54–127 of 128 windows
   in every episode. Either its wind/drying inputs need to be tropicalised (the formula is a
   temperate fire-weather rule) or the class needs a masking rule for the monsoon. *Acceptance:* a
   calm May day in the coastal belt no longer scores 0.55+ for `Fire`.
10. **Separate the two inseparable class pairs** (TC vs SLS; Flood vs Flash Flood) — or state in
    `MODEL_CARD.md` that the physics track cannot distinguish them, and have the alert surface carry
    the pair rather than the class. *Acceptance:* the 2025 episode's 0 hits / 20 false alarms under
    class-strict scoring becomes a documented pair-level detection (10/10).

### P3 — closing the launch gate

11. **Run the tabletop** (Action 13a) and record it in `docs/ops/owner-actions.md`.
12. **Open the beta with a stated scope** (Action 13c): in scope = district-level 7/15-day outlooks,
    `WATCH` advisories, the published hindcast with caveats; out of scope = evacuation decisions,
    anything above `WATCH`, any accuracy claim; plus one named owner of the published numbers.
13. **Add a 2023 monsoon episode** (and any second cycle): one JSON file, one source list, and the
    workflow does the rest. It is what would turn four overlapping samples into a defensible series.

## 7. What this audit deliberately did not do

* It did not mark any owner action as done, and it did not perform one — no Search Console submission,
  no portal listing, no credential rotation, no merge.
* It did not restate 2,931, an accuracy figure, a lead-time figure or a subscriber count as achieved.
* It did not treat a green workflow as evidence of a working system outside what that workflow asserts:
  the hindcast workflow proves the *physics track* detects what it detects, and says nothing about
  the CNN.
* It did not report the phase-9 work as a phase closure: Phase 9's launch half is open, and the beta
  gate in §10 of the phase report is the checklist for closing it.

---

## Provenance and attribution

**Phase commits:** P0 `3651bc5` · P1 `0337e4c` · P2 `24e79f1` · P2/P3 spine `ab1de5c` · P3 `951085b` ·
P4 `e15eb8f` (+`47d7c1a`) · P5 `18295b5`, `9dfee27` · P6 `2315b19`, `4227bc0` · P7 `ebd67e9` ·
P8 `c9a4f70` · P9 `f5a86db`, `fc9dcdb`, `242cd92`, `181d07a`, `f3963d4`, `db047ac`, `7276314` plus the
generated-data commits `49ed7e2`, `7c9a0b9`, `9d48b74`, `f648ab5`, `7db70fb`.

**Reports:** `docs/phase-reports/phase-2…9*.md` (Phase 0's ground truth lives in
`docs/PRODUCT_SPEC.md`/`docs/MODEL_CARD.md` and `docs/audits/2026-09-17-live-surface-audit.md`; Phase 1's
in `docs/architecture/TARGET_ARCHITECTURE.md` and `docs/adr/`).

**Master's Thesis of Ashif Ahmed Shuvo** — https://github.com/myself-aas ·
https://orcid.org/0009-0003-5734-1519 · https://www.linkedin.com/in/me-aas ·
https://x.com/myself_aas · Supervisor **Dr. Ahmed Khairul Hasan** — https://bau.edu.bd/profile/AGRON1013 ·
co-supervisor — https://csm.bau.edu.bd/teachers/CSM1007 · Department of Agrometeorology, BAU.
MIT © 2026 Ashif Ahmed Shuvo.
