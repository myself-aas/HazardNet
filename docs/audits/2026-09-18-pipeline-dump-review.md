# Review — `docs/HazardNet.md` (the uploaded pipeline dump)

**Reviewed:** commit `487e79e` ("Add files via upload"), 2026-09-18 · 5,320 lines /
257 KB, CRLF · the file was added by the owner on top of the Phase 4 commit `e15eb8f`.

**Verdict:** the file is genuine and valuable as **provenance** — it is the
research source the shipped pipeline descends from — and it is **not** a description
of the current system. It contains no credentials, no fabricated result numbers and
no retired claim strings, but it does contain five defects the repository has since
fixed, one stale heading, and one hardcoded fabrications that the repo's data-integrity
rules exist to prevent. One of its facts (**the hazard vocabulary**) exposed a real bug
in code delivered in Phase 4; that bug is fixed in the same change as this review, and
the fix is pinned by a test.

---

## 1. What the file is

Eight sections, each a Colab/Kaggle notebook body pasted verbatim inside fenced code
blocks:

| Section | Line | Contents |
| ------- | ---- | -------- |
| Phase 1 | 3 | ReliefWeb event extraction → GEE GeoTIFFs, in batches of 300 (`MAX_PENDING_TASKS: 2800`, start indices 0…2700, `BAU-HazardNet-Research-AAS7016` appname) |
| Phase 2 | 222 | Dual-track severity index: Landsat/Sentinel band harmonisation, TIF-based physical-index formulas, Open-Meteo fallback formulas, confidence binning, safety guardrails |
| Phase 3 | 617 | Dataset builder: inventory, mask-aware spatial validation, dynamic z-score normalisation, five CV strategies including the `(district × season)` GroupKFold with a hard leakage assertion |
| Phase 4 | 1623 | Ablation study: 8 hazard classes, calibration/Ece tracking, reliability diagrams |
| Phase 5 | 2375 | Training pipeline: the same harness with the leakage audit and journal figures |
| Phase 6 | 3476 | Edge deployment converter: ONNX → TFLite, `DeployConfig` (15 channels, `NUM_HAZARDS = 8`, `INPUT_SHAPE = (1,15,10,64,64)`), golden-parity test, bundle writer |
| Phase 7 | 4058 | Event-based model: master-tensor HDF5 dataset, checkpoint paths, W&B logging |
| Phase 8 | 4778 | Auto-forecast inference loop → `hazardnet_forecasts_latest.csv` |

This is the ancestry of `scripts/auto_forecast.py`, `ml/HazardNet_auto_train.ipynb` and
`Models/*`, so it is worth keeping — but it needs to be *labelled* as ancestry, which the
provenance header added in this change does.

## 2. What checks out (the document agrees with the repo)

Verified mechanically, not by eye:

| Check | Result |
| ----- | ------ |
| Hazard classes (`HAZARD_CLASSES`, line 4834) | **exact match, same order**, with `Models/labels.json` and `backend/utils/forecastRow.js::VALID_HAZARDS` |
| Band order (`DeployConfig.BAND_NAMES`, line 3519) | **exact match** with `Models/preprocessing_config.json` → `normalization.band_order` (15 bands: SAR_VV, SAR_VH, Blue, Red, NIR, SWIR, Temp_2m, Precip, Max_Temp, Min_Temp, Soil_W1, Soil_W3, Soil_T1, Dewpoint, Solar_Rad) |
| Tensor contract | `(1, 15, 10, 64, 64)`, 9 decadal windows + t₀ — matches `Models/preprocessing_config.json`, `Models/README.md` and the nine windows hashed by `scripts/etl/scene_manifest.py` |
| Horizons | `HORIZONS = {'7_days': 7, '15_days': 15}` (line 4833) — matches the row contract |
| Confidence semantics | `run_inference` returns `softmax(logits)[argmax]` — i.e. today's `confidence_kind: model_softmax_top_class`, which the Phase 3 copy corrections describe as uncalibrated |
| Output columns | the Phase 8 row dict is the direct ancestor of the served CSV (district/horizon/hazard/model_severity/physics_severity/confidence/target_date + the `om_*` driver columns) |
| Credentials | **none.** Secrets are read through `kaggle_secrets.UserSecretsClient`; the only literals are a service-account *email* and a Kaggle dataset *path*. No PEM block, no key-shaped string |
| Result numbers | **none.** No accuracy/ECE/F1 value is recorded anywhere in the file, so it makes no claim the repository would have to defend |
| Retired claims | `98.55`, `ensemble agreement`, `ground stations`, `Platt calibration`, `1.2 million` — **zero occurrences** |

## 3. What the document contains that the repo has moved past

Each of these is a defect the repository already fixed, or a fabrication the
data-integrity rules exist to prevent. A reader treating the dump as current would
reintroduce them:

1. **`om_calc_flood(precip_mm, precip_mm)`** (line 5268) — precipitation passed twice
   where the physical index expects rainfall *and* an accumulation term. Fixed in Phase 2
   increment 1 (`ab1de5c`).
2. **Fabricated soil channels** — `t0_np[6:15] = [Temp_2m, Precip, Max_Temp, Min_Temp,
   0.3, 0.3, 290.0, Dewpoint, Solar_Rad]`: soil moisture and soil temperature are
   *constants* (0.3, 0.3, 290.0 K). This is the origin of the `soil_channels_fabricated`
   flag the pipeline still carries and labels.
3. **`physics_severity = 0.50` hardcoded fallback** (line 5263) for any hazard without a
   matching formula — a fabricated mid-scale number presented as an independent
   measurement. Phase 2 increment 1 replaced this with an eight-class physics track and
   an explicit "no independent track" state.
4. **`data_source: 'Hybrid_Cognitive_Forecast'`** — the label PRODUCT_SPEC §5.8 called out
   as describing no published method; now superseded by model/dataset provenance stamps.
5. **Banner claims** — "BANGLADESH-CALIBRATED | LEAKAGE-SAFE | PHYSICALLY ANCHORED |
   STATISTICALLY PROVEN" (lines 1633, 2385) and "Uncertainty Calibration (Target
   ECE ≤0.05)" printed over a *count of confidence bins* (line 608). The second is the
   exact confusion Phase 3 corrected on the site: binning a score is not calibrating it,
   and no ECE has been measured for the shipped model (MODEL_CARD §6).

Also worth noting for anyone reading it as documentation:

6. **Stale heading** — Phase 8 is titled "(10, 20, 30 days Horizons)" while the code
   beneath it uses 7 and 15 days.
7. **Unescaped placeholder** — the bundle README f-string wrote
   `{DeployConfig.NUM_HAZARDS} hazard class labels`; the shipped `Models/README.md` has
   it resolved to "8 hazard class labels", so the file predates that fix.
8. **Owner-facing, not user-facing** — the dump opens with `drive.mount('/content/drive')`
   and Kaggle input paths. It is a record of how the work was done, not a runbook.

## 4. The bug this review found in the shipped code (fixed here)

Line 4834 of the document — and, more importantly, `Models/labels.json` and
`VALID_HAZARDS` — define the model's eight classes as:

```
Cold Wave · Drought · Fire · Flash Flood · Flood · Heat Wave · Severe Local Storm · Tropical Cyclone
```

The Phase 4 alert engine (`backend/alerts/assess.js`, `e15eb8f`) hardcoded a
**different** eight:

```
Flood · Flash Flood · Tropical Cyclone · Storm Surge · River Erosion · Landslide · Drought · Heatwave
```

That second list is the **display** vocabulary from `frontend/src/data/*`, not the
model's. Consequences, had it shipped:

* `isModelledHazard()` would have **skipped every `Cold Wave`, `Fire`, `Heat Wave` and
  `Severe Local Storm` row** — the four classes the two lists do not share — so those
  districts would receive no alert at all, recorded only as a `skipped` count;
* `Storm Surge`, `River Erosion` and `Landslide` can never appear in a forecast row
  (the CSV ingest rejects them — the existing suites use `Landslide` as their
  invalid-hazard fixture), so the engine advertised coverage it does not have;
* the Bengali digest had no labels for those four classes, so a Bengali SMS about a
  heat wave would have fallen back to an English hazard name.

Nothing caught it because every fixture in the new suites used `Flood` or
`Flash Flood` (present in both lists), and the committed snapshot happens to contain
only `Flash Flood` and `Tropical Cyclone`. The document's class list is what surfaced it.

**Fix (this change):**

* `backend/alerts/assess.js` now derives `HAZARD_CLASSES` from
  `backend/utils/forecastRow.js::VALID_HAZARDS` — the same constant the CSV ingest
  enforces — instead of restating a list.
* `backend/alerts/digest.js` `HAZARD_LABELS` now covers the model's eight classes with
  Bengali names, and deliberately contains **no** label for the display-only hazards.
* `__tests__/alerts/assess.test.js` pins `HAZARD_CLASSES` to `Models/labels.json` and to
  `VALID_HAZARDS`, and adds a per-class regression test that all eight classes are
  *assessed* rather than skipped.
* `__tests__/alerts/digest.test.js` reads `Models/labels.json` and asserts a Bengali
  label exists for every class and for none of the display-only ones.

Re-running the engine over the committed snapshot afterwards produces the identical
result (`74 WATCH`, `warning_requires_calibration ×74`), which is the expected outcome:
the shipped rows never contained the affected classes.

## 5. Repository hygiene, and what was changed around the file

The upload itself was left intact except for a **provenance header** at the top
(clearly marked as added 2026-09-18) and a guard in `scripts/tests/test_mlops_artifacts.py`:

* `test_the_archived_pipeline_dump_carries_a_provenance_header` — fails if the header is
  removed, which is what a re-upload would do;
* `test_the_archived_pipeline_dump_repeats_no_retired_claim` — fails if `98.55`,
  "ensemble agreement", "ground stations", "Platt calibration" or "1.2 million" is
  quoted in the dump as if it were a measured result.

Two residual suggestions, not done because they change authored content:

1. **Split it.** One 5,320-line file mixing eight notebooks is hard to navigate and
   cannot be diffed meaningfully. `docs/archive/pipeline/phase-{1..8}.md` would keep the
   same content with per-phase blame.
2. **Convert the fenced bodies to `.py` files.** They are Python with no Markdown
   inside; as `.py` they would at least be syntax-highlighted, optionally lintable, and
   clearly not prose.

The repo's claim guards (`scripts/tests/test_model_claims.py`) scan the site copy, not
`docs/`, so the new guard is the first thing holding this file to the same standard.
