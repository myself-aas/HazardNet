# HazardNet Product Spec

**Version:** 1.0-draft · **Date:** 2026-09-17 · **Owner:** project owner (see sign-off, §8)
**Status:** 🚧 **DRAFT — not signed off.** Sections marked `[DECISION NEEDED]` are open
questions for the owner; they are deliberately *not* decided by the author.
**Companion document:** `docs/MODEL_CARD.md` (what the model is, and what it is not).

> This document is the Phase 0 ground-truth contract for the HazardNet early-warning web app.
> It states what the product *is*, in terms a duty officer at DDM, an NGO field coordinator and a
> district agriculture officer can all act on — and, in §5, where the shipped system currently
> differs from that contract. Anything in §5 is a defect, not a design choice.

---

## 1. The product contract (one page)

### 1.1 What HazardNet is

A **sub-seasonal, district-level multi-hazard outlook** for Bangladesh agriculture, published as a
free web map and a machine-readable archive. It answers one question:

> *"For this district, over the next one to two weeks, which climate hazard is the dominant risk,
> how severe does it look, and how much should I trust that?"*

It is **decision-support**, not an official warning service. It never replaces BMD, FFWC, DDM or
any government instruction, and it does not manage evacuations.

### 1.2 Hazard scope

| # | Hazard class (code label) | In scope | Notes |
| - | ------------------------- | -------- | ----- |
| 1 | Flash Flood | ✅ | Dominant class in shipped forecasts; see §5.3 |
| 2 | Flood (riverine / monsoon) | ✅ | |
| 3 | Tropical Cyclone | ✅ | |
| 4 | Severe Local Storm (Nor'wester / Kalbaishakhi) | ✅ | Rare in training data → weakest class |
| 5 | Drought | ✅ | |
| 6 | Heat Wave | ✅ | |
| 7 | Cold Wave | ✅ | |
| 8 | Fire | ✅ | Vegetation/burn risk, not urban fire service |
| — | Landslide | ❌ out of scope | Concentrated in Chittagong Hill Tracts; not a trained class |
| — | Riverbank erosion | ❌ out of scope | Needs multi-year morphology, not a 10-step tensor |
| — | Urban waterlogging | ❌ out of scope | Sub-kilometre drainage, outside district resolution |
| — | Storm surge | ❌ out of scope | Correlated with Tropical Cyclone but not modelled separately |
| — | Earthquake | ❌ out of scope | Different problem class entirely |

`[DECISION NEEDED]` Should landslide and urban waterlogging be added in a later phase (requires new
labels, new inputs — DEM/slope, impervious surface, drainage), or permanently out of scope?

### 1.3 Warning output

**Target contract** (Phase 4 deliverable — the alert engine does not exist yet):

| Level | Meaning | Trigger (target) |
| ----- | ------- | ---------------- |
| `NO_ALERT` | Nothing unusual for the season | calibrated probability < watch threshold |
| `WATCH` | Monitor; conditions are favourable | calibrated probability ≥ watch threshold, **or** model/physics divergence > 0.30 |
| `WARNING` | Prepare; a damaging event is plausible | calibrated probability ≥ warning threshold **and** both evidence tracks agree |
| `SEVERE` | Act; imminent/likely damaging event | `WARNING` conditions **plus** duty-officer review (human-in-the-loop), **or** an official BMD/FFWC bulletin |

Every level carries: hazard class, lead time (days), confidence statement, evidence trail
(model severity, physics severity, driver variables), data freshness, model version, and links to
official sources. **Nothing is auto-published above `WATCH`** — `WARNING`/`SEVERE` require the
human-in-the-loop step defined in §1.6.

**Shipped today:** levels 1–4 do not exist. The system publishes a per-district
`hazard_type` + `severity_score` + `confidence`, and each district's static baseline band. The
mapping above is the Phase 4 target.

### 1.4 Trigger cadence

| Job | Cadence | Status |
| --- | ------- | ------ |
| Forecast refresh (`scripts/auto_forecast.py` → snapshot → deploy) | Daily 00:00 UTC (06:00 BST) | ✅ shipping |
| Forecast freshness SLO check (`/api/metrics`, site-health probe) | Every 30 min | ✅ shipping |
| Hindcast/skill re-scoring against observations | Nightly | ❌ Phase 3 |
| Drift detection (input/prediction/concept) | Nightly | ❌ Phase 3 |
| Retraining | Quarterly, expanding window | ❌ Phase 3 |

**Lead time:** the shipped horizons are **7 and 15 days** (§5.2). This is a sub-seasonal outlook
product, not a flash-flood warning service: a 7-day flash-flood outlook is inherently low-skill and
must never be presented as a tactical (hours-scale) warning.

### 1.5 Users

| Tier | Who | What they need | Priority |
| ---- | --- | -------------- | -------- |
| Primary | DAE agricultural extension officers, NGO field coordinators (BRAC, BDRCS, Islamic Relief), union-level agriculture staff | Which upazila/district, which hazard, which week, what to do | P0 |
| Primary | Farmers and farm households, via field officers | Plain-language, low-bandwidth, offline-capable | P0 |
| Secondary | DDM/FFWC duty officers, researchers, journalists | Evidence trail, provenance, skill metrics, exportable data | P1 |
| Secondary | Public | "Is anything happening near me?" — map + advisories | P1 |

**Accessibility is a P0 requirement, not a nice-to-have:** WCAG 2.2 AA, Bengali + English,
works on a 3G connection and a low-end Android phone, usable offline once loaded.

### 1.6 Human-in-the-loop rule

1. The pipeline may publish **`WATCH`-equivalent information** (current severity outlook) automatically.
2. Anything above `WATCH` — a public "warning"-level statement, SMS blast, or advice to act — requires
   a named duty officer to review the evidence card and approve.
3. Rejections are recorded with a reason and become training/evaluation labels.
4. Every published alert stores: reviewer identity, timestamp, model version, data cutoff, evidence
   snapshot. This is the audit trail (Phase 4, §4).

### 1.7 Disclaimer (required on every public surface, including SMS and exports)

> HazardNet is a research-based decision-support tool. It is **not** an official warning service.
> Always follow instructions from the Bangladesh Meteorological Department, FFWC and your local
> administration. In an emergency call **999** (national emergency), **1090** (disaster response),
> or **16123** (agriculture helpline).

---

## 2. Data contract

| Item | Value | Source of truth |
| ---- | ----- | --------------- |
| Spatial unit | ADM2 district (64) for forecasts; ADM3 unit (507: 495 upazilas + 12 city corporations) for the archive | HDX COD-AB, ADR 0005 |
| Labels used in code | 8 hazard classes, fixed order | `Models/labels.json`, `backend/utils/forecastRow.js` |
| Horizons used in code | `7_days`, `15_days` | `backend/utils/forecastRow.js` `VALID_HORIZONS` |
| Row schema (published) | `district_id, district_name, division, pcode, horizon, hazard_type, severity_score, confidence, target_date, prediction_date, model_severity, physics_severity, data_source` + 8 meteorological fields + provenance (`model_version`, `tensor_build_id`, `pipeline_version`, `run_id`, `confidence_kind`) + the 8 independent physics scores / `physics_top_hazard` / `physics_agreement` / `track_divergence` + `dataset_version` | `scripts/build_forecast_snapshot.mjs` |
| Freshness SLO | Snapshot `prediction_date` ≤ 48 h old | `/api/metrics` `hazardnet_forecast_age_hours` |
| Versioning | Every published row must be traceable to a model version and a dataset version | `Models/VERSION.json`; `dataset_version` from `scripts/etl/scene_manifest.py`, stamped per row and gated at publish (§5.8). Snapshot exposes `lineage.status` (`complete`/`partial`) so a deployment knows whether every row can name its inputs |
| Historical events | The `w4` prior's event table, with an auditable count | `scripts/db/008_hazard_events_postgis.sql` (store) + `python -m etl.cli events` (loader; reports drift vs the 2,931 claim). Table itself not in-repo |
| Ingestion streams | Sentinel-1/2, Landsat-8, MODIS, ERA5-Land, Open-Meteo, FFWC, BMD — each with an explicit "no data" answer | `scripts/etl/sources.py`, `hydrology.py`, `bulletins.py` |

---

## 3. What "trustworthy" means here (acceptance criteria for going public)

A public claim about accuracy may only be made when the corresponding artefact exists:

| Claim | Evidence required | Status |
| ----- | ----------------- | ------ |
| "HazardNet predicts hazard X" | Per-class precision/recall/F1 on a **temporally held-out** test set, published | ❌ not yet measured |
| "Confidence 0.9 means 90 %" | Calibration curve + reliability diagram; isotonic/Platt scaling fitted on a recent, disjoint window | ❌ not calibrated (see model card §6) |
| "We are improving" | POD/FAR/CSI + lead-time distribution published monthly | ❌ not measured |
| "This is early warning" | Lead time vs. event onset, compared against BMD/FFWC bulletin lead times | ❌ not measured |
| "Free and open" | Public archive with licence + stable schema | ✅ shipping |

**Product rule:** until a row in this table has evidence, user-facing copy must describe the
quantity as a *relative prioritisation signal*, not a probability. Copy that violates this rule is a
release blocker (Phase 8 SEO/content work will be held to it).

---

## 4. Non-goals

- Not an evacuation-authority service; no direct-to-public SMS blasts before Phase 9 validation.
- Not a nowcast system (no sub-hourly, radar-based severe-weather alerts).
- Not a replacement for FFWC flood forecasting or BMD cyclone tracks.
- Not a general disaster-management platform (no relief logistics, no damage assessment).
- Not a real-time sensor network (no proprietary gauge hardware).

---

## 5. Ground truth: contract vs. shipped system (2026-09-17)

Measured against the live deployment, the committed archive and `frontend/public/data/forecasts-latest.json`
(generated 2026-09-16T15:32Z). **These are defects to fix, not design decisions.**

**Fix log** — each finding below carries a status line. `FIXED` means code exists and a test pins it;
`GUARDED` means the defect can no longer ship silently but the underlying data quality question is
still open; `OPEN` means nothing has changed yet. The historical text is kept, because the published
snapshot still contains rows produced by the old pipeline and their limits must stay readable.

### 5.1 Coverage is partial and varies by horizon — and nothing says so

| Horizon | Districts in published snapshot | Districts in committed archive CSV |
| ------- | ------------------------------- | ---------------------------------- |
| `7_days` | **25 / 64** | 64 / 64 |
| `15_days` | **49 / 64** | 63 / 64 |

The pipeline skips a district silently when an Earth Engine fetch fails
(`scripts/auto_forecast.py`: `if not historical_steps: continue`), and
`scripts/publish_forecast_csv.py` validates nothing about coverage. The website then renders those
districts from the static baseline — **visually indistinguishable from a real forecast**. The
product claim "all 64 districts" refers to the map and the archive, not to live model coverage.

*Fix (Phase 2/5):* stamp `coverage: {requested, produced, missing[]}` into every snapshot; the UI
must label a missing district "no current forecast for this horizon" rather than showing baseline
numbers.

**Status: GUARDED (pipeline), OPEN (UI).**
- `scripts/auto_forecast.py` now records every skipped district with a reason and writes a
  `hazardnet_run_report.json` (`coverage.requested_units / produced_units / per_horizon /
  missing_district_ids / skipped[]`, `status: complete|partial`). The silent
  `if not historical_steps: continue` is gone (`scripts/tests/test_publish_forecast_csv.py`,
  `scripts/tests/test_validate_forecasts.py`).
- `scripts/publish_forecast_csv.py` **refuses to publish without a run report** and refuses a report
  that disagrees with the CSV, so a partial run cannot ship unlabelled; a partial run that *is*
  labelled publishes with `coverage_status: partial` in `manifest.json`.
- `scripts/validate_forecasts.py` fails when the manifest has no tally or no model provenance.
- The snapshot is now `hazardnet-forecast-snapshot/v2` with `coverage` (units/districts per horizon,
  `districts_expected`, `missing_district_ids` — `null` when the producer did not report them) and
  `provenance`. The committed snapshot currently reports 60/64 districts, `status: partial`.
- **Still open:** the UI does not yet render "no current forecast" for a district missing from the
  coverage list — it shows baseline numbers. That is Phase 5 work, and the data it needs now exists.

### 5.2 Advertised horizons are not the shipped horizons

Public copy (homepage, `/methodology`, `/faq`, `/about`, meta descriptions) advertises
**10/20/30-day** outlooks. The code ships **7/15-day** horizons (`VALID_HORIZONS`,
`HORIZONS = {'7_days': 7, '15_days': 15}`), and the served snapshot and archive both contain only
`7_days` and `15_days`. ADR 0005 marked 10/20/30 as implemented (`[x] Backend/frontend horizon set
= 10/20/30 everywhere; 7/15 retired`) — that checkbox is **not true in the code**.

*Decision (`[DECISION NEEDED]`):* either implement 10/20/30 (§5.6 explains why that is not free) or
retire the claim. This spec assumes the claim is retired until the code changes.

### 5.3 Output distribution is degenerate

| Symptom | Measurement (2026-09-16 snapshot) |
| ------- | --------------------------------- |
| Class collapse | `15_days`: **49 / 49** rows are *Flash Flood*; `7_days`: 22 / 25 |
| Confidence saturation | **68 / 74** rows have `confidence` = 1.0000 (max 0.9999 otherwise) |
| Severity saturation | `15_days` severity range **0.997 – 1.000** (effectively constant) |
| Physics divergence | model vs. physics severity differ by > 0.20 in **65 / 74** rows (all 25 of the 7-day rows, mean absolute gap 0.65) |

An outlook in which every district has the same hazard, near-maximum severity and ~100 %
confidence carries no prioritisation information for a district officer. Until this is fixed, the
product's core promise ("which district should act first") is not met.

### 5.4 The "physics cross-check" is not independent

`scripts/auto_forecast.py` computes `physics_severity` **only for the hazard class the model chose**
(`if hazard == 'Tropical Cyclone': … elif hazard == 'Flash Flood': …`), defaulting to a flat `0.50`
otherwise. It therefore cannot detect a hazard the model missed, and a divergence does not mean
"two independent methods disagree" — it means one method is derived from the other's choice.
Separately, `om_calc_flood(precip_total_mm, precip_total_mm)` passes the same value as both
arguments (looks like an argument bug).

*Fix (Phase 2/3):* compute all eight physics scores independently of the model's pick, then compare
distributions.

**Status: FIXED.**
- The formulas now live in `scripts/physics_severity.py` (standard library only) with 18 unit tests
  (`scripts/tests/test_physics_severity.py`): `compute_physics_scores(drivers, horizon_days)` scores
  **all eight classes** from weather drivers alone — the model's predicted class is not an input.
- `om_calc_flood(precip_total_mm, precip_peak_mm)` now takes the horizon total *and* the wettest 24 h
  inside it (peak derived from the hourly Open-Meteo series); the duplicate-value call is gone, and a
  test asserts neither argument has a default. `om_calc_severe_storm` had the same wiring bug and is
  fixed the same way.
- Every row now carries `physics_top_hazard`, `physics_top_severity`, `physics_agreement`,
  `track_divergence`, `physics_inputs_missing` and per-class `physics_*` scores, so a hazard the
  model missed is visible in the data. `scripts/tests/test_model_claims.py` fails if a branch on the
  predicted class comes back.
- Known limit, documented in the module: `Flood` and `Flash Flood` share one rainfall formula
  (separating them needs hydrology/FFWC data — TARGET_ARCHITECTURE §2.1), and in a rain-heavy cyclone
  the flood proxy can outrank the cyclone proxy.
- **Rows published before 2026-09-17 keep the old, conditioned `physics_severity`** (the site copy
  says so explicitly); `provenance.pipeline_version` distinguishes them.

### 5.5 `confidence` does not mean what the site says

`confidence` is the model's **softmax score for the class it selected** (`run_inference`, written
straight to CSV). Public copy defines it as "how much the model agrees with the physics-based
cross-check" and states "low confidence means the two tracks disagree". Neither statement is true
of the shipped pipeline, and the data contradicts it (68/74 rows at ≈1.0 while 65/74 rows disagree).

*Fix now (copy) + Phase 3 (actually derive a calibrated confidence).*

### 5.6 The 15-channel tensor is partly synthetic at inference time

At the most recent timestep, 9 of 15 channels are replaced by Open-Meteo forecast values (a
different source/distribution from the ERA5-Land reanalysis used in training), and three soil
channels (`Soil_W1`, `Soil_W3`, `Soil_T1`) are set to **constants** equal to the training means
(`0.32, 0.32, 299.0`) — i.e. zero-information placeholders. The model's effective live input is
therefore 12 informative channels, with train/serve skew on 6 more.

*Fix (Phase 2):* ingest real soil moisture (ERA5-Land / SMAP) at t0, or retrain without those
channels. Any 10/20/30-day expansion must also account for Open-Meteo's ~16-day deterministic limit
(which is why ADR 0005's 20/30-day horizons were only ever a weather-window aggregation).

**Status: GUARDED (not fixed).**
- The constants are no longer hard-coded invisibly: they are resolved from `HAZARDNET_SOIL_MODE`
  (`mean` = fabricate the training means and label it; `forbid` = refuse to run, for any run whose
  output will be used for evaluation or retraining). `SOIL_MODE=forbid` currently exits with an
  explicit message because the live path still does not fetch soil variables.
- Every row carries `soil_channels_fabricated: true`, the manifest carries
  `soil_channels_fabricated` + `soil_mode`, the snapshot carries the same flag, and
  `scripts/validate_forecasts.py` prints a warning on every run that uses placeholders.
- **Still open:** the real fix — ERA5-Land soil moisture/temperature at the live timestep. Until
  then the model's live input is 12 informative channels, and the row says so.

### 5.7 The web API does not run the trained model

`POST /api/predict` (the dashboard's "Softmax classification") is served by
`backend/inference.js`, which **never loads `Models/hazardnet_fp32.tflite`**. It computes eight
hand-written linear scores from channel mean/max/min statistics and a hand-written sigmoid severity
(`anomalyScore = 0.3*channelMaxes[7] + …`), then presents them as `class_probabilities`,
`confidence` and `severity_score`. `backend/tfjs.js` only resolves a tensor engine; weights are
loaded nowhere in the serving path.

Two different "models" therefore produce user-visible numbers: the daily pipeline runs the real
TFLite CNN, while the interactive dashboard runs the heuristic. Full detail in the model card, §7.

### 5.8 Provenance labels are not verifiable end to end

Every row is stamped `data_source: "Hybrid_Cognitive_Forecast"`, a label that describes no
published method. Rows carry no model version, no dataset version, no preprocessing version and no
input-scene lineage, so a forecast cannot be reproduced from its own record.

**Status: MOSTLY MET (Phase 2, second increment).**
- Every row carries `model_version` (from `Models/VERSION.json`), `tensor_build_id` (first 16 hex of
  the model artifact's sha256 — a fallback so a row is never traceable to nothing),
  `pipeline_version`, `run_id`, and `confidence_kind: model_softmax_top_class`. The run report adds
  the full `model_sha256` and the coverage tally; the manifest and the snapshot carry them forward,
  and `backend/utils/forecastRow.js` + `predictFromStore.js` expose them through the API envelope.
- **`dataset_version` now exists.** `scripts/etl/scene_manifest.py` hashes the inputs behind each
  prediction unit — the nine decadal windows, the collections per step, a sha256 of every tensor in
  the stack (including the t0 input) and the Open-Meteo request parameters plus the canonical digest
  of the response — into `ds1.<16 hex>`. Same inputs ⇒ same version; a new scene, a shifted window or
  a revised upstream response ⇒ a different one. `scripts/auto_forecast.py` writes
  `hazardnet_scene_manifest.json`, stamps the version on every row, and records a `scene_manifest`
  block in the run report; `scripts/publish_forecast_csv.py` copies the manifest next to the
  artifacts and **refuses to publish** a run whose lineage is missing, errored, or does not cover
  every row; the snapshot exposes the per-row version, the run-level `dataset_version` and a
  `lineage` block (`status`, `rows_with_version`, `rows_total`, `scenes_enumerated`).
- `scripts/validate_forecasts.py` fails a publish whose manifest carries no model provenance, a
  malformed `dataset_version`, or a `lineage` claim that disagrees with the rows.
- **Still open:** per-scene enumeration (the manifest records `scenes_enumerated: false` and hashes
  tensors instead of listing Sentinel item ids — enough to detect that the inputs changed, not enough
  to name the scene), and the COG archive (the contract and the GDAL command generation exist in
  `scripts/etl/cog.py`; no raster has been archived yet, so the pixels behind a version are still
  fetched fresh from Earth Engine). Rows published before 2026-09-17 have an empty
  `dataset_version`, which is the honest record that they came from the older pipeline — the snapshot
  served today reports `lineage.status = partial` for exactly that reason.

---

## 6. Work this spec unblocks (Phase 1–9 mapping)

| Spec section | Feeds |
| ------------ | ----- |
| §1.3 warning levels, §1.6 HITL | Phase 4 alert engine + state machine |
| §1.4 cadence, §5.1 coverage stamp | Phase 2 pipeline + Phase 7 observability |
| §1.5 users, §1.7 disclaimer | Phase 5 UI, Phase 8 content |
| §3 acceptance criteria | Phase 3 MLOps (eval harness is the blocker) |
| §5.1, §5.3–5.5 defects | Phase 3 calibration/thresholds, Phase 2 pipeline rework |
| §5.7 two-model split | Phase 1 architecture decision: one inference path or two, explicitly |

---

## 7. Change log

| Date | Version | Change |
| ---- | ------- | ------ |
| 2026-09-17 | 1.0-draft | First written contract; §5 records eight places where the shipped system contradicts it. |
| 2026-09-17 | 1.1-draft | Phase 2 (first increment). §5.1 coverage: accounted for and gated (UI labelling still open). §5.4 physics track: independent, all eight classes, `om_calc_flood` argument bug fixed. §5.6 soil channels: labelled and refusable, still placeholders. §5.8 provenance: model/tensor/run/confidence-kind stamped; dataset version and scene lineage still open. |
| 2026-09-17 | 1.3-draft | Phase 3 (MLOps). §1.3 confidence: `confidence` remains the model's uncalibrated softmax and the API keeps labelling it (`confidence_kind`); a `calibrated_probability` row is only possible once a fitted map passes `scripts/mlops/calibration.py::validate`, and no map is shipped (`Models/calibration/confidence_map.template.json` is unfitted by design). §3 acceptance: the calibration and POD/FAR/CSI criteria remain open with a named blocker — the event archive is not loaded, so no observed outcomes can be joined. Public copy that described the score as calibrated against ground stations/Sentinel-1 (district page, methodology panel) has been corrected. Model registry, promotion policy and the nightly evaluation/drift workflow are new (`.github/workflows/mlops.yml`, `Models/REGISTRY.json`); promotion policy and the nightly report are documented in `docs/phase-reports/phase-3-mlops.md`. |
| 2026-09-17 | 1.2-draft | Phase 2 (second increment). §2 data contract: event store + ingestion streams + `dataset_version` rows added; versioning no longer "not implemented" (§5.8 now gated at publish, with `lineage.status`). §5.2 monsoon blindness: the ingestion adapters label an optical gap instead of zero-filling (the live pipeline's constant-zero fallback remains — recorded in the model card §8). §5.8: `dataset_version` is a content hash over the decadal windows, collections, per-step tensor digests and the Open-Meteo request/response fingerprint; missing/failed/partial lineage refuses publication. Per-scene enumeration and the COG archive remain open. |

## 8. Sign-off

| Role | Name | Scope | Status |
| ---- | ---- | ----- | ------ |
| Product owner | *(project owner)* | §1 contract, §4 non-goals | ☐ pending |
| ML lead | *(project owner / model author)* | §3 acceptance criteria, §5.3–5.7 fixes | ☐ pending |
| Duty-officer liaison (DDM/FFWC-affiliated reviewer) | *(to be identified — Phase 9)* | §1.3 levels, §1.6 HITL rule | ☐ pending |

**Exit criterion for Phase 0:** all three boxes above signed, and §5 defects triaged into Phases 2–3
tickets with the "output distribution is degenerate" item treated as a P0 model-quality blocker.
