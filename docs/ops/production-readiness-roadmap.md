# HazardNet Production Readiness Roadmap — Reviewed & Reconciled

**Date:** 2026-09-17
**Input:** "HazardNet Deployment Plan — Early Warning & Emergency Support Web App, Production Readiness Roadmap" (owner draft, 9 phases / 21 steps)
**Method:** every item of the draft was checked against the actual repository (code, ADRs 0001–0008, `assets/docs/MODEL_CARD.md`, `scripts/db/` migrations, CI, monitoring) and against what the deployment topology really is (ADR 0003: Vercel + Supabase + GitHub Actions). The draft's *principles* are adopted almost wholesale; its *stack* is not — it describes a greenfield system, but HazardNet is a deployed, CI-green product. Rewriting it would be risk without reward.

---

## Part A — Review of the draft plan

### A.1 Verdict

| Dimension | Verdict |
|---|---|
| Principles (calibration, temporal splits, HITL, fusion, honesty) | **Adopt** — these are the strongest part of the draft and address real gaps |
| Greenfield stack (Next.js, FastAPI, K8s, Triton, MLflow, Redis/Celery) | **Reject for now** — replaces a working system; every goal is achievable on the existing stack |
| Timeline (9 weeks, ~20 major deliverables) | **Reject** — that cadence assumes a team; rescheduled below for a solo maintainer + agent |
| New product capability (alert engine, HITL, reviewer console, feedback loop) | **Adopt** — this is the genuine missing surface; it becomes the core of the work path |

### A.2 What the draft gets right — kept as governing principles

1. **Product contract before infrastructure.** One page: hazards covered, warning levels, cadence, users, disclaimer. (WP0)
2. **Calibration is the #1 credibility risk.** The model card's `severity_score` is an uncalibrated continuous output; "98.8% CV accuracy" is not a probability. Isotonic regression on a *temporally held-out* window is adopted verbatim. (WP1)
3. **Temporal leakage critique is valid.** `MODEL_CARD.md` documents Event-Based 5-Fold CV and spatial Leave-One-District-Out — **no temporal split, no hindcast**. Metrics may be inflated; this must be measured before any public accuracy claim. (WP1, WP4)
4. **The CNN is one evidence stream, not the oracle.** Fusion score = model severity + hydrology + meteorology + historical prior is exactly right — and two of the four streams *already exist in the daily CSV* (model severity, Open-Meteo `om_*` fields). (WP2)
5. **Never auto-publish.** DRAFT → PENDING_REVIEW → PUBLISHED with RBAC-enforced `alert.review` permission. (WP2)
6. **Feedback flywheel** — user reports and reviewer rejections become labels. (WP2/WP4)
7. **Published POD/FAR beats aesthetics.** Adopted, including the monthly public metrics page. (WP4)
8. **Accessibility + lite mode + Bengali** are non-negotiable for a public emergency tool. (WP3)
9. **The honest positioning sentence** is adopted verbatim as the landing-page and model-card framing.

### A.3 Modifications — stack & scope (each with the repo fact that forces it)

| # | Draft says | Modified to | Why (repo evidence) |
|---|---|---|---|
| M1 | Next.js 14 App Router PWA | **Keep React 18 + Vite SPA**; prerender only the trust/methodology pages if Search Console data shows SPA crawl problems | PWA already ships (`manifest.json`, service worker, offline forecast snapshot); 45 jest suites + e2e green; blog already carries the SEO surface with per-article meta |
| M2 | FastAPI core API | **Keep Express (`backend/`) + Vercel serverless (`api/`)**; Python stays the pipeline language (`scripts/auto_forecast.py`) | The API parity split (Express ↔ Vercel functions) is tested and documented; a second language runtime doubles ops burden for zero user-facing gain |
| M3 | PostgreSQL 15 + PostGIS on VPS | **Supabase Postgres** (already the cutover target, ADR 0002; migrations 001–007 exist; PostGIS ADM3 layer already written in `003_adm3_spatial_postgis.sql`) | Same engine, already wired: `FORECAST_STORE=supabase`, RLS on blog tables, pooled connections |
| M4 | Redis + Celery/NATS queue | **GitHub Actions schedules** (the daily pipeline is the proof this pattern works) + a `jobs` table if async user-facing work appears | No always-on worker exists today; Vercel functions + Actions cover the cadence |
| M5 | Triton / GPU inference service | **Keep TFLite CPU on the runner + TF.js client-side** | Model is 0.75 MB, 1.2M params, 64-district scan runs in minutes on a free runner; GPU has no justification at this scale |
| M6 | Export FP32 **and INT8** TFLite, verify <1% F1 drop | **Struck entirely** | ADR 0007: TFLite `CONV_3D` crashes under INT8; the bundle is FP32-only by design, documented in the model card |
| M7 | MLflow registry | **In-repo registry first**: `Models/VERSION.json` (sha256 manifest, CI-gated by `gen-model-version.mjs`) + git tags + model card + eval artifacts; MLflow deferred (see A.6) | One model, one artifact, quarterly retrain — a server is not yet justified |
| M8 | MapLibre + TiTiler + COG/MVT | **Keep Leaflet** (cluster/heat already built, mobile-tuned this month); Tippecanoe tiles via `scripts/tiles/` only when raster layers actually ship | 64-district GeoJSON is kilobytes; a tile server is infrastructure without a customer today |
| M9 | Docker → K8s, Terraform + Ansible, 2–3 VPS | **Deferred** (see A.6) | ADR 0003 topology (Vercel + Supabase + Actions) is deployed, monitored, and free-tier |
| M10 | SMS (SSL Wireless/Infobip) in alert engine v1 | **Phase-gated**: v1 publishes via web push (VAPID, already live) + site + (optional) Telegram bot; SMS when a named partner commits to receiving it | `plugins/plugin_manifest.json` has an `sms_gateway` *stub* only; an emergency SMS channel nobody has agreed to receive is a liability |
| M11 | "Replace the fake-terminal aesthetic" on landing | **Adopt the intent, smaller move**: landing becomes a trust page (positioning, live alert summary, methodology, disclaimer); the GIS dashboard moves to `/map`; terminal-styled logs move to `/status` | The landing *is* currently the full-screen GIS dashboard (`/` → Dashboard gis tab) |
| M12 | `GET /v1/regations/{id}/history` | Fixed typo → `/v1/regions/{id}/history`; served from the new `hazard_events` table | — |

### A.4 Corrections of fact (draft assumptions vs. repo reality)

1. **"18 ms inference"** — the deployed product runs TF.js inference *client-side* and TFLite on the pipeline runner; the number that matters publicly is end-to-end freshness, not a chip benchmark. `scripts/bench-predict.mjs` exists and will feed the /status page instead.
2. **"41+ indexed documents"** (code comments / STRUCTURE.md) — the real numbers: `references/` holds **17 source files**, consolidated into **10 knowledge-base entries** totalling **~1,180 words** in `agent_knowledge_base.json`. Trust surfaces must state real numbers; more importantly, the RAG corpus itself is thin — expanding it is a content-engine task, not a correction (ties into the content-moat phase). The RAG freshness check (`check-rag-freshness.mjs`) already gates build drift.
3. **Alerts per union/upazila** — the daily pipeline is **64-district level**. The 507-unit ADM3 matrix was a capability of the deleted Kaggle notebook (ADR 0005). Upazila-level alerting is deferred (A.6) until the events DB and fusion prove out at district level.
4. **Migration hygiene**: `scripts/db/` has two files numbered `003` (`003_adm3_spatial_postgis.sql`, `003_user_dashboard.sql`). Renumber before adding new migrations (WP1-T2).
5. The draft's dataset step assumes the 2,931 events need *collecting* — they exist as the training corpus (GEE-derived, referenced in MODEL_CARD.md) but **not as queryable data in the repo**. Consolidating them into PostGIS is real work (WP1-T1).

### A.5 What already exists (the draft plans to build these — we won't)

| Draft item | Already in repo |
|---|---|
| CI/CD pipeline (lint → test → build → deploy) | `ci.yml`: 6 green jobs incl. e2e, security audit, dep scan, code quality |
| Secrets verification | `verify-secrets.yml` + `verify-actions-secrets.sh` |
| Scheduled ingestion | `daily_forecast.yml` (GEE + Open-Meteo + TFLite on the runner, no Kaggle) |
| Data-freshness monitoring | Prometheus freshness gauge, `alerts.yml` (48h SLO), `site-health.yml` |
| Grafana dashboards | `monitoring/grafana-dashboard.json` |
| PWA + offline fallback | Service worker + committed forecast snapshot (`useForecasts()` fallback chain) |
| SEO foundations | `robots.txt`, `sitemap.xml`, blog with RLS + per-article meta, structured data |
| Auth | Firebase (frontend) + Supabase (JWT attach middleware), rate limiting, CSP/helmet |
| Model artifact integrity | `Models/VERSION.json` sha256 manifest, CI gate on regeneration |
| Push notifications | VAPID web push, live in the UI |
| AI advisory layer | RAG advisor with multi-LLM free-tier cascade (Gemini/Groq/OpenRouter/HF) |

### A.6 Deferred with explicit trigger conditions

| Deferred item | Trigger to revisit |
|---|---|
| MLflow registry | >2 models in rotation, or challenger/shadow runs become routine |
| TiTiler / Tippecanoe tile serving | First raster layer (e.g. flood-extent COG) ships |
| SMS aggregator integration | A named DDM/NGO partner commits in writing to receiving SMS alerts |
| K8s / VPS / Terraform | Vercel or Supabase free tiers are exceeded, or an always-on worker (queue) is genuinely needed |
| Upazila (ADM3) alerting | Fusion validated at district level + events DB proves spatial resolution supports it |
| Bengali voice/SMS | After bn locale ships and terminology is DDM-reviewed |

---

## Part B — Modified target architecture (delta view)

```
                        ┌──────────────────────────────────────────┐
                        │  EXISTING (unchanged)                    │
  React 18 + Vite PWA ──┤  Vercel edge + serverless (api/*)        │
  Leaflet map, RAG chat │  Express backend (self-host/dev twin)    │
                        │  Supabase Postgres (+PostGIS ADM3, RLS)  │
                        │  GitHub Actions: daily_forecast pipeline │
                        │  Firestore (legacy store, ADR 0002)      │
                        └──────────────┬───────────────────────────┘
                                       │  adds
                        ┌──────────────▼───────────────────────────┐
                        │  NEW (this roadmap)                      │
  WP1  hazard_events table (2,931 events, versioned) + calibration │
       artifacts + temporal-split audit                             │
  WP2  fusion scorer (backend/utils/fusionScore.js):                │
         w1 model severity (CSV) + w2 FFWC river [owner-gated]      │
         + w3 Open-Meteo (CSV om_*) + w4 seasonal/spatial prior     │
       alert state machine (DRAFT→PENDING_REVIEW→PUBLISHED→…)      │
       alerts + alert_reviews + feedback tables (RLS)               │
       reviewer console (/dashboard, RBAC: analyst/reviewer/admin)  │
       publish → web push (existing VAPID) + public /alerts API     │
  WP3  /alerts pages + map layer + freshness badges; lite mode;    │
       WCAG 2.2 AA pass; bn/en i18n; landing → trust page; /status │
  WP4  hindcast harness (Amphan 2020, Yaas 2021, 2 monsoons);      │
       nightly eval + drift (PSI); public POD/FAR page             │
                        └──────────────────────────────────────────┘
```

**Data model additions (Supabase, expand-migrate pattern):**
`hazard_events(id, type, start/end, district_id, geometry, severity, source, source_url, deaths, affected, damage_bdt, dataset_version)` · `alerts(id, district, hazard, level, calibrated_probability, fusion_breakdown jsonb, evidence jsonb, state, model_version, dataset_version, created_by, published_by, published_at)` · `alert_reviews(alert_id, reviewer, action, reason, at)` · `feedback(id, district, report_type, payload jsonb, user_id?, status)` · `input_scenes(prediction_id, scene_id, source, acquired_at, preprocessing_version)`.

---

## Part C — Execution work path

Tags: **[agent]** = executable in this repo by the coding agent · **[owner]** = requires the owner (decision, credential, external access, or sign-off). Sequence is dependency-ordered; durations are calendar estimates for solo + agent, not wall-clock engineering time.

### WP0 — Ground truth & product contract (≈1 week)

| # | Task | Tag | Exit criteria |
|---|---|---|---|
| T1 | Write `docs/PRODUCT_SPEC.md`: 8 hazards (as trained), district-level `NO_ALERT/WATCH/WARNING/SEVERE`, daily cadence + event-driven review, users, decision-support disclaimer next to BMD/FFWC links | [agent] draft → [owner] sign-off | Merged, linked from landing footer |
| T2 | Model card honesty pass (`assets/docs/MODEL_CARD.md`): add per-class P/R/F1 **placeholder marked TODO**, calibration section marked TODO, replace CV-only validation narrative with "temporal hindcast pending (WP4)", add the honest positioning sentence | [agent] | Card states known unknowns explicitly |
| T3 | Fix the "41+ documents" claim to the real KB size (17 source files → 10 entries, ~1,180 words) everywhere it appears in trust surfaces; log a follow-up to expand the corpus itself | [agent] | grep-clean |

**Gate 0:** owner approves PRODUCT_SPEC + model card framing.

### WP1 — Events DB, calibration, audit (≈2–3 weeks)

| # | Task | Tag | Exit criteria |
|---|---|---|---|
| T1 | Consolidate the 2,931-event archive (from the GEE training corpus / owner export) → `data/hazard_events/v1.0/` CSV + Supabase migration (renumber the duplicate `003` first) | [owner] export → [agent] everything else | Table queryable; changelog + `dataset_version` |
| T2 | `scripts/audit_events.py`: class balance per hazard × district × season; imbalance report committed as `docs/audits/events-imbalance.md` | [agent] | Report answers "can this model ever learn landslides?" honestly |
| T3 | `scripts/calibrate.py`: isotonic regression of `severity_score` vs. observed events on a **temporally held-out recent window** (≥2023); emit thresholds per hazard (recall-first for SEVERE) + reliability curve data | [agent] | `Models/calibration.json` versioned next to the model |
| T4 | Wire calibrated thresholds into `auto_forecast.py` output (store raw + calibrated) | [agent] | Daily CSV carries both scores |

**Gate 1:** calibration artifacts exist; imbalance report read.

### WP2 — Fusion scorer + alert engine + HITL (≈3 weeks)

| # | Task | Tag | Exit criteria |
|---|---|---|---|
| T1 | `backend/utils/fusionScore.js` + tests: w1 model severity, w3 Open-Meteo, w4 prior from `hazard_events`; w2 FFWC interface **stubbed** (returns neutral until T6) | [agent] | Unit tests pin weights + fallbacks |
| T2 | Supabase migrations: `alerts`, `alert_reviews`, `feedback`, `input_scenes` (RLS: public read published, service-role/reviewer write) | [agent] | Applied on staging project |
| T3 | API: `GET/POST /api/v1/alerts…`, `POST /alerts/{id}/review` (RBAC `alert.review`), `POST /feedback`, idempotency keys on publish | [agent] | Express ↔ Vercel parity tests (chatService pattern) |
| T4 | Alert generation job (Actions, after daily pipeline): fusion → threshold → auto-DRAFT alerts; never auto-publish | [agent] | Draft alerts appear in staging queue |
| T5 | Reviewer console `/dashboard`: queue, evidence trail (fusion breakdown + sources + freshness), approve/reject/escalate | [agent] | HITL round-trip works e2e in e2e test |
| T6 | FFWC river-level ingestion (68 stations) — scrape/API access | [owner] access → [agent] ETL | `hydrology_score` live, w2 activated |
| T7 | Publish channels: web push (existing), Telegram bot optional | [agent] | First reviewed test alert delivered |

**Gate 2:** a full DRAFT→review→PUBLISH→public-visible cycle in staging.

### WP3 — Public trust surface (≈2–3 weeks, overlaps WP2)

| # | Task | Tag | Exit criteria |
|---|---|---|---|
| T1 | `/alerts` list + `/alerts/:id` detail (evidence, calibrated probability, model_version, data_freshness, BMD/FFWC links, disclaimer) | [agent] | Pages render from alerts API |
| T2 | Map alert layer + data-freshness badges ("River levels: 3h ago") | [agent] | Badges on every layer |
| T3 | Lite mode (text-first, no WebGL, <50 KB) + WCAG 2.2 AA pass (keyboard list view, ARIA live regions, contrast, reduced-motion) + axe e2e checks | [agent] | Lighthouse a11y ≥ 95 |
| T4 | bn/en i18n foundation; DDM terminology list (সতর্কতা / সতর্ক সংকেত / দুর্যোগ…) | [agent] scaffold → [owner] native review | Language toggle; terms reviewed |
| T5 | Landing → trust page (positioning, live summary, methodology, disclaimer, partners); GIS dashboard to `/map`; `/status` public page (uptime + per-source freshness from existing metrics) | [agent] | `/` no longer assumes map users |
| T6 | Structured data: `Dataset` (hazard archive), `FAQPage` on trust pages | [agent] | Rich results eligible |

### WP4 — Validation, drift, soft launch (≈2 weeks)

| # | Task | Tag | Exit criteria |
|---|---|---|---|
| T1 | `scripts/hindcast.py`: rerun fusion over Amphan 2020, Yaas 2021, last 2 monsoons vs. observed impact | [agent] | POD/FAR/CSI + lead-time distribution report |
| T2 | Nightly eval job (Actions): rescore last N days, drift PSI on score distribution, freshness per source → alerts on regression | [agent] | Runs green on schedule |
| T3 | Public metrics page (monthly POD/FAR, model version, known failure modes) | [agent] | Published monthly artifact |
| T4 | Tabletop exercise: 3–5 DDM/FFWC/NGO reviewers on the console | [owner] | Friction points logged → issues |
| T5 | Soft launch: "experimental / decision-support beta" banner, feedback button → `feedback` table | [agent] | Live on production |

### Milestones

| Gate | Calendar | Exit criteria |
|---|---|---|
| G0 spec+card | wk 1 | Product contract + honest model card signed off |
| G1 data spine | wk 4 | Events DB versioned; calibration + imbalance reports committed |
| G2 alert engine | wk 7 | HITL cycle end-to-end in staging; FFWC live or explicitly deferred |
| G3 public surface | wk 9 | /alerts + lite mode + a11y ≥ 95 + bn/en + /status |
| G4 soft launch | wk 11 | Hindcast published (POD/FAR); beta live; tabletop done |

### The 5 project-killers, mapped

| Killer | Mitigation | Where |
|---|---|---|
| Uncalibrated confidence + auto-publish | Isotonic calibration; HITL enforced at API level; published FAR | WP1-T3, WP2-T3/T5, WP4-T3 |
| Optical-only blindness in monsoon | Sentinel-1 SAR already an input; hydrology fusion carries lead time | model card, WP2-T1/T6 |
| Temporal leakage inflating metrics | Temporal holdout + hindcast before any public accuracy claim | WP1-T3, WP4-T1 |
| Canvas-only frontend invisible to search | Trust pages + structured data + existing blog SEO; map stays for map users | WP3 |
| No ground-truth loop | Feedback table + reviewer rejections as labels + quarterly retrain | WP2-T2/T3, WP4 |

### Owner-action checklist (things only you can do)

1. Sign off PRODUCT_SPEC + model-card framing (G0).
2. Export/provide the 2,931-event archive in source form (G1).
3. FFWC river-level access (scrape/API/contact) — or explicitly defer w2.
4. Bengali disaster-terminology review by a native speaker familiar with DDM usage.
5. Recruit 3–5 tabletop reviewers (DDM/FFWC/NGO).
6. Supabase staging + production project credentials for new migrations (env-injected, never committed).
7. Decide the SMS partner question when a recipient organization commits.

---

*Living document — update the gates as work lands. Everything tagged [agent] can be executed incrementally on the `arena/01a0adae-hazardnet` branch pattern (PR per work package, CI-green merge).*
