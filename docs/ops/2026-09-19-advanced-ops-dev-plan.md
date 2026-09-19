# HazardNet — Advanced Technical & Operations Development Plan

**Date:** 2026-09-19 (Asia/Dhaka) · **Branch:** `arena/01a0b62e-hazardnet` @ `5b4687d` + working tree
**Derived from:** (a) `docs/reviews/2026-09-19-web-design-review.md` (design review, integrated),
(b) `docs/reviews/2026-09-19-webapp-test-report.md` (whole-app test pass), (c) this session's work log,
(d) the owner's standing constraints.
**Relationship to existing plans:** this plan is the *verification-driven hardening and completion*
programme. It does not replace `docs/ops/production-readiness-roadmap.md` (WP0–WP4, product
capability) — it supplies the quality gates, the trust controls and the outstanding Stage-A surface
that the product roadmap assumes exist. Where they overlap, the roadmap owns product scope and this
document owns the gate that proves it.

---

## 1 · Governing constraints (non-negotiable)

| # | Constraint | Consequence for every workstream |
|---|---|---|
| C1 | **The severity index is under a publication embargo.** No derived index, formula, weights, calibrated thresholds, cluster membership or model predictions may appear on any visitor-readable surface before the research article is published. | Every new page ships with the embargo gate passing. Only the archive's own committed `Severity_Index` column may be published, labelled as an archive field. |
| C2 | **Real data only.** No placeholder, sample or lorem content on any shipped page. | A page either renders from a committed artifact or states the absence explicitly. "No data" is a valid state; a made-up number is not. |
| C3 | **100 % trust — every published number is auditable.** | Each figure on screen must be traceable to an artifact and a command. Reports, not vibes. |
| C4 | **Stages are independently shippable** (C → B → A as previously agreed). | No workstream may leave `main` in a state where a gate is red for a reason it introduced. |
| C5 | **Skill-driven QA is the standard operating procedure**: `web-design-reviewer` for anything visual, `webapp-testing` for anything behavioural. | See §6 for the operational rules extracted from both skills and enforced in this plan. |

**C1 is absolute.** The archive artifact already carries the machine-readable form —
`frontend/public/data/hazard-archive.json → embargo`:

```
embargo.active            : true
embargo.withheld          : [derived_severity_index, severity_weights, cluster_membership, model_predictions]
embargo.disclosed_field   : severity_by_hazard — computed from the archive's own reported Severity_Index column
```

and `scripts/check-severity-embargo.mjs` (wired as `npm run check:embargo` in `ci.yml:437`) is
build-failing. **The one open embargo question is an owner classification**, not a code change — see
§8 `[ASK USER] 4`.

---

## 2 · Verified state of the system

Everything in this table was measured in this session; the command that proves it is named.

| Layer | State | Evidence |
|---|---|---|
| Historical archive artifact | 2,931 rows = 251 episodes / 64 districts / 8 hazards / 2000–2025; `missing_years: [2001]`; GLIDE disagreements 846 rows; ETL drift 0 (ingested 2,931 = claimed 2,931) | `frontend/public/data/hazard-archive.json`, `scripts/build_hazard_archive.mjs --check` |
| ETL adapter | `bgd-climatic-hazards` frozen for reproducibility | `scripts/etl/adapters/bgd_climatic_hazards.py`, `scripts/etl/events.py` |
| RAG | 90 documents (10 curated + 80 archive under `08_hazard_archive`), freshness-gated | `rag_pipeline/agent_knowledge_base.json`, `npm run check:rag-freshness` |
| Content engine | 75 routes → 98 prerendered HTML → 89 sitemap URLs; canonical host `www.hazardnet.live` hard-fails the build if changed | `frontend/public/data/content-index.json`, `frontend/scripts/prerender.mjs` |
| CI | 13 workflows. `ci.yml` gates: backend/frontend/pipeline tests, E2E (5.5 min build+run), `verify` (env, **tsc**, eslint, RAG freshness, **embargo**, archive check, archive RAG check, build, **bundle**), security audit | `.github/workflows/ci.yml:303,388–504` |
| MLOps | Nightly 02:00 UTC: artifact audit → registry refresh → registry drift → forecast evaluation → drift vs reference. Quarterly retrain brief. **All three sentinels are `continue-on-error: true` — they report, they never gate.** Drift reference is the committed legacy run, which the workflow itself flags as a placeholder until runs are archived per day | `.github/workflows/mlops.yml:56–100`, `scripts/mlops/{cli,drift,evaluate,registry,calibration}.py` |
| Frontend correctness | **OP-1 landed**: suite **61 passed / 7 failed** (from 57/11), the 7 being 2 owner-decision root causes; 0 sideways scroll; 45/45 routes render; `button-name` 340→0, `nested-interactive` 970→0, nav focus misses 6→0, `h1Count≠1` 5→0 | `/tmp/hn-e2e-5.json`, `/tmp/hn-layout-mobile-final.json`, design report §10 |
| Unexercised | Auth surfaces (`/dashboard/blog*`), production-build smoke, bundle size, cross-browser | §7 coverage gaps |

---

## 3 · Workstreams

Each workstream states **objective → deliverables → acceptance (with the command that proves it) →
dependencies**. OP-1 and OP-2 are blocking; OP-3 restores the missing Stage-A surface; OP-4–OP-6 make
the system operable and keep the embargo honest.

### OP-1 — Trust-critical UI defects — **DONE** (verified 2026-09-19; see design report §10)

**Objective:** clear every defect that a first-time visitor can hit in the first minute.

| # | Defect | Fix | Acceptance |
|---|---|---|---|
| 1 | 6 navbar controls have no focus indicator (`Navbar.tsx:234,297,387,505,589,678`) | Replace `focus-visible:outline-none` with `focus-visible:ring-2 focus-visible:ring-nasa-blue/60` (pattern already at `:184`) | ✅ **DONE** — 12/12 stops show an indicator |
| 2 | 4 dashboard routes have no `<h1>` at all; first heading is `h4` | Give `/live`, `/home`, `/home/overview`, `/forecast/overview` a real `<h1>`; demote the second `/analytics` `<h1>` to `<h2>` | ✅ **DONE** — `h1Count: 1` on all 5; zero `h1Count≠1` loads in 4 viewports |
| 3 | `/download` queries `registry.npmjs.org/hazardnet` and `pypi.org/pypi/hazardnet/json` → both 404 | Publish the packages **or** remove the lookups and state what is distributed — owner decision, §8 `[ASK USER] 1` | ✅ **DONE 2026-09-19 (ADR 0011)** — owner chose *do not publish, stop querying*. The registry lookups, their types, the ownership guard and `VITE_PYPI_PACKAGE_NAME`/`VITE_NPM_PACKAGE_NAME` are removed; the page issues **no** network request by default and each channel states what is distributed (GitHub Release assets) instead of an install command. Live GitHub Releases lookups are opt-in via `VITE_DOWNLOAD_LIVE_RELEASES=true`. `package.json` is now `"private": true` |
| 4 | 7 registered routes never apply their metadata in the SPA (`/docs /about /contact /privacy /terms /use-cases /download`) | Call `usePageSeo(path)` in those 7 components (same one-line pattern as `/archive`) | ✅ **DONE** — all 7 serve registry title/canonical/`index,follow`, including after client-side navigation |
| 5 | `/alerts` filter row 465 px wide in a 375 px viewport; 131 px unreachable | `w-full sm:w-auto` at `BangladeshSvgMap.tsx:100` + `min-w-0` on the inner scroller | ✅ **DONE** — row 463→293 px, `cardClipped: false`, all chips reachable, 0 document scroll |
| 6 | FAB: 15×15, unlabelled, nested inside a clickable `div` → 340 critical + 970 serious axe nodes | `aria-label`, 44×44 hit area, flatten to one interactive element | ✅ **DONE** — `button-name` 340→0, `nested-interactive` →0, items 44×44, collapsed items out of the tab order, modal still opens |
| 6b | *(found while verifying 6)* Leaflet puts `role="button" tabindex="0"` on every marker wrapper, and the icon HTML declared the same on an inner `div` → 53 nested-interactive nodes per map route | Remove the inner declaration; keep the name on Leaflet's wrapper via the existing `attachMarkerA11y`; share one label builder (`hazardMarkerLabel`) | ✅ **DONE** — axe `nested-interactive`/`button-name`/`svg-img-alt` all PASS on `/live`; mouse click **and** Tab+Enter still open the district card |

**Exit criterion for OP-1 (met, with one owner-gated exception):** `npx playwright test -c playwright.qa.config.ts` is **61 passed / 7 failed**, and all 7 failures are the
two owner decisions named above (`422 /api/predict` ×6, `/download` ×1). The layout audit reports 0
sideways scroll and `h1Count: 1` on every load; `npx tsc -p frontend/tsconfig.json --noEmit` and
`npx eslint frontend/src --quiet` both exit 0.

**Measurement defects found and fixed during OP-1** (they are part of the deliverable, not noise):

- `layout-audit.mjs` capped its offender lists at 6 / 15 per page, so every published total was an
  order-dependent sample that could not show progress. Caps raised to 200; mobile totals are now
  complete (**703** undersized controls, **34** clipped, 0 sideways scroll).
- The same probe tested only the element's *own* computed style, so children of an `opacity: 0` +
  `scale(0.4)` parent were counted as 15–18 px targets. `isVisible` now walks ancestors in
  `layout-audit.mjs` and `overflow-triage.mjs`. The FAB's reported footprint fell from 38 of 45 routes
  to 10 first-paint entries on 5 map routes.

### OP-2 — Quality gates that actually gate (blocking for all further work, ~1–2 days)

**Objective:** make the next regression impossible to merge silently. This extends the existing
`verify` job rather than inventing a pipeline.

| Gate | Why it is needed (measured) | Implementation |
|---|---|---|
| **Run the CI `verify` suite locally, every pass** | 3 type errors survived a full design review on an unpushed branch; `verify` would have caught them (`ci.yml:421`) | Make `verify` a **required** status check in branch protection; add a `npm run verify:local` convenience script that runs the same commands |
| **axe gate** | 12 rule types, 2,388 contrast nodes, 340 critical button-name nodes; nothing in CI runs axe today (`grep -rl axe .github/workflows/` → none) | Add `scripts/qa/a11y-gate.mjs`: run the existing `a11y-detail.mjs` sample at 1280 px, fail on **any** critical and on serious **above the committed baseline** (`docs/ops/a11y-baseline.json`) |
| **`console.error` + failed-response E2E** | `critical-paths.spec.ts` listens to `pageerror` only; the SVG defect fired 2× per render on 38/45 routes and passed | Promote `e2e/full-app-qa.spec.ts` into the `test-e2e` job (it already filters environment failures by URL) |
| **0-sideways-scroll invariant** | Currently 0/180 — a property worth locking | Run `scripts/qa/layout-audit.mjs` at 375/768 px in the E2E job; fail if any document scrolls sideways |
| **Production-mode smoke** | Dev-mode measurement misstated production in both directions this session (the `/docs` `noindex` shell vs. the prerendered HTML) | `npm run build` + serve `frontend/dist` (already done in `test-e2e`), then assert: 19 registered routes serve their registry title/canonical; `/sitemap.xml` matches `content-index.json` |
| **Upload artifacts on failure** | Every defect in the test report was diagnosed from JSON transcripts and screenshots | `actions/upload-artifact` for `/tmp/hn-*.json`, `playwright-report/`, `test-results-qa/` when a gate fails |

**Exit criterion:** a deliberately planted regression (e.g. a re-`y1`-less SVG attribute, a removed
`aria-label`, a new `<h1>` violation) fails CI within one run.

### OP-3 — Complete Stage A (the outstanding public surface, ~1–2 weeks)

Stage A was scoped as: episode pages, division pages, clusters, and the SEO layer that makes them
findable. `/archive` + `/history` + `/events` shipped; the rest did not.

**OP-3.1 — `/events/:glide` episode pages.**
*Data:* the archive artifact already groups 251 episodes and flags 192 rows without a GLIDE id; the
content engine already emits `kind: 'event-archive'` blocks (`build_content_engine.mjs:558,1160,1224`).
*Deliverable:* one page per episode — member district observations, hazards, date span, the rows that
could **not** be grouped, and an explicit "this page is a reconstruction from third-party records"
statement. *Acceptance:* prerendered HTML per episode URL; `content-index.json` counts updated;
episode page count matches `episodes` in the artifact; the 192 ungrouped rows are surfaced, not
hidden. *Trust:* every figure links back to the artifact key that produced it.

**OP-3.2 — Division-level pages (7 divisions).**
*Data:* the artifact carries 7 divisions; the report must also state that Mymensingh has no
pre-2015 rows because the archive uses a vintage district→division mapping (`quality.division_vintage`).
*Deliverable:* `/divisions/:id` with per-hazard counts, the vintage caveat inline, and links to the
districts inside. *Acceptance:* 7 routes, 7 prerendered files, 7 sitemap entries, one canonical each;
division totals reconcile with the artifact (they may not sum to the national total — that difference
is documented, not smoothed over).

**OP-3.3 — `/clusters`.**
*Data:* clustering is **embargoed** (C1, `cluster_membership` is in the withheld list). *Deliverable:*
a page that explains what clustering would add, states plainly that the analysis is part of
unpublished research, and publishes **nothing** derived. It must ship without any membership data.
*Acceptance:* `check:embargo` passes with the page live; a test asserts the page contains no cluster
assignment, no weights, no thresholds.

**OP-3.4 — SEO completion.**
Canonicals + JSON-LD per route, sitemap entries for every indexable route, and internal backlinks
(each new page links to its parent index and to at least two siblings).
*Acceptance:* registry-driven smoke test (§OP-2) covers the new routes; `content-index.json` counts
(`routes`, `prerendered_html_files`, `sitemap_urls`) increase in lockstep; no orphan pages
(link-crawl test finds ≥2 inbound internal links per new route).

**OP-3.5 — Generated-page heading template.**
26 routes skip heading levels because the generator emits `h4` under an `h2`
(`build_content_engine.mjs` templates; `/districts/:id` renders `[1,2,2,2,4,4]`). One template change
fixes all generated pages. *Acceptance:* heading-order axe violations drop from 107 to ≤ the archive's
`[1,3,3,3]` class; a per-page assertion records the heading outline.

### OP-4 — MLOps drift & data-quality gates (~1 week)

**Objective:** convert the nightly *report* into a *control*, and give drift a meaningful reference.

| Task | Detail |
|---|---|
| Promote the three sentinels | `mlops.yml:67,76,84` currently use `continue-on-error: true`. Define thresholds (registry drift: any byte change fails; evaluation: POD/FAR outside the committed band fails; drift: PSI/KS above the committed band fails) and remove `continue-on-error` for the *gate* — keeping the report-only step alongside it for context |
| Archive the daily run | The workflow documents its own limitation: drift is measured against a committed legacy CSV "until runs are archived per day". Publish each day's forecast artifact to date-stamped storage, and switch `--reference` to yesterday's artifact. Drift becomes a real signal |
| Archive ETL quality gate | `scripts/build_hazard_archive.mjs` already computes `quality.*` (drift, GLIDE disagreements, missing years, excluded constant columns). Add `--check`-style thresholds: fail if rows/`ingested ≠ claimed_total`, if a new year goes missing without an allowlist entry, or if the GLIDE disagreement rate moves more than N points |
| Owner routing | Nightly failures must reach a human: open/update a tracking issue on failure (the quarterly job already opens retrain requests — reuse that mechanism) |
| Retain the quarterly brief | Already implemented; leave as-is (`mlops.yml:133`) |

### OP-5 — Resilience & degraded-mode UX (~3–4 days)

**Objective:** stop failing silently. Today every upstream can be down and the console is the only
place that says so.

| Task | Detail | Acceptance |
|---|---|---|
| Degraded-mode banner | The map already has an offline tile path (3,611 `504 (Tile Unavailable Offline)` in one sweep) but shows a blank grid. State it: "basemap unavailable — district data still live" | Screenshot test with tiles blocked shows the banner; text present in the accessibility tree |
| Weather/alerts degradation | `openMeteo.js:199` throws `fetch failed` → `routes/weather.js:26` returns 500. Return a typed degraded payload and render "temporarily unavailable" instead of a spinner-forever | Simulate with the host blocked; page shows a stated limitation, logs no 500 |
| Status page honesty | `/status` exists; make it report upstream reachability per feed rather than a single aggregate | Status page lists each upstream with last-success timestamp |
| Error budget | Define what "degraded" means for the 0-sideways-scroll and 0-error-boundary invariants and alarm on breach | `site-health.yml` (every 30 min) alerts on the first breach, not the tenth |

### OP-6 — Embargo & publication governance (~2 days, owner-triggered)

**Objective:** make the embargo enforceable *and* make release-day a checklist, not a memory test.

| Task | Detail |
|---|---|
| Classification of the two pre-existing composite-index entries | ✅ **DONE 2026-09-19 (ADR 0012)** — classified `presentation-aggregation` (`districtCount × mean(per-district severity)`, both factors already published on the same screen; no weights, thresholds or clusters) and **kept, labelled**. The decision is recorded as data in `REVIEW_CLASSIFICATIONS`, and the gate now *fails the build* if either phrase loses its disclosure label (`LABEL_WINDOW_CHARS = 1400`; verified by deleting one — exit 1). The checker reports `classified: 2`. One item is deliberately left open and escalated to the owner: `NationalOverview.tsx:434` prints a weighted `Vulnerability Formula` (× 0.6 / × 0.4), which a new `review`-tier rule reports on every run — see ADR 0012, "Not decided here" |
| Release-day procedure | One document: flip the archive placeholder to published, enable the methodology page, regenerate RAG documents, re-run `check:embargo` expecting the allowlist to shrink to zero, and archive the pre-release state |
| Keep the gate honest | The checker must keep failing on *new* derivation language, weights, thresholds and cluster assignments; the review-item path is for pre-existing copy only and must never grow |
| Provenance page | The archive already exposes `provenance` (source, loader command, export schema, ingested vs claimed). Surface it on `/archive` so C3 is visible to a reader, not just to a maintainer |

---

## 4 · Sequenced roadmap

| Milestone | Contents | Exit criteria | Est. |
|---|---|---|---|
| **M1 — Stop the bleeding** | ~~OP-1 (6 fixes)~~ **done** + OP-2 gates (a11y + console E2E + layout matrix) | OP-1 met; remaining: OP-2 gates wired, and a planted regression must fail CI | OP-2 only: 1–2 days |
| **M2 — Restore Stage A** | OP-3.1 episodes, OP-3.2 divisions, OP-3.4 SEO, OP-3.5 heading template | 251 episode pages + 7 division pages prerendered and in the sitemap; heading-order violations ≤ 20 | 1–2 weeks |
| **M3 — Make ops real** | OP-4 gates + OP-5 degraded mode | Nightly job fails on a seeded drift; degraded banner visible with upstreams blocked | 1 week |
| **M4 — Publication-ready** | OP-3.3 `/clusters`, OP-6 governance | `check:embargo` allowlist empty; release-day checklist executed once as a dry run | 3–4 days |

Ordering rationale: M1 is unblocked and cheap; M2 depends on M1's gates to be safe; M3 depends on the
drift reference being archived (which the nightlies do); M4 is owner-triggered and must not gate M2–M3.

---

## 5 · Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Embargo breach via a new page (clusters, episode pages, RAG docs) | Medium | **Severe** (journal ethics) | Build-failing `check:embargo` in CI; `/clusters` ships as an explained placeholder; RAG regeneration gated by `archive:rag:check` |
| Silent degradation ships as "working" | High | Medium | OP-5; the test report's environment table becomes the regression fixture |
| Gate rot (tests that pass for the wrong reason) | Medium | High — this session found 3 harness defects and 1 wrong claim | Every gate must be validated by a **planted** regression (M1 exit criterion); review-item paths must never grow |
| Dev/prod divergence (measured differently) | Medium | Medium | Production-mode smoke in `verify` (OP-2) |
| Unpushed branches → gates never run | **Observed this session** | High | Push the branch; make `verify` a required check. OP-1 is now complete, which was the condition for pushing |
| Measurement that over-counts or under-counts | **Observed twice this session** (capped lists; own-style-only visibility) | High | Fix the probe before publishing the number; state exclusions in code, and validate any new gate with a planted regression (M1 exit criterion) |
| Map/Geo realism regressions (Leaflet markers counted as defects) | Low now | Medium | `layout-audit.mjs` documents its exclusions; keep them in code, not in prose |
| Owner bottleneck on the 2 classification questions | Medium | Medium | Default to withholding (safe direction) until answered; no page depends on the answer |

---

## 6 · How QA is operated (extracted from both skills, and enforced)

**For any visual change — `web-design-reviewer` loop:** information gathering → visual inspection at
375 / 768 / 1280 / 1920 → issue fixing → re-verification, looping; consult the owner after 3 failed
fix attempts. Reports use the fixed format (summary table → per-issue blocks with page/element/issue/
file/fix/screenshot → unfixed with reasons → recommendations).

**For any behavioural change — `webapp-testing` rules, as practised here:**

1. **Verify the application is running before the first navigation** (both servers; `curl` the SPA
   and the API), and fail loudly if not.
2. **Explicit waits, never sleeps in the assertion path**: `waitForSelector(sel, {state:'visible'})`
   after `goto(..., {waitUntil:'domcontentloaded'})`; a bounded settle (≈700–1200 ms) for animation,
   and a longer bounded settle only where data loads.
3. **Capture console + failed responses with URLs**, and filter environment noise **by URL**, never
   by message text (test report §4.2).
4. **Screenshot on failure**, and always `browser.close()`.
5. **Prefer role/`data-testid` selectors**; assert on what a user or AT can reach — this is what
   turned `locator('h1').first()` into a false failure (test report §4.1).
6. **Reasonable, explicit timeouts** (20 s navigation, 15 s visibility) and `retries: 0` for local
   diagnosis so flakes stay visible.
7. **Test incrementally**; a harness defect is fixed before the next run, and every harness fix is
   recorded rather than silently applied.
8. **Freeze source edits while a sweep is running.** A live edit during a sweep produced a phantom
   `usePageSeo is not defined` boundary that cost a re-verification cycle; the artifact stayed clean
   only because the phantom was disproved at 768 px.

---

## 7 · Coverage gaps this plan does not close

| Gap | Owner action required |
|---|---|
| Authenticated surfaces (`/dashboard/blog*`, reviewer console) | A seeded test account or local auth stub — §8 `[ASK USER] 6` |
| Cross-browser (Firefox/WebKit) | Out of scope for the Playwright Chromium build available here |
| Native mobile browsers | Not automatable with this stack (skill limitation) |
| Bundle/perf budget numbers | Run `npm run build` (≥1 GB free space, ~3–5 min) and record real bytes; `check:bundle` already gates the threshold |
| Visual regression baselines | Playwright `toHaveScreenshot()` once the UI stabilises after M1 |

---

## 8 · Open decisions and divergences

### `[ASK USER]` — numbered questions

1. ~~**`/download` packages:** should `hazardnet` be published to npm/PyPI, or should the page stop
   querying the registries and simply state what is distributed? (Both registries return 404 today;
   `react`/`requests` return 200 from the same sandbox, so the lookups are working and the packages
   are absent.)~~ — **✅ ANSWERED 2026-09-19: do not publish; stop querying.** Recorded as
   **ADR 0011** (`docs/adr/0011-distribution-without-package-registries.md`). Distribution is the
   deployed site, GitHub Release assets and the repository. `/download` makes no network request by
   default (GitHub Releases lookups are opt-in via `VITE_DOWNLOAD_LIVE_RELEASES`), each channel
   states what is distributed instead of rendering an install command, and the root `package.json`
   is `"private": true` so `npm publish` fails outright. The two registry workflow templates stay in
   `.github/workflow-templates/` as inert reference material, annotated `NOT ADOPTED`.
2. **FAB behaviour on mobile:** keep the floating action buttons (fixed, once they have labels and a
   44 px hit area) or move them into a toolbar? The 15×15 unlabelled control is the single largest
   source of axe failures (1,310 nodes).
3. **Contrast direction:** approve promoting body-copy greys `slate-400 → slate-500` and the amber
   chip surface to a darker pairing? This is a visible design change across ~20 routes — I will not
   ship it without your sign-off.
4. ~~**Embargo classification (C1):** are the composite-index blocks at `NationalOverview.tsx:540,718`
   pre-publication artifacts (safe to keep, labelled) or derived from the unpublished index (must be
   withdrawn)? The checker currently prints them as review items instead of failing.~~ —
   **✅ ANSWERED 2026-09-19: pre-publication aggregation — safe to keep, labelled.** Recorded as
   **ADR 0012** (`docs/adr/0012-composite-index-classification.md`). Both blocks (now
   `NationalOverview.tsx:553` and `:745`) compute `districtCount × mean(per-district severity)` from
   values the same screen already publishes, so they are not the embargoed derived index. The
   decision lives in the checker's `REVIEW_CLASSIFICATIONS` with its date and basis, each block
   carries a disclosure label next to the number, and the gate escalates to a **build failure** if a
   label is deleted or drifts out of the 1400-character window.
   **Still open (escalated, not decided):** `NationalOverview.tsx:434` prints
   `Vulnerability Formula = (Division Avg District Severity × 0.6) + (High Risk Ratio × 0.4)` — explicit
   coefficients on a visitor surface. If those are the embargoed index's weights the coefficients must
   come off the page; if they rank already-published values, keep and label them. A new `review`-tier
   rule (`weighted-formula`) reports it on every run until that is answered.
5. **Paper timeline:** when should OP-6 be scheduled, and do you want the release-day copy (archive
   placeholder → published state) drafted now so publication is a single flip?
6. **Admin/blog testing:** can you provide a test account (or approve a local auth stub) so the one
   large untested surface can be covered before M3?

### Intent vs reality — divergences found while producing this plan

| Stated intent | What the repository actually shows | Resolution |
|---|---|---|
| "MLOps drift/quality gates are not a workflow yet" | The nightly workflow exists and is substantial (`mlops.yml`) — with artifact audit, registry drift, evaluation and drift — but all three sentinels are `continue-on-error: true`, and the drift reference is a committed legacy CSV the workflow itself flags as temporary | OP-4 is redefined: **promote and reference-fix**, not build-from-scratch |
| (My earlier claim) "no tsc/lint/bundle gate exists in CI" | **Wrong, and corrected in both reports.** `ci.yml:388` `verify` runs `tsc`, eslint, `check:embargo`, `archive:check`, `archive:rag:check`, `build` + `check:bundle` | The process fix is *run CI's commands locally and keep the branch pushed*, not add a gate |
| (My earlier claim) "0 of 180 elements miss a focus ring" | True of the metric (first tab stop), false of the interface: **6 navbar controls have no indicator** | Corrected in the design report §9.1; OP-1 item 1 |
| Stage A "landed partly" | Confirmed: `/archive` + aliases + SEO for them only; episodes, divisions, clusters and the broader SEO layer are absent | OP-3 |
| "100 % trust" | Two pre-existing composite-index blocks publish a formula (**resolved 2026-09-19, ADR 0012** — classified, labelled, label enforced by the gate); the `/download` page advertises non-existent packages (**resolved 2026-09-19, ADR 0011** — no registries, no lookups); `/archive` charts have no accessible names | OP-1 items 3 & 6, OP-6 |

### `[TODO]` — unknowns to resolve before M2

- `[TODO]` Exact per-episode prerender cost: 251 new routes × 4 viewports will need the sweep
  re-budgeted (the current 180-load sweep takes ≈25 min at 1 route/settle).
- `[TODO]` Daily-run archive location and retention (GitHub artifacts expire; a durable store is an
  owner decision).
- `[TODO]` Whether `/clusters` should exist at all before publication, or be a documented tombstone
  in the sitemap — no longer blocked on `[ASK USER] 4` (answered: ADR 0012 classifies the composite
  blocks as presentation aggregations and says nothing about cluster surfaces, which the gate's
  `cluster-membership` rule still blocks outright). This is now its own question: cluster *ids,
  centroids and membership* remain embargoed, so `/clusters` cannot publish them either way.
- `[TODO]` Bundle budget for the new pages once built (`check:bundle` thresholds are already committed
  but were never exercised in this sandbox).

---

## 9 · Definition of done

A workstream is done when **all four** hold:

1. The change is on the branch, pushed, and CI's `verify` + E2E jobs are green.
2. The acceptance command in §3 passes, and its artefact is stored (JSON/screenshot) — not just
   "it looked right".
3. If the change is visual, the `web-design-reviewer` loop was run and re-verified at all four
   viewports; if behavioural, the `webapp-testing` rules of §6 were followed and console output is
   clean apart from the documented environment set.
4. Any new user-visible number is traceable to an artifact key, and any new page has passed
   `npm run check:embargo`.
