# HazardNet Model Card

**Model:** HazardNet multi-hazard classifier (3D depthwise-separable CNN + severity head)
**Version:** `2.1.9+model.d7b1a5b48aa6` (`Models/VERSION.json`)
**Date:** 2026-09-17 · **Status:** 🚧 **DRAFT — unreviewed, and *not* fit for public accuracy claims**
**Companion document:** `docs/PRODUCT_SPEC.md` (product contract + ground-truth defect list)

> **Read this first.** This card documents the model *as it actually exists in the repository* on
> 2026-09-17. It replaces `assets/docs/MODEL_CARD.md`, whose performance figures could not be
> traced to any artefact (see §9). Every number below is either (a) read out of a file in this
> repository with the path given, or (b) explicitly marked **UNVERIFIED** with the reason. Nothing
> here is rounded up, and no metric is quoted from a file that does not exist.

---

## 1. What it is

A supervised multi-class classifier that assigns one of eight climate-hazard classes to a
**district-level spatio-temporal tensor**, plus a regression head that scores damage potential
(severity) in `[0, 1]`. Intended use: rank districts for sub-seasonal agricultural risk
prioritisation, one to two weeks ahead.

**Out of scope / never claimed:** official warnings, evacuation decisions, sub-district
(upazila/union) precision in the live product, hazards not in the eight-class list (landslide,
erosion, urban waterlogging, storm surge, earthquake).

## 2. Architecture

Verified in two independent implementations, which is how the details were confirmed:

| Aspect | Value | Where |
| ------ | ----- | ----- |
| Block | `DepthwiseSeparableConv3d` → ReLU → `SEBlock3D(reduction=4)` → MaxPool3D | `ml/HazardNet_auto_train.ipynb` cell 9 (`HazardNetCNN`), cell 12 (deployment copy) |
| Channels | 15 → 32 → 64 → 128 → 256 | same |
| Temporal pooling | first pool is `(1,2,2)`, second is `(2,2,2)` — the only temporal downsampling | same |
| Head | `AdaptiveAvgPool3d(1)` → 8-class logits + 1 severity output | same |
| Multi-task loss | homoscedastic uncertainty weighting (`HomoscedasticMTLLoss`) | cell 9 |
| Input | `(1, 15, 10, 64, 64)` NCDHW; TFLite runtime expects NDHWC, transposed in the inference script | `Models/README.md`, `Models/inference_example.py` |
| Parameters | ~1.2 M per the retired card — **UNVERIFIED**: computed nowhere in the repo and no layer summary is committed | — |
| Artifacts | `hazardnet_fp32.tflite` 790,504 B, sha256 `6b76d7ef…43d1c`; `hazardnet_int8.tflite` (nominal FP32 — see §5) | `Models/VERSION.json` |
| Serving hash | `version` = package version + first 12 hex of the artifact content hash | `scripts/gen-model-version.mjs` |

## 3. Inputs

15 channels, fixed order (`Models/preprocessing_config.json` → `band_order`), z-scored with the
committed per-channel statistics (`Models/normalization_stats.json`):

| Idx | Channel | Source | Notes |
| --- | ------- | ------ | ----- |
| 0–1 | `SAR_VV`, `SAR_VH` | Sentinel-1 (GEE) | Cloud-penetrating — the rainy-season workhorse |
| 2–5 | `Blue`, `Red`, `NIR`, `SWIR` | Sentinel-2 / Landsat 8-9 (harmonised) | Optical; **blind under monsoon cloud** unless gap-filled |
| 6–9 | `Temp_2m`, `Precip`, `Max_Temp`, `Min_Temp` | ERA5-Land | Training/back-history |
| 10–12 | `Soil_W1`, `Soil_W3`, `Soil_T1` | ERA5-Land | **Replaced by constants at inference** — §6.3 |
| 13–14 | `Dewpoint`, `Solar_Rad` | ERA5-Land | |

Tensor geometry: `T=10` timesteps × `64×64` pixels, ~10-day composite per step covering the
preceding ~100 days; each district is represented by a 320 m-buffered point
(`ee.Geometry.Point(...).buffer(320).bounds()`, ~640 m box) resampled at 10 m to 64×64
(`scripts/auto_forecast.py`). **Consequence: spatial context is a ~0.64 km square per district —
not a district-shaped field.** Nothing in the pipeline aggregates over the district polygon.

Labels: 8 classes, fixed order (`Models/labels.json`) — Cold Wave, Drought, Fire, Flash Flood,
Flood, Heat Wave, Severe Local Storm, Tropical Cyclone.

## 4. Training data

| Item | Value | Where |
| ---- | ----- | ----- |
| Events | **2,931** historical hazard events, 2000–2025, 64 districts — *reported, not verified* | `assets/docs/MODEL_CARD.md` (retired card) — **the event table itself is not in this repository**. The store that makes the number measurable now exists (`scripts/db/008_hazard_events_postgis.sql` + `python -m etl.cli events`, §6.5); until the archive is loaded, the count stays "reported" |
| Event table location | Kaggle dataset `ashifahmedshuvo/hazardnet-datasets` → `master_tensors.h5` | `ml/HazardNet_auto_train.ipynb` cells 3–4, 7 |
| Sampling | ~117 events/year nationally across all classes | derived from 2,931 / 25 years |
| Class balance | **UNVERIFIED** — no per-class counts are committed. The shipped forecast distribution (§6.1) and the class list (floods/cyclones dominate reported Bangladesh disasters; fire and severe local storm are rare) both imply strong imbalance |
| Splits | Event-based k-fold, spatial leave-one-district-out, temporal (season-adaptive), spatio-temporal (division × season × era) — all four implemented as selectable strategies | notebook cell 9, `STRATEGY_MAP`; the strategy actually used for the deployed artifact is `event_kfold` |
| Preprocessing version | Not recorded per row (see §6.4) | — |

### 4.1 Temporal leakage — the specific risk

The notebook implements a **temporal** strategy (`run_temporal`, "Season-Adaptive") but the
configured default is `STRATEGY = 'event_kfold'` — a **random event split**. With 15-channel
tensors that include the *same* districts across overlapping 10-day windows, a random event split
lets near-duplicate samples of the same event/district/season land in both train and test. This
inflates every headline metric, and it is exactly the failure mode the product roadmap calls out
as project-killer #3.

**Requirement before any accuracy claim:** every reported metric must come from
`STRATEGY = 'temporal'` (and `spatio_temporal` for spatial generalisation), with the split
boundaries published.

## 5. Deployment artifacts

- **FP32 TFLite** — the artifact the daily pipeline runs (`scripts/auto_forecast.py` loads
  `Models/hazardnet_fp32.tflite` via `tflite_runtime`).
- **INT8 TFLite (nominal)** — `hazardnet_int8.tflite` is *not* an INT8 model. Per `Models/README.md`
  and notebook cell 12 (`int8_path = .../hazardnet_optimized_fp32.tflite`), TFLite's `CONV_3D`
  kernels have no INT8 support, so the "INT8" bundle slot holds an FP32 model. **Quantization, and
  therefore the edge/latency story, does not exist.**
- **Golden parity test** — exported models are compared against the PyTorch source over 50 samples
  with a ≥95 % class-agreement gate (notebook cell 12, `golden_parity_test`). Good practice; it
  validates the conversion, not the model's accuracy.

## 6. Measured behaviour (as deployed)

All figures below are computed from `frontend/public/data/forecasts-latest.json`
(produced by the real TFLite CNN via `scripts/auto_forecast.py`; the file is now
schema `hazardnet-forecast-snapshot/v2`, `prediction_date 2026-09-16`, and reports `coverage.status:
partial` — 60 of 64 districts, 74 forecast units of the 128 a full run covers) and from the
committed archive `data/hazardnet_forecasts_latest.csv`.

**Everything in this section describes rows produced by the pre-Phase-2 pipeline** (before
2026-09-17). Those rows have no `provenance` block, so they are self-identifying: if
`provenance.pipeline_version` is absent, §6 applies as written. Phase 2 changed three of the
mechanisms below — see the status notes in §6.3, §6.4 and §8 — but has not yet produced a shipped
run, so there is no post-fix measurement to report here. Do not read this section as a statement
about the current code path.

### 6.1 Prediction distribution — degenerate

| Check | `7_days` | `15_days` |
| ----- | -------- | --------- |
| Districts present | 25 / 64 | 49 / 64 |
| Distinct hazard classes predicted | 2 (Flash Flood 22, Tropical Cyclone 3) | 1 (Flash Flood 49) |
| `confidence` = 1.0000 | 19 / 25 | 49 / 49 |
| `severity_score` range | 0.848 – 1.000 | 0.997 – 1.000 |

A classifier that returns the same class for every district, at ~100 % confidence and ~1.0 severity,
has no ranking power. This is the single most important fact about the model's current output, and
it is why the product spec forbids describing these numbers as probabilities.

**Likely causes, in order of suspicion** (each testable):
1. **Softmax saturation / miscalibration** — logits are large relative to temperature; temperature
   scaling is implemented (`temperatureScale(tf, logits, 1.0)`) but with `T = 1.0`, i.e. a no-op.
2. **Train/serve skew** — 9 of 15 channels substituted at t0 (§6.3).
3. **Class imbalance + event leakage** — a model trained with a random event split on flood-heavy
   data returns the majority class.
4. **Single-timestep pooling bug** — `MaxPool3d((1,2,2))` on block 1 means temporal semantics differ
   from what a naive reading suggests; worth verifying against the trained weights.

### 6.2 Class coverage in the live product

Only 3 of 8 classes have *ever* appeared in a shipped forecast (Flash Flood, Tropical Cyclone,
Flood; the 127-row archive contains 118/8/1). Cold Wave, Drought, Fire, Heat Wave and Severe Local
Storm are trained but not currently produced — which is plausible in September, but has never been
demonstrated as seasonal behaviour rather than a defect.

### 6.3 Input integrity at inference time (train/serve skew)

`scripts/auto_forecast.py → build_t0_and_infer`:

- Channels 6–14 at the most recent timestep come from **Open-Meteo forecast values**, not the
  ERA5-Land reanalysis the model was trained on. Values are substituted in place of the reanalysis
  bands with no re-normalisation check (`om_bands` overwrite `t0_np[6:15]`).
- **`Soil_W1`, `Soil_W3`, `Soil_T1` are set to the constants `0.32, 0.32, 299.0`** — the training
  means, i.e. zero information — so the model's live input is effectively **12 informative
  channels**, and 3 channels carry a distribution shift relative to training (constant vs. varying).

  **Status (Phase 2, 2026-09-17): GUARDED, not fixed.** The constants are now resolved from
  `HAZARDNET_SOIL_MODE` rather than hard-coded: `mean` keeps the pipeline running and stamps every
  row `soil_channels_fabricated=true` (carried into `manifest.json`, the run report and the
  snapshot); `forbid` aborts the run with an explicit message. `validate_forecasts.py` warns on
  every placeholder run. The real fix — fetching ERA5-Land soil moisture/temperature at the live
  timestep — is still outstanding, so **a forecast produced today still rests on 12 informative
  channels**, and now says so in its own record.
- Units throughout are handled by convention comments (`om_precip_m` holds metres over the horizon,
  `om_*_temp_k` holds °C despite the suffix), and the same conventions are re-implemented in the
  Node ingest path (`backend/utils/forecastRow.js`). Two independent implementations of the same
  unit contract with no shared test is a standing defect risk.

### 6.4 Reproducibility

A shipped forecast row cannot be reproduced: it records no model version, dataset version,
preprocessing version or input-scene list. `data_source: "Hybrid_Cognitive_Forecast"` is a free-text
label with no definition in the repository. **Requirement (Phase 2):** stamp
`model_version`, `dataset_version`, `tensor_build_id` and the contributing scene IDs into every row.

**Status (Phase 2, second increment, 2026-09-17): MOSTLY MET.** Rows now carry `model_version`
(from `Models/VERSION.json`), `tensor_build_id` (sha256 prefix of the model artifact),
`pipeline_version`, `run_id`, `confidence_kind`, the per-class physics scores, and **`dataset_version`**
— a content hash over the inputs behind each prediction unit (`scripts/etl/scene_manifest.py`), built
from the nine decadal windows, the contributing collections, a sha256 of every tensor in the stack
(including the t0 input) and the Open-Meteo request/response fingerprint. The scene manifest travels
with the artifacts (`backend/data/forecasts/hazardnet_scene_manifest.json`), its run-level version and
a `lineage` block (`status: complete|partial`, `rows_with_version/rows_total`) appear in the website
snapshot, and `scripts/publish_forecast_csv.py` **refuses to publish** a run whose lineage is missing,
failed or does not cover every row.

Still missing, and named here rather than implied:

* **per-scene enumeration** — the manifest records `scenes_enumerated: false` and digests tensors
  instead of listing Sentinel-2/S1 item ids (enumeration costs one extra Earth Engine round trip per
  collection per district). Enough to detect *that* the inputs changed, not enough to name the scene;
* **the COG archive** — `scripts/etl/cog.py` defines and validates the contract and generates the
  GDAL commands, but no COG has been archived yet, so the pixels behind a version are still fetched
  fresh from Earth Engine rather than pinned;
* **rows published before 2026-09-17** have an empty `dataset_version`, which is the accurate record:
  the snapshot served today reports `lineage.status = partial` for exactly that reason.

### 6.5 Phase 2 pipeline increments (2026-09-17)

Three load-bearing changes, all pinned by tests:

| Change | Where | Test |
| ------ | ----- | ---- |
| Independent physics track (all 8 classes, no dependence on the model's pick; `om_calc_flood` takes a horizon total *and* a peak 24 h) | `scripts/physics_severity.py`, wired in `scripts/auto_forecast.py` | `scripts/tests/test_physics_severity.py` (18), `scripts/tests/test_model_claims.py` |
| Coverage accounting: per-skip reasons, `hazardnet_run_report.json`, publish/validate gates, `coverage` in the v2 snapshot | `auto_forecast.py`, `publish_forecast_csv.py`, `validate_forecasts.py`, `build_forecast_snapshot.mjs` | `scripts/tests/test_publish_forecast_csv.py`, `scripts/tests/test_validate_forecasts.py` |
| Row provenance (`model_version`, `tensor_build_id`, `pipeline_version`, `run_id`, `confidence_kind`) end to end into the API envelope | generator → manifest → snapshot → `backend/utils/forecastRow.js` → `backend/utils/predictFromStore.js` | `scripts/tests/test_csv_ingestion.mjs`, `__tests__/predictFromStore.test.js` |

#### 6.5.1 Second increment — ingestion ETL, event store, lineage

| Change | Where | Test |
| ------ | ----- | ---- |
| Historical event store (PostGIS): `hazard_events` + the 64-row district validation snapshot + per-run ingest audit + aggregate views + `hazard_event_prior()` | `scripts/db/008_hazard_events_postgis.sql`, verified by `scripts/db/verify_hazard_events.sql` | `scripts/tests/test_etl_events.py` (55) |
| Event loader/validator that **reports the drift** against the 2,931-event claim instead of asserting it, emits reviewable SQL and never invents rows | `scripts/etl/events.py`, `scripts/etl/db.py`, `scripts/etl/cli.py` | `scripts/tests/test_etl_events.py` |
| `w3` hydrology stream: FFWC levels vs published danger levels, lead-time damping, staleness, worst-station-per-district, `available: false` (never `0`) for uncovered districts | `scripts/etl/hydrology.py` | `scripts/tests/test_etl_hydrology_bulletins.py` (46) |
| `w3` official stream: BMD bulletins → structured advisories + the `model_agrees_with_official` feedback signal (null when no bulletin named the district) | `scripts/etl/bulletins.py` | `scripts/tests/test_etl_hydrology_bulletins.py` |
| COG preprocessing contract (EPSG:4326, 512 tiles, overview series, explicit nodata, per-source band scales incl. MODIS LST 0.02 K) + job planning + post-write verification | `scripts/etl/cog.py` | `scripts/tests/test_etl_sources_cog.py` (53) |
| Source adapters with fixture/live modes that return `ok: false` + a reason rather than an empty payload (the monsoon optical gap is *labelled*, not zero-filled) | `scripts/etl/sources.py` | `scripts/tests/test_etl_sources_cog.py` |
| `dataset_version` end to end: generator → scene manifest → published manifest → snapshot row + `lineage` block → frontend parser, with publish/validate gates | `scripts/etl/scene_manifest.py`, `auto_forecast.py`, `publish_forecast_csv.py`, `validate_forecasts.py`, `build_forecast_snapshot.mjs`, `frontend/src/lib/forecasts.ts` | `test_etl_sources_cog.py`, `test_publish_forecast_csv.py`, `test_validate_forecasts.py`, `frontend/src/lib/__tests__/forecasts.test.ts` |

Two defects in the loader itself were found by these tests as they were written, both of which
would only have surfaced on a real database: the generated `insert into public.hazard_events` listed
one more column than it supplied values for (every load would have been rejected outright), and the
64-row district snapshot had no foreign key on `adm2_pcode`, so an event could be stored with a pcode
belonging to no district. `scripts/tests/test_etl_events.py::test_every_insert_tuple_has_exactly_one_value_per_column`
and the migration-parity test now fail if either returns.

Two incidental defects were found and fixed while wiring coverage:
the model's class **ordinal** was being written into `hazard_type` for part of the pipeline's history
(now mapped through the pinned class order and range-checked), and the site's district-name alias map
was missing GAUL spellings — `Nawabganj` (Chapainawabganj) never matched its card, and a dangling
`jessore → jashore` alias rewrote a working key (`scripts/tests/test_district_name_parity.py` now
guards the whole name set in both directions).

## 7. The second, undocumented inference path

`POST /api/predict` — the endpoint behind the dashboard's "Softmax classification" panel — is served
by `backend/inference.js`, which:

- calls `loadModel()`, which only waits for `tf.ready()` — **no weights are ever loaded**;
- fetches no tensors: it reads summary statistics of the input (`channelMeansArr`, `channelMaxes`,
  `channelMins`) and computes eight **hand-written linear scores**, e.g.
  `Flash Flood: 2.8*maxPrecip + 2.0*ndwi − 1.8*sarVV`, labelled in code as
  "Hazard Logit Activations (3D Depthwise-Separable Squeeze-and-Excitation representations)";
- pushes those scores through a softmax and a hand-written sigmoid
  (`anomalyScore = 0.3*maxPrecip + 0.25*maxTemp − 0.2*minTemp + 0.25*soilDeficit + 0.2*ndwi − 0.15*sarVV`).

It is a heuristic scorer wearing the trained model's output schema. The deployed `/Models/*.tflite`
files are deliberately 404'd by the server, so the trained CNN is never reachable in production
either.

**Implications.** (1) The API's confidence/severity numbers are not the CNN's. (2) The API envelope
reports `model_version` from `Models/VERSION.json`, which is a true statement about the *artifact*
and a misleading one about the *computation*. (3) Any A/B claim ("the dashboard matches the
pipeline") is untested — there is no parity harness between the two paths.

**Decision required (Phase 1 architecture):** run the real TFLite model server-side (Triton/TFLite
worker), or delete `backend/inference.js` and serve the daily pipeline's outputs only. Keeping both
is not defensible.

## 8. Known failure modes

| # | Failure | Mechanism | Detection plan |
| - | ------- | --------- | -------------- |
| 1 | Blind during monsoon cloud | Optical channels 2–5 (S2/Landsat) are unusable under cloud; only SAR channels remain informative | Log per-run cloud fraction per district — **partly guarded (Phase 2)**: the ingestion adapters report `optical_gap`/`monsoon` per window and refuse to substitute zeros, and the manifest names the collections each step used; the *live* pipeline still falls back to constant-zero optical channels when the S2 composite is empty (`scripts/auto_forecast.py`), so the model can still be shown a cloud-free-looking zero tensor |
| 2 | Constant-placeholder channels | Soil channels fixed at training means (§6.3) | Assert non-constant variance before inference — **still open**; rows are now stamped `soil_channels_fabricated=true` and `HAZARDNET_SOIL_MODE=forbid` can refuse the run |
| 3 | Silent district dropout | GEE failure → `continue` → district absent from output, no record | Coverage stamp + fail on < 64 districts — **guarded (Phase 2)**: every skip recorded with a reason, publisher refuses an untallied run, validator fails a tally that disagrees with the rows; the site still needs to label the gaps (Phase 5) |
| 4 | Overconfident output | Saturated softmax (§6.1) | Reliability diagram; isotonic calibration — **open** (Phase 3), now namespaced as `confidence_kind: model_softmax_top_class` so a calibrated value can never be confused with it |
| 5 | Class collapse | Majority-class attraction under imbalance + leakage (§6.1) | Per-class prediction histogram alert — **open** (Phase 3) |
| 6 | Non-independent "physics" track | Physics score computed *from the model's chosen class* | Compute all 8 physics scores independently — **fixed (Phase 2)**: `scripts/physics_severity.py` scores all eight classes from weather drivers alone, the `om_calc_flood(precip, precip)` argument bug is fixed, agreement/divergence/top-hazard are emitted per row, and `scripts/tests/test_model_claims.py` fails if a branch on the predicted class returns |
| 7 | Two models, two answers | API heuristic vs. pipeline CNN (§7) | Parity harness, or single path |
| 8 | Extreme-event novelty | Training ends 2025; unprecedented events are out-of-distribution | Track prediction drift vs. historical priors |

## 9. Retired claims (do not reuse)

These appeared in `assets/docs/MODEL_CARD.md` and were repeated in the site's marketing. None can be
reproduced from this repository, and two are contradicted by the shipped data.

| Retired claim | Why it is retired |
| ------------- | ----------------- |
| "Event-Based 5-Fold Cross Validation (Acc: **98.8 %**)" | No artefact contains this number: not the notebook, not `Models/VERSION.json`, not CI. Random event-split accuracy is also the metric most inflated by temporal leakage (§4.1) |
| "Spatial Leave-One-District-Out (Acc: **95.6 %**)" | Same: no result file, no run log, no committed metrics |
| "**~1.2 M** parameters" | No parameter count is computed in the repo |
| "**2,931** unique hazard events (2000–2025)" | The event table lives in a Kaggle dataset keyed to a Drive path in a Colab notebook; it is not committed, so the number still cannot be audited here. As of 2026-09-17 the *store and loader* exist (§6.5.1) and every ingest run records the measured total, the per-class/per-year counts and the drift against 2,931 — so the claim can now be checked the moment the export is loaded. Until then: "reported by the training notebook's dataset" |
| "INT8 quantization bypassed … model operates in native FP32" | Correct as a fact, but it means the edge/offline latency story has no basis — recorded here rather than as a feature |
| "Accuracy" used as a public claim anywhere | Replaced by the product rule in `docs/PRODUCT_SPEC.md` §3: no accuracy claim without a temporally held-out, published evaluation |

## 10. Evaluation status and next steps

**What exists:** a genuinely thorough evaluation *harness* (four split strategies, per-class
metrics, normalised confusion matrices, severity RMSE/R² by quartile, R² scatter, spatial heatmaps,
publication-quality figures at 300 dpi — notebook cell 9), a golden-parity conversion test, and an
artefact handshake (`Models/VERSION.json`) enforced in CI.

**What does not exist:** a single committed result from that harness. There are no per-class
precision/recall/F1 values, no ROC/PR curves, no calibration curve, no confusion matrix, and no
lead-time or POD/FAR/CSI numbers anywhere in the repository.

Priority order (feeds Phases 2–3 of the deployment plan):

1. **Triage the degenerate output** (§6.1) — it makes every downstream feature meaningless.
2. **Version the dataset in-repo** (event table + split definitions) so metrics are reproducible.
3. **Run the harness with `STRATEGY='temporal'` and `spatio_temporal`**, commit the results and the
   split boundaries; report per-class metrics, not accuracy.
4. **Calibrate** (isotonic on a recent, disjoint window) and publish a reliability diagram; replace
   `confidence` semantics accordingly, in code and in copy.
5. **Fix the physics track** so it is independent, then define the warning-level mapping from
   agreement + calibrated probability (product spec §1.3).
6. **Collapse to one inference path** (§7) and add a parity test if two are genuinely needed.
7. **Stamp provenance** (model/dataset/preprocessing/scene IDs) into every published row.

## 11. Ethical and operational notes

- Hazard advice affects safety decisions. Over-warning erodes trust; under-warning costs lives.
  The product spec therefore requires **recall-first thresholds** for life-threatening classes, a
  published false-alarm rate, and a human review step before anything above `WATCH`.
- The model's spatial unit (a ~640 m box per district) must not be presented as sub-district
  precision.
- Public copy must state that HazardNet is not an official warning service and must point to BMD,
  FFWC and the national emergency numbers (product spec §1.7).
