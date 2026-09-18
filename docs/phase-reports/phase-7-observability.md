# Phase 7 — Observability: the freshness artifact and the public status page

**Date:** 2026-09-18 · **Branch:** `arena/01a0afa0-hazardnet` · **Scope:** the phase the target
architecture reserved for one question — *"is the site honest right now?"*
(`docs/architecture/TARGET_ARCHITECTURE.md` §6, the status-page row in §4, and
`docs/MONITORING_SETUP_GUIDE.md`).

**Headline:** the architecture promised a committed freshness artifact plus a static status
page. Neither existed. Both exist now, they are generated from the committed data rather than
from a probe that does not run, the probe publishes a machine-readable result the page renders,
and the three ways a status page becomes worse than no status page — inventing freshness,
inventing a model version, and claiming liveness — are each blocked by a test.

---

## 1. What the phase had to produce

| Promise (where it was written) | What it required | Before |
| --- | --- | --- |
| `data/freshness.json`, "written by the pipeline" (`TARGET_ARCHITECTURE.md` §2, §3.2, §6) | a derived artifact naming each source, its age and its SLO | **did not exist** — no file, no producer |
| Status page from `data/freshness.json` + the probe workflow (§4, ◆ Phase 7) | a public page rendering that artifact | did not exist |
| "Is the site honest right now?" → the probe workflow (§6) | probe findings published where the site can read them | the probe printed to a log and exited |
| §1.4 cadence, §5.1 coverage stamp surfaced (PRODUCT_SPEC §8 traceability) | a user-visible statement of freshness and coverage | the numbers were in JSON files nobody reads |

The constraint the phase was held to: **no new always-on infrastructure**. The architecture
spends only on the alert audit store and the evaluation harness; observability is supposed to be
a committed file plus a scheduled workflow, and adding a hosted status service would have been a
service nobody is on call for.

## 2. What was built

### 2.1 The artifact — `scripts/build_freshness_artifact.mjs`

Reads four committed files, writes `frontend/public/data/freshness.json`
(`hazardnet-freshness/v1`):

| Source | Input | SLO |
| --- | --- | --- |
| `forecast_ingest` | `backend/data/forecasts/manifest.json` | 192 h (`monitoring/alerts.yml`) |
| `forecast_snapshot` | `frontend/public/data/forecasts-latest.json` | 192 h |
| `alert_engine` | `frontend/public/data/alerts-latest.json` | 48 h (`lib/alerts.ts` `freshnessOf`) |
| `site_probe` | `data/site-health/latest.json` | 2 h (four missed 30-minute runs) |

Each source carries `state`, `reason`, `generated_at`, `prediction_date` where applicable,
`age_hours`, `slo_hours` and a `detail` object copied from the input. The artifact also carries
the **coverage stamp** and the **model provenance** copied verbatim from the snapshot, an
`overall` block (worst source state, counts, the list of sources that are not fresh), an
`honesty[]` list of notes derived from the inputs, and an `inputs` block naming every file it
read with that file's own timestamp.

Design rules, all test-enforced:

* **Never invent.** A missing file is `missing` with the path in the reason; an unparseable
  timestamp is `unknown` with a null age (never `0 h`); `model_version` is copied, so while the
  pipeline stamps none the artifact says `null` and *says why*.
* **Say why.** Every non-`fresh` source carries a reason a reader can act on
  (`prediction_date 2026-09-06 is 292.5 h old (SLO 192 h)`).
* **Be deterministic.** Same inputs + same clock ⇒ byte-identical output. `--check` compares a
  **time-independent projection** (schema, coverage, provenance, source identities and
  timestamps) so the gate cannot rot into a flaky failure — a gate that fails because a day
  passed gets switched off within a week.

### 2.2 The page — `/status`

* **Copy**: the `/status` entry in `frontend/src/content/site-routes.json` — four sections and
  four FAQs, shared with the prerenderer by design (`prerender.mjs` and React read the same
  file, so the crawlable copy and the interactive copy cannot drift).
* **Static render**: `renderStatusPanel()` in `frontend/scripts/prerender.mjs` writes the real
  figures into `dist/status/index.html` at build time — no-JavaScript visitors, crawlers and the
  first paint get the numbers, not a shell.
* **Runtime**: `frontend/src/components/status/FreshnessPanel.tsx` fetches the same file and
  renders the same numbers, with a retry control.
* **Client contract**: `frontend/src/lib/freshness.ts` refuses any payload whose schema is not
  `hazardnet-freshness/v1`, downgrades unknown state strings to `unknown`, renders an unknown age
  as `—`, and never throws — a status page that goes blank when it cannot load its own status is
  the worst possible failure mode for it.
* **Route wiring**: lazy route in `App.tsx`, links in the drawer and the footer, `robots:
  index,follow`, in the sitemap (17 URLs).

The page states, in the artifact's own words, that it is **a statement about committed files and
not a live probe**, and its "What this page is not saying" block renders the artifact's honesty
notes verbatim — including *no uptime history is kept*, *no districts named that the run did not
name*, *Not stamped* for the model version, and the withheld-publication count.

### 2.3 The probe publishes what it finds

`.github/workflows/site-health.yml` now:

* declares `permissions: contents: write` **for one step only**, with the reason in a comment;
* records a machine-readable result (`data/site-health/latest.json`, `hazardnet-site-probe/v1`)
  built with `jq` from each probe step's own `outcome` — six checks: `homepage`, `deep_links`,
  `security_headers`, `sitemap`, `forecast_data`, `status_page`. A step that did not run
  (`skipped`) counts as **fail**: "we did not check" is not "it passed";
* adds two checks: `/status` is served with its content, and `/data/freshness.json` is served,
  parses, carries the contract, and **quotes the same `prediction_date` the deployment actually
  serves** — the drift check that stops the page describing different data than the site ships;
* rebuilds the derived artifact so the published page quotes this run;
* commits both files on the default branch, **non-fatally**: a read-only token produces
  `::warning::` and the run still reports what it found (owner Action 9), because the probe's job
  is to detect, not to publish;
* uploads the result as a run artifact for every run.

`daily_forecast.yml` and `weekly_forecast.yml` rebuild and stage the artifact in the same commit
as the data it describes.

## 3. Findings

| # | Finding | Severity | Status |
| - | ------- | -------- | ------ |
| 1 | **The freshness artifact the architecture promised did not exist** — three documents described it as shipped | high (trust surface) | built, tested, gated by `--check` |
| 2 | **The probe's findings were unreadable by the site** — a failure existed only in the Actions tab, and only for whoever looked | medium | machine-readable result published, quoted by the artifact and rendered on `/status` |
| 3 | **`"sitemap": true` crashed the build**: `prerender.mjs` calls `entry.priority.toFixed(1)`, and every other route carries `{changefreq, priority}` | medium (build-breaking, found while adding the route) | fixed to `{changefreq: daily, priority: 0.8}` and pinned by `tests/test_status_surface.py` |
| 4 | **The probe had no status-surface check at all** — `/status` and its artifact could 404 forever and the probe would stay green | medium | two checks added, one of them a cross-check against the served `prediction_date` |
| 5 | A status page can lie in three specific ways (fake liveness, invented model version, unknown age as `0 h`) | high if shipped | each blocked by a test (page copy test, artifact tests, render test) |

## 4. Verification

| Check | Result |
| --- | --- |
| `jest` | **76 suites / 856 tests pass** (was 72/816) — +4 suites: `__tests__/freshnessArtifact.test.js` (19), `__tests__/statusPagePrerender.test.js` (4), `frontend/src/lib/__tests__/freshness.test.ts` (11), `frontend/src/pages/__tests__/StatusPage.test.tsx` (6, incl. 2 axe runs) |
| `pytest scripts/tests` | **481 passed** (was 456) — `test_status_surface.py` (15) re-derives the artifact's numbers from the committed snapshots independently of the builder, and `test_security_disclosure.py` (10) keeps `security.txt` and `SECURITY.md` current |
| `tsc -p frontend/tsconfig.json --noEmit` | clean |
| `eslint .` | 0 errors (269 warnings, all pre-existing) |
| `cd frontend && npm run build` | green; 21 routes prerendered, sitemap 17 URLs, `dist/status/index.html` carries the figures and `dist/data/freshness.json` is byte-identical to the source |
| `node scripts/build_freshness_artifact.mjs --check` | passes against the committed tree |
| Preview (built `dist`) | `/status` renders; `/data/freshness.json` served |

## 5. What Phase 7 deliberately does not do

* **No uptime history, no availability percentage, no hosted status service.** The architecture's
  complexity budget rejects it, and a percentage nobody computes is a claim this project cannot
  support.
* **No new metrics.** `api/metrics.js` stays as it is: per-invocation serverless counters would
  misdescribe a fleet, and the one metric that is honestly computable per invocation
  (`hazardnet_forecast_age_hours`) already exists. The status artifact is the publishable form of
  the same fact.
* **No ownership claim over the deployed surface.** The page reports the probe's finding, and
  until owner Action 7 is done that finding is `fail` — correctly. The first real committed probe
  result will say the deployment serves none of its declared headers and 404s its API, which is
  true.
* **No model version, no invented coverage.** Phase 9 work, unchanged by this phase.

## 6. Owner prerequisites (all pre-existing, one new)

| Action | Why this phase needs it |
| --- | --- |
| **Action 7** (deployment root) | until it is done the probe is red and `/status` says so — the page working as designed, not a bug |
| **Action 9** (new: *Settings → Actions → General → Workflow permissions* → read **and write**) | without it the probe result is uploaded as an artifact but never committed, so the page cannot show it; the workflow warns instead of failing |
| Action 2 (merge) | the artifact and the page are on this branch, not on `main` |
| Action 1 (rotation) | unchanged by this phase; `/status` does not publish credentials, and the artifact carries only hashes and paths |

## 7. Files

**New:** `scripts/build_freshness_artifact.mjs` · `frontend/public/data/freshness.json` ·
`frontend/src/lib/freshness.ts` · `frontend/src/components/status/FreshnessPanel.tsx` ·
`frontend/src/pages/StatusPage.tsx` · `docs/ops/STATUS_PAGE.md` · `data/site-health/README.md` ·
`__tests__/freshnessArtifact.test.js` · `__tests__/statusPagePrerender.test.js` ·
`frontend/src/lib/__tests__/freshness.test.ts` ·
`frontend/src/pages/__tests__/StatusPage.test.tsx` · `scripts/tests/test_status_surface.py`.

**Modified:** `frontend/scripts/prerender.mjs` (panel renderer + styles) ·
`frontend/src/components/ArticlePage.tsx` (optional `introSlot`) · `frontend/src/App.tsx` ·
`frontend/src/components/{Footer,MenuDrawer}.tsx` · `frontend/src/content/site-routes.json`
(the `/status` entry, 17 routes) · `.github/workflows/{site-health,daily_forecast,weekly_forecast}.yml` ·
`data/README.md` · `docs/ops/owner-actions.md` (Action 9) · `docs/codebase/CONCERNS.md` (Phase 7
section + §4 row) · `docs/PRODUCT_SPEC.md` (1.7-draft) ·
`docs/architecture/TARGET_ARCHITECTURE.md` (§6) · `docs/MONITORING_SETUP_GUIDE.md` (§1.3) ·
`SECURITY.md` (observability bullet, owner-actions pointer).
