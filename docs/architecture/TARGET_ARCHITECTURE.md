# HazardNet Target Architecture (Phase 1)

**Date:** 2026-09-17 · **Status:** 🚧 **For owner acceptance** — the decisions below are recommended,
not ratified. Two of them are ADRs: [`0009` (one inference path)](../adr/0009-single-inference-path.md),
[`0010` (alert persistence)](../adr/0010-alert-engine-persistence.md).
**Inputs:** `docs/PRODUCT_SPEC.md` (contract), `docs/MODEL_CARD.md` (model reality),
`docs/audits/2026-09-17-live-surface-audit.md` (live surface), ADRs 0001–0008.

> **How to read this.** §1 is what exists today, verified against the code. §2 is the target. §3 is
> the interfaces between the parts, which is what actually has to be frozen before Phase 2 starts.
> §4 is the technology decision table — including the plan's recommendations this architecture
> **rejects or defers**, with the trigger that would change the answer. §5 is the environment/CI
> story, §6 observability, §7 the deliberate complexity budget, §8 the exit criteria.
>
> The deployment plan's architecture (§Step 3) is a sensible target for a team of ten. This is a
> single-maintainer project on Vercel with a working daily pipeline, so the target keeps that
> shape and buys the *contracts* the plan is really after — asynchronous inference, one source of
> truth, auditable alerting, declared freshness — without paying for infrastructure that has no
> operational owner. Every deferral names the trigger that ends it.

---

## 1. Current state (verified)

```
                        ┌──────────────────────────────────────────────┐
  visitor ──HTTPS──►    │ Vercel                                       │
                        │  · static: frontend/dist (prerendered HTML   │
                        │    for 15 routes + 5 noindex app screens)    │
                        │  · serverless: api/*.js (forecast reads,     │
                        │    ingest, metrics, v1/forecasts, v1/weather)│
                        │  · headers/CSP/cache: frontend/vercel.json   │
                        └───────────────┬──────────────────────────────┘
                                        │  (same-origin /api/*)
                        ┌───────────────▼──────────────────────────────┐
                        │ Firebase                                     │
                        │  · Firestore `forecasts`  ◄── forecast store │
                        │  · Auth (users, roles)                       │
                        │  · rules: firestore.rules                    │
                        │ Supabase                                     │
                        │  · Postgres `blog_articles` + RLS            │
                        └───────────────▲──────────────────────────────┘
                                        │ ingest (API-key gated)
   ┌────────────────────────────────────┴─────────────────────────────┐
   │ GitHub Actions  (the real inference path — ADR 0009)             │
   │  daily_forecast.yml → scripts/auto_forecast.py                   │
   │    GEE (Sentinel-1/2, Landsat, ERA5-Land) + Open-Meteo           │
   │    → Models/hazardnet_fp32.tflite (tflite_runtime, CPU)          │
   │    → CSV → backend/data/forecasts/manifest.json (sha256)         │
   │    → scripts/build_forecast_snapshot.mjs                         │
   │    → frontend/public/data/forecasts-latest.json (committed)      │
   │  model-validation.yml · ci.yml · site-health.yml (every 30 min)  │
   └──────────────────────────────────────────────────────────────────┘
```

What each piece actually is, so the target can build on it rather than around it:

| Piece | Reality | Verdict for the target |
| ----- | ------- | ---------------------- |
| Prerendered SPA | 15 public routes + 5 `noindex` app screens, per-route head + JSON-LD, generated sitemap, `404.html` (2026-09-17) | **Keep** — it is the SEO/no-JS answer the plan asks Next.js for |
| Forecast read API | `api/v1/forecasts/{bulk,history,metadata}.js`, `api/forecasts.js`, `api/metrics.js`, `api/v1/weather*` | **Keep**, extend |
| Forecast store | Firestore `forecasts`, append-only, district/horizon keyed, read-only to clients (ADR 0002) | **Keep** (ADR 0010) |
| Interactive inference | `backend/routes/predict.js` + `backend/inference.js` — not deployed (`api/` has no predict handler), no weights loaded, clients never send a tensor | **Delete** ([ADR 0009](../adr/0009-single-inference-path.md)) |
| Batch inference | `scripts/auto_forecast.py` in GitHub Actions, real TFLite model | **Promote to the single inference path** |
| Physics cross-check | computed only for the class the model picked; `om_calc_flood(precip, precip)` | **Rebuild independently** (Phase 2) |
| Alerting | none — no state, no review, no audit | **New** (Phase 4 + ADR 0010) |
| Evaluation | harness exists in the notebook; no committed results | **New** (Phase 3) |
| Observability | `prom-client` `/api/metrics` (forecast-age gauge), `site-health.yml` probes every 30 min, Vercel Analytics | **Keep**, publish |

---

## 2. Target architecture

New components are marked `◆ new`, changed ones `▲`, and deferred-with-a-trigger ones `◇ deferred`.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ CLIENT                                                                       │
│  Public: prerendered content pages + map (Leaflet) + advisories              │
│  ▲ District card states its provenance: "stored forecast of <date>,          │
│    horizon <h>" or "no current forecast — static baseline"                   │
│  ◆ Reviewer console (/dashboard/review): pending queue, evidence card,       │
│    approve / reject / escalate, publish history                              │
│  ◆ Lite mode: text-first alert list, no WebGL map, <100 KB                   │
│  Languages: English now; Bengali reviewed by a DSA-literate speaker in P5    │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ HTTPS/JSON, same-origin /api/*
┌───────────────────────────────▼──────────────────────────────────────────────┐
│ EDGE / API (Vercel static + serverless functions; Express for local/self-host)│
│  auth + rate limits · request validation · response shaping                  │
│  /api/v1/forecasts*        (exists)   stored forecast reads, bulk + history  │
│  ▲/api/v1/predict          (redefined) read stored forecast for a district    │
│                            via backend/utils/predictFromStore.js — no compute│
│  ◆/api/v1/alerts           lifecycle reads; review actions are role-gated    │
│  ◆/api/v1/reports          async export requests (job id + status)           │
│  ◆/api/v1/feedback         user/field ground-truth reports → labels           │
│  ◇/api/v1/predict/run      request a pipeline refresh (job dispatch) —        │
│                            built only when a user need is measured            │
└───────┬──────────────────────────────┬───────────────────────┬───────────────┘
        │                              │                       │
┌───────▼──────────┐   ┌───────────────▼─────────┐   ┌─────────▼───────────────┐
│ FORECAST READ    │   │ INFERENCE (batch only)  │   │ ALERT ENGINE  ◆ new     │
│ (exists)         │   │ GitHub Actions job       │   │ state machine + HITL    │
│ Firestore +      │   │  GEE + Open-Meteo →      │   │ ◆ thresholds, escalation│
│ committed        │   │  real TFLite model →     │   │ ◆ publish = transaction │
│ snapshot         │   │  rows + coverage +       │   │ ◆ audit trail           │
│                  │   │  provenance  ▲           │   │ ◇ SMS / Telegram fanout │
└──────────────────┘   └───────────────┬─────────┘   └─────────┬───────────────┘
                                       │                       │
┌──────────────────────────────────────▼───────────────────────▼───────────────┐
│ DATA                                                                          │
│  Firestore `forecasts`            forecasts (unchanged, append-only)   ADR 0002│
│  Committed snapshot              fallback the site always has           ADR 0008│
│  ◆ Supabase Postgres             alerts + reviews + audit (transactional) ADR 0010│
│  Supabase Postgres               blog_articles (unchanged)                    │
│  ◆ Published freshness artifact  data/freshness.json, written by the pipeline │
│  ◇ Object storage (S3/R2)        only when rasters/exports outgrow Git        │
│  ◇ Tiles (COG + TiTiler / MVT)   only when HazardNet serves its own rasters   │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 The principle the plan is really asking for

The deployment plan's Step 3 says *"inference is decoupled from the web app: the API never runs
model inference inline; it queues jobs and reads results."* That principle is adopted in full — and
for free, because it is already how the system works once ADR 0009 removes the one path that
pretended otherwise. The API only ever reads; the pipeline only ever writes.

The second principle adopted from the plan is *"the CNN is one evidence stream, not the oracle"*
(Step 6). Today HazardNet has one stream (`hazard_type` + `severity_score` from the CNN) plus a
derived copy of it (`physics_severity`, computed from the model's own class choice). The target has
three genuinely independent streams and publishes their disagreement:

```
hazard evidence (district, horizon) =
    w1 · calibrated_cnn_score        (spatial/optical/SAR view)
  + w2 · physics_score               (rainfall / heat / wind thresholds — all 8 classes, computed
                                      independently of the model's pick)
  + w3 · hydrology_score  ◆ ingested (FFWC levels vs danger levels; BMD bulletins → advisories — Phase 2)
  + w4 · historical_prior ◆ computable (event store + recency-weighted prior; archive still not in-repo)
  → calibrated probability → thresholds → alert level (with HITL above WATCH)
```

**Status (Phase 2, second increment, 2026-09-17).** `w1`/`w2` are as described above (`w2` now
independent, all eight classes). `w3` and `w4` have moved from "deferred" to "ingested/computable",
which is a statement about the **data layer**, not about the model:

* `w3` — `scripts/etl/hydrology.py` scores FFWC station levels against their published danger levels
  (exceedance ratio → documented severity bands, lead-time damping for forecast-only levels, staleness
  flagging, worst-station-per-district) and `scripts/etl/bulletins.py` turns BMD prose into structured
  advisories, including the `model_agrees_with_official` ground-truth signal. Neither is wired into
  the fusion yet and neither runs on a schedule — the daily pipeline still publishes `w1`+`w2` only;
* `w4` — `scripts/db/008_hazard_events_postgis.sql` plus `python -m etl.cli events` make the prior
  computable and its 2,931-event claim checkable, but the archive itself is not in this repository, so
  no run has been produced from it yet.

The fusion step that combines the four streams, and its calibrated probability, remain Phase 3.

### 2.2 Layer responsibilities

**Client** — renders; never computes a hazard number. Every displayed value arrives tagged with its
provenance (stored forecast + date + horizon + model version, or explicitly "static baseline").
This is the contract Phase 0's honesty fixes already implement on the dashboard and analytic pages.

**Edge/API** — authentication, rate limits, validation, and response shaping. Two rules learned the
hard way: no endpoint returns a number the pipeline did not produce; and no endpoint discloses
internal errors (SEC-13, `backend/utils/clientError.js`).

**Inference (batch job)** — the only place the model runs. Its contract is §3.3.

**Alert engine** — turns evidence into levels, enforces human review above `WATCH`, and records every
decision (ADR 0010 for storage). It reads forecasts; it never triggers inference inline.

**Data** — one writer per store, one store per purpose: Firestore for forecasts, Postgres for
lifecycle/audit, the committed snapshot for availability, the published freshness artifact for
observability.

**Ingestion** — the batch job's inputs. Phase 2 adds FFWC/BMD bulletins and fixes the input integrity
problems in `MODEL_CARD.md` §6.3 (three channels currently fed constants) before any new source is
added.

---

## 3. Interfaces to freeze (this is the Phase 1 deliverable)

Everything here can be built in parallel against these contracts.

### 3.1 Forecast row (published)

Unchanged from `scripts/build_forecast_snapshot.mjs`, plus mandatory provenance (Phase 2):

```
district_id, district_name, division, pcode, horizon, hazard_type,
severity_score, confidence, confidence_kind, target_date, prediction_date,
model_severity, physics_severity, data_source,
model_version, dataset_version, tensor_build_id,     ← new: reproducibility (MODEL_CARD §6.4)
temperature_mean, temperature_max, temperature_min, precipitation_mm,
wind_max_kmh, dewpoint_mean, solar_radiation_mj_m2, evapotranspiration_mm
```

`confidence_kind` distinguishes `model_softmax_top_class` (today) from a future
`calibrated_probability` — so a consumer can never mistake one for the other.

**Implemented 2026-09-17 (Phase 2, first increment):** `model_version`, `tensor_build_id`,
`pipeline_version`, `run_id`, `confidence_kind` and the physics-track columns
(`physics_top_hazard`, `physics_top_severity`, `physics_agreement`, `track_divergence`,
`physics_inputs_missing`, `soil_channels_fabricated`, and one `physics_<class>` score per class)
are emitted by `scripts/auto_forecast.py`, carried through `publish_forecast_csv.py` →
`manifest.json` → the v2 snapshot, parsed by `backend/utils/forecastRow.js` and exposed in the
`/api/predict` envelope's `provenance` block.

**Implemented 2026-09-17 (Phase 2, second increment): `dataset_version` and per-prediction scene
lineage.** `scripts/etl/scene_manifest.py` defines the manifest (`hazardnet-scene-manifest/v1`) and
derives `dataset_version = ds1.<16 hex>` as a content hash over each prediction unit's inputs: the
nine decadal windows, the collections queried per step, a sha256 of every tensor in the stack
(including the t0 input) and the Open-Meteo request parameters plus the canonical digest of the
response. `scripts/auto_forecast.py` builds the units and stamps the version on every row;
`publish_forecast_csv.py` copies `hazardnet_scene_manifest.json` next to the artifacts and refuses to
publish when the lineage block is missing, errored or incomplete; and the snapshot exposes the per-row
version plus a run-level `dataset_version` and `lineage` block.

**Still missing from this row contract:** per-scene enumeration (the manifest records
`scenes_enumerated: false` and digests tensors instead of listing Sentinel item ids — a digest detects
*that* inputs changed, not *which* scene changed) and the COG archive that would pin the pixels
themselves. Also outstanding: the artifact-level `model_sha256` is in the manifest/run report but not
on each row (rows carry the short `tensor_build_id`).

### 3.2 Coverage stamp (mandatory, Phase 2)

```json
"coverage": {
  "requested": 64, "produced": 49, "missing_district_ids": [...],
  "horizons": { "7_days": {"requested": 64, "produced": 25}, "15_days": {"requested": 64, "produced": 49} }
}
```

Rule: the site may show a district without a forecast **only** while labelling it as baseline, and
the published freshness artifact reports coverage per horizon. This closes the silent-dropout defect
(`PRODUCT_SPEC.md` §5.1) at the data layer rather than in the UI.

**Implemented 2026-09-17 (Phase 2, first increment).** The emitted stamp is
`hazardnet-run-report.json → coverage`:

```json
"coverage": {
  "requested_units": 128, "produced_units": 74, "status": "partial",
  "requested_districts": 64, "districts_with_any_horizon": 60,
  "horizons": ["7_days", "15_days"],
  "per_horizon": {"7_days": {"requested": 64, "produced": 25}, "15_days": {"requested": 64, "produced": 49}},
  "missing_district_ids": [1, 2, 3], "missing_district_names": ["Bagerhat", "…"],
  "skipped": [{"district_id": 4, "district_name": "Bandarban", "horizon": "*", "reason": "no_historical_steps"}]
}
```

`units` (district × horizon) is used as well as `districts` because a district can be covered at one
horizon and missing at the other — that is exactly what the shipped data shows (25 at `7_days`, 49 at
`15_days`). The publisher copies this tally into `manifest.json` and **refuses to publish without
it**; the validator fails a manifest whose tally disagrees with the CSV rows, or that carries no
model provenance. The snapshot exposes the subset a reader can act on (`coverage.status`,
`units_per_horizon`, `districts_per_horizon`, `districts_covered`, `districts_expected`,
`missing_district_ids` — `null` when the producer did not report them).

**Still open:** the UI labels (Phase 5). The data layer now states the gap; the dashboard still
renders baseline numbers for a district with no current forecast.

### 3.3 Inference job contract (the pipeline as a service)

In: `{ districts[], horizons[], model_path, dataset_version, requested_at }`
Out: rows (§3.1) + coverage (§3.2) + a `run_report` (`{started_at, finished_at, per_district_status[],
source_health[]}`) + `data/freshness.json` for the public status page.

Failure semantics: a district that fails is recorded as `status: "failed"` with a reason — it is never
silently absent, and the run is "partial" rather than "success".

### 3.4 Predict envelope (this ADR's seam, implemented)

`backend/utils/predictFromStore.js` shapes a stored row into the envelope the frontend already
consumes, with `null` for anything the row cannot fill and a `metadata.fields_unavailable` list
naming those fields. Invariant, enforced by `__tests__/predictFromStore.test.js`: **no value in the
envelope is invented** — every field is copied, derived by a documented rule, or declared
unavailable. Today that means `class_probabilities`, `top_3`, the SAR/optical driver values and
`latency_ms` are `null`; Phase 2 shrinks the list by emitting per-class scores and driver values.

### 3.5 Alert record (Phase 4 sketch)

`alerts(id, unit_id, horizon, level, hazard_type, calibrated_probability, evidence_snapshot jsonb,
model_version, data_cutoff, state, published_at, created_by, updated_at)` ·
`alert_reviews(alert_id, reviewer, decision, reason, decided_at)` ·
`alert_audit(alert_id, actor, action, before jsonb, after jsonb, at)` — per ADR 0010.

---

## 4. Technology decisions

Format: **choice → why → rejected alternative → trigger that would change the answer.**
Rows marked *(unchanged)* are existing decisions this review re-affirmed after checking them against
the code.

| Layer | Decision | Why | Rejected / deferred | Revisit trigger |
| ----- | -------- | --- | ------------------- | --------------- |
| Frontend framework | **Vite + React SPA with build-time prerendering** *(unchanged)* | Delivers the plan's actual requirement (SSR content, SEO, fast first paint) as static HTML for 15 routes, verified in the 2026-09-17 audit; the app is a map, which is client-side by nature | Next.js 14 App Router — a rewrite of every route and the map for no property that prerendering does not already give | Server-rendered per-user or per-request pages, or image/ISR needs (e.g. district pages generated from live data at request time) |
| API runtime | **Node/Express ESM, dual-deployed** (Vercel functions `api/` + self-host `backend/server.js`) *(unchanged, ADR 0003)* | Already deployed and tested; the plan's reason for FastAPI ("same ecosystem as the model") evaporates once inference is batch-only (ADR 0009) | FastAPI — would add a second language to the request path for nothing | CPU-heavy per-request work that Node cannot do (not foreseen; raster ops would go to the batch side too) |
| Inference placement | **Batch only** ([ADR 0009](../adr/0009-single-inference-path.md)) | Decoupling is the plan's own principle; the interactive path is dead in production and has no weights | Inline inference on request (6.7 s CPU, needs GEE creds); a heuristic "fast path" (that is the defect being removed) | Measured need for sub-daily, per-unit refresh — then a real TFLite/ONNX worker, never a second scorer |
| Inference compute | **CPU `tflite_runtime` in GitHub Actions** *(unchanged)* | Runs today; a 790 KB FP32 model on 64 districts is minutes, not hours | GPU worker / Triton — infrastructure with no current workload; INT8 edge bundle (ADR 0007: blocked by `CONV_3D`) | Per-unit (ADM3) scans at sub-daily cadence, or a wall-clock budget breach measured in `run_report` |
| Forecast storage | **Firestore `forecasts`** *(unchanged, ADR 0002)* | Append-only, keyed, read-mostly, already served by the API and the snapshot | Postgres+PostGIS for forecasts — no query the current access pattern needs; adds a migration with no owner | Need for server-side spatial joins or cross-forecast analytics that Firestore cannot express |
| Alert/audit storage | **Supabase Postgres (+PostGIS only when needed)** ([ADR 0010](../adr/0010-alert-engine-persistence.md)) | Transactions across publish+audit; provable append-only audit; reuses the identity already used for content | Firestore for alerts (no cross-document transaction with the concurrency semantics HITL needs); a new database vendor | — (decision is structural; revisit only if alerts are dropped from scope) |
| Jobs / queue | **GitHub Actions schedules** *(unchanged)* | The pipeline already runs there with GEE credentials and artifact provenance; a daily job needs no broker | Redis + Celery/RQ; NATS — a broker with no consumer, for a single daily job | User-triggered or sub-hourly refreshes (§3.3 job dispatch) |
| Geospatial serving | **Static boundaries (HDX COD-AB) + client-side lookup** *(unchanged)*; PostGIS deferred | Containment is a lookup, not a query; boundaries are already committed (ADR 0005) | A tile server / COG pipeline now | Publishing rasters (not point scores) as a product, or server-side spatial aggregation |
| Tiles / raster serving | **Deferred** ◇ | The map uses public basemaps + client layers; HazardNet publishes scores, not imagery | TiTiler + COG, MVT from PostGIS | First raster product (flood extent layer, exposure map) |
| Object storage | **Deferred** ◇ — GitHub Releases for the CSV archive, Git for the snapshot | Volume is kilobytes; Git-based storage gives free history and provenance | S3/MinIO | Rasters, large exports, or per-run artifacts that exceed Git's comfort zone |
| IaC | **Deferred** ◇ — `vercel.json`, `firebase.json`, workflow YAML are the config | Three files, one owner, no stateful infra to reconcile | Terraform + Ansible + a VPS staging estate | A stateful staging environment (shared Postgres/staging Firebase project) that must be reproducible |
| CI/CD | **GitHub Actions** *(unchanged, extend)* | `ci.yml` already gates tests, model-bundle validation, workflow linting; `site-health.yml` probes production every 30 min | A separate CD product | — |
| Release strategy | **Vercel instant rollback + tagged releases + expand/migrate/contract SQL migrations** *(unchanged, formalised)* | Blue/green is inherent to Vercel's immutable deploys; the only stateful change is the Phase 4 schema | Kubernetes rollouts | Multi-service deployment where the frontend and the API version independently |
| Model registry | **Content-hash artifacts + `Models/VERSION.json` + a CI freshness gate** *(unchanged)*, plus a recorded run report per pipeline execution | Already exists and is enforced in CI; the missing half is *metrics*, not artifacts | MLflow — a server for one model | Champion/challenger or more than one concurrently served model (Phase 3 retraining loop) |
| Secrets | **GitHub Actions secrets + Vercel env + Firebase env config** *(unchanged)* | No long-lived services to rotate; GEE creds are already job-scoped and deleted after use | Vault | Multi-service production with rotation/compliance requirements |
| Observability | **prom-client `/api/metrics` + the 30-min site-health probes + a published `data/freshness.json`** ▲ | Cheap, already deployed, and it measures what matters (forecast age, coverage, endpoint honesty) | Prometheus/Grafana/Loki stack; Sentry | An on-call rotation, or more than one service whose health must be correlated |
| Status page | **Static page generated from `data/freshness.json` + the probe workflow** ◆ **delivered (Phase 7)** — `/status`, `scripts/build_freshness_artifact.mjs`, `docs/ops/STATUS_PAGE.md` | Publishes the thing trust depends on (freshness per source, coverage per horizon) with no new infra | Hosted status SaaS | Multiple dependent services |

---

## 5. Environments, CI/CD, migrations

**Environment mapping to this stack** (the plan's dev → staging → production, without new machines):

| Stage | What it is | How it is isolated |
| ----- | ---------- | ------------------ |
| dev | `npm run dev` (Vite :5173) + `npm start` (Express :3000) + the committed snapshot | Local `.env`; no cloud writes |
| staging | A Vercel **preview deployment** of a branch, plus a **test Firebase project** and a Supabase staging schema | Preview URL + separate project credentials; never the production Firestore |
| production | The Vercel production deployment (`www.hazardnet.live`) | As today |

Gaps to close in Phase 2 (they are prerequisites for Phase 4, not architecture): the pipeline's
GitHub Actions job currently writes to the production path only; a `--dry-run` mode that emits the
run report and snapshot to an artifact (no commit, no ingest) is the cheap staging story and should
land before the alert engine does.

**CI/CD (extend `ci.yml`, don't replace):**

```
PR   → lint · jest · pytest · model-bundle validation · workflow lint · build + prerender smoke
main → same, then: staging preview deploy (Vercel) → site-health probes → production promote
        → pipeline run → snapshot commit → deploy triggered by the commit
```

**Migrations:** Phase 4 SQL uses expand → migrate → contract, one migration per PR, with the authz
parity test extended in the same PR (`scripts/tests/test_blog_authz_parity.py` is the existing model
for this).

---

## 6. Observability (what must be true, not what tool we use)

| Question a duty officer / maintainer will ask | Answer source (target) |
| --------------------------------------------- | ---------------------- |
| How fresh is the forecast? | `data/freshness.json` (generated per run) + `hazardnet_forecast_age_hours` |
| Which districts are missing this run, and why? | `coverage` stamp + `run_report` (§3.2, §3.3) |
| Which model produced this number? | `model_version` on the row (§3.1); no response claims otherwise |
| Is the site honest right now? | the site-health probe workflow (deep links, headers, sitemap honesty, freshness, the status page + its artifact) → published as `data/site-health/latest.json` and rendered on `/status` |
| Why was this alert published? | `alert_audit` + the frozen `evidence_snapshot` (ADR 0010) |
| Is the model still behaving? | Phase 3 eval harness: per-class metrics, drift, POD/FAR — **not yet built** |

### 6.1 The content and search surface (Phase 8)

Phase 8 answers a question §6 did not: *what can a person (or a crawler) learn without opening
the map?* The rule is the same one the status page follows — a page may state what a committed
artifact says and nothing else.

| Question | Answer source |
| --- | --- |
| What does this hazard class mean, and what does the score not mean? | one page per class under `/hazards`, composed from `src/content/hazard-methodology.json` + the current run |
| What does the current run say about my district? | `/districts/<id>` — hazard class, severity, confidence and the physics cross-check per horizon, plus the static baseline and the coverage gap |
| What is the recorded history? | only when an event archive is loaded: district history sections + `/retrospectives/<year>`, each printing its own count and the drift against the model card's 2,931 claim |
| What is the canonical URL of this page? | `www.hazardnet.live` — declared in `src/content/site-routes.json`, enforced by `scripts/prerender.mjs`, mirrored by the apex redirect in both `vercel.json` files |
| What did the build publish? | `frontend/public/data/content-index.json` (committed inventory), regenerated with the pages and gated by `--check` |

The pages are **composed, never authored per district**: the prose is reviewed once in
`hazard-methodology.json`, and the numbers come from the same snapshot the deployment serves. That
is the only arrangement in which 74 pages can stay true to a pipeline that runs daily.

---

## 7. Complexity budget (deliberate)

This architecture runs **no** always-on infrastructure beyond the existing managed services:
no Kubernetes, no container registry, no broker, no Vault, no MLflow server, no metrics stack.
Each deferral above names the trigger that ends it. The reason is not cost aversion but ownership:
every always-on service this project adds is a service nobody is on call for, and the failure mode
of an unowned queue or database is worse than the failure mode of a scheduled job that emails a
failed run.

The two places where this architecture **spends** are the ones the product cannot be trusted
without: the alert audit store (ADR 0010) and the evaluation harness (Phase 3). Both are additive
and neither changes the request path.

---

## 8. Phase 1 exit criteria

| # | Criterion | Status |
| - | --------- | ------ |
| 1 | Target architecture documented with layer responsibilities and data ownership | ✅ this document |
| 2 | The one-inference-path decision recorded, with deletion scope listed | ✅ [ADR 0009](../adr/0009-single-inference-path.md) (Proposed) |
| 3 | Alert persistence decision recorded, with the authz lessons applied | ✅ [ADR 0010](../adr/0010-alert-engine-persistence.md) (Proposed) |
| 4 | Interfaces to freeze agreed: forecast row + provenance, coverage stamp, job contract, predict envelope, alert record | ✅ §3 (envelope implemented) |
| 5 | Envelope seam proven against real data | ✅ `backend/utils/predictFromStore.js` + `__tests__/predictFromStore.test.js` |
| 6 | Environments defined, staging gap named | ✅ §5 |
| 7 | Technology decisions recorded with revisit triggers | ✅ §4 |
| 8 | Owner accepts ADR 0009 + 0010 | ☐ **pending** |
| 9 | Phase 2 staging prerequisite (`--dry-run` pipeline mode) scheduled | ☐ pending |

**Phase 2 starts with** (in order): rebuild the independent physics track, fix the constant channels
and the `om_calc_flood` argument bug, add the coverage stamp + provenance columns, then version the
event dataset in-repo. Phase 3's evaluation harness depends on the second and fourth items.

## 9. Assumptions and risks

| Assumption | If it breaks |
| ---------- | ------------ |
| Inference stays batch (ADR 0009 accepted) | The API contract in §3.4 already isolates the change: swap the adapter's source, keep the envelope |
| Firestore remains adequate for forecasts | ADR 0010's Postgres is the migration target; the snapshot keeps the site up during any move |
| One maintainer, no on-call | Deferrals in §7 stay deferred; nothing in §2 requires a pager |
| GitHub Actions remains the pipeline runtime | The job contract (§3.3) is runtime-agnostic — it is a script + artifact, not a workflow |
| The public surface keeps its current traffic shape | CDN + static + function reads scale further than the current load; the first thing to contend is the pipeline's GEE quota, not the site |
