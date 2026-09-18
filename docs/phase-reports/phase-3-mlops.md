# Phase 3 — MLOps

**Status:** complete (tooling, calibration wiring, evaluation, drift, registry,
promotion policy, automation) with one deliberate gap: **no calibration map is
shipped, because the repository has no observed-outcome dataset to fit one on.**
Everything that would let a fitted map reach a published row is built and tested;
what is missing is truth, and the pipeline now refuses rather than improvises.

Companion documents: [`docs/mlops/README.md`](../mlops/README.md),
[`CALIBRATION.md`](../mlops/CALIBRATION.md),
[`RETRAIN_AND_PROMOTION.md`](../mlops/RETRAIN_AND_PROMOTION.md),
[ADR 0007](../architecture/adr/0007-int8-quantisation-not-shipped.md),
[`docs/MODEL_CARD.md`](../MODEL_CARD.md) §6.1/§10,
[`docs/PRODUCT_SPEC.md`](../PRODUCT_SPEC.md) §1.3/§3.

---

## 1. What the plan asked for, and what was delivered

| Plan item | Delivered | Where |
| --- | --- | --- |
| Model registry + FP32/INT8 handling | Registry built from the bytes on disk, audited against `Models/VERSION.json`, with stages and a promotion policy; the "INT8" artifact recorded as a **byte-identical duplicate** of FP32 (ADR 0007), not as a second model. No quantization script: see §6. | `scripts/mlops/registry.py`, `Models/REGISTRY.json` |
| Isotonic calibration | PAVA + Platt fits, a versioned artifact with provenance, `apply()`, and validation rules that refuse an unfit/invalid map; the ingest boundary publishes `confidence_kind = calibrated_probability` only when a map produced the value. | `scripts/mlops/calibration.py`, `Models/calibration/confidence_map.template.json`, `backend/utils/forecastRow.js` |
| Nightly evaluation (POD/FAR/CSI) | Join of predictions to outcomes with four explicit buckets, contingency table, per-class one-vs-rest scores, class confusion, reliability (ECE/MCE/Brier/BSS/log-loss), lead-time distribution, and an `insufficient_truth` status instead of a score when truth is missing. | `scripts/mlops/evaluate.py`, `scripts/mlops/cli.py` |
| Drift (PSI) | Per-column PSI over the published driver columns with the legacy→canonical unit conversions, class-share PSI with a collapse check, severity-distribution PSI, and `degenerate_reference`/`insufficient_sample` instead of a number when the reference cannot support one. | `scripts/mlops/drift.py` |
| Quarterly retrain | Scheduled workflow producing a retrain brief (champion, handshake, evaluation status, checklist) and opening/updating a tracked issue. Training itself stays a human step on a machine with Earth Engine credentials. | `.github/workflows/mlops.yml`, `docs/mlops/RETRAIN_AND_PROMOTION.md` |
| Champion/challenger | Explicit policy (status, sample size, metric regressions with tolerance, absolute bars for a first champion, mandatory named approver), a `promote` command that prints the comparison and refuses on any failure, and a demotion path back to `shadow`. | `scripts/mlops/registry.py`, `Models/REGISTRY.json` → `policy` |

Along the way the phase also closed the **copy** half of project-killer #1: the
public pages no longer describe the model's softmax as a calibrated probability (see
§5).

## 2. Test evidence

| Suite | Tests | Focus |
| --- | --- | --- |
| `scripts/tests/test_mlops_metrics.py` | 26 | Contingency tables, POD/FAR/CSI denominators, "undefined is not zero", reliability bins, Brier/BSS/log-loss, PSI including the degenerate-reference and sample-size guards |
| `scripts/tests/test_mlops_calibration.py` | 28 | PAVA pooling, isotonic and Platt fits, artifact round-trip, monotonicity, every refusal rule, the shipped template, CLI `calibrate` / `apply-calibration` |
| `scripts/tests/test_mlops_registry.py` | 30 | Handshake audit (hash/size/missing/unregistered/duplicate), stage invariants, promotion gates, promotion application and refusal of the byte-identical duplicate, idempotent registry writes, CLI |
| `scripts/tests/test_mlops_evaluate_drift.py` | 34 | Join semantics (leakage, windows, absence, vocabulary, aliases), scoring with and without negatives, alarm threshold, per-class view, lead time, loader shapes, unit conversions, collapapse detection, CLI flags |
| `scripts/tests/test_mlops_artifacts.py` | 16 | The shipped template, the registry's INT8 record, the copy guards, the workflow, the docs, fixture reproducibility |
| `__tests__/calibratedConfidence.test.js` | 7 | The ingest contract for a calibrated row |

Totals after this phase: **422 Python tests** (was 288) and **444 Jest tests across
45 suites** (was 437/44); `tsc --noEmit` clean; the frontend production build green.

```
$ cd scripts && python -m mlops.cli audit
artifact audit: ok
  handshake 2.1.9+model.d7b1a5b48aa6 (4 claimed artifacts)
  ok           hazardnet_fp32.tflite        model [champion] (duplicate of hazardnet_int8.tflite)
  unregistered hazardnet_int8.tflite        model [retired] (duplicate of hazardnet_fp32.tflite)
  …
  champions: hazardnet_fp32.tflite
```

## 3. The three measurement decisions that matter

### 3.1 Absence of an event is `unknown`, not "no event"

An event-archive join can only produce positive samples: a district-window with no
archived event produces no row at all. The first version of the harness therefore
computed `FAR = 0.0` — mathematically correct and completely misleading, because no
false alarm was *possible* in the sample. The harness now:

* reports `FAR`, `CSI`, `accuracy` and `frequency_bias` as `None` with the reason
  "the scored sample contains no district-window without an event" unless the sample
  really contains negatives;
* offers `--absence-means-no-event` for the case where the archive *is* known
  complete, records that flag in the report, and uses it in the tests only because
  the synthetic fixture was generated from a complete latent truth.

### 3.2 A PSI against a saturated column is not a drift measurement

The shipped severity column is `0.9999`/`1.0` on every row (127 rows,
MODEL_CARD §6.1). A naive PSI against it produced **18.5** — a headline "significant
drift" derived entirely from the share floor, not from mass moving. PSI now returns
`degenerate_reference` (with the spread, the distinct count and how many values moved
off the reference) for a point mass, a near-point mass, or a reference whose quantile
bins collapse. On the committed data the report reads:

```
severity_distribution: degenerate_reference — the reference has only 2 distinct
values (0.9999…1); PSI needs at least 3 to bin against
```

The same reasoning produced the sample floor: two 60-row draws from the *same*
weather distribution measured PSI ≈ 0.48. The default is now 20 observations per bin
(200 per side for a 10-bin index), and the small-sample result says so.

### 3.3 Legacy units are converted, never guessed

The legacy `om_*` columns are actively mislabelled — `om_temp_2m_k` holds °C,
`om_solar_rad_j` holds kJ/m², `om_et_sum_m` holds mm, and two of the eight are
horizon totals. Guessing (reading `_k` as Kelvin) produced PSI ≈ 12 for every column
of two runs of the *same* weather. The conversion table now mirrors
`backend/utils/forecastRow.js` and `scripts/build_forecast_snapshot.mjs`, applied
per-day where the legacy column is a total, with the conversions recorded in the
report and the two fixture runs generated as the same weather so a wrong conversion
fails a test instead of quietly reporting drift.

## 4. Calibration: built, wired, and deliberately unfitted

**Mechanics.** `CalibrationMap.fit` implements isotonic regression by PAVA and Platt
scaling by damped Newton with a backtracking line search. On a synthetic
overconfident sample the isotonic fit reduces the Brier score from 0.288 to 0.187 and
the ECE from 0.299 to 0.000, and the Platt fit converges with `a ≈ 0.16` — the fitted
map recovers the diagonal that the raw score could not describe.

**Wiring.** A row carrying `confidence_calibrated` is published as `confidence` with
`confidence_kind = calibrated_probability`, the raw softmax preserved as
`confidence_raw`, and an out-of-range value rejected rather than clamped
(`__tests__/calibratedConfidence.test.js`).

**The gap.** `Models/calibration/confidence_map.template.json` is shipped unfitted
(`samples: 0`, `status: awaiting-outcomes`) and `mlops.cli apply-calibration` refuses
it. The reason is not tooling: the event archive is not loaded (the store's table is
empty by design and the sandbox has no Postgres), and no observed outcomes are joined
to the published predictions. Fitting on the model's own scores, on the ETL
fixtures, or on the synthetic MLOps fixture would produce a map that *looks*
calibrated — the exact failure this phase exists to end.

**Consequence, stated plainly:** `confidence` is still the model's softmax. Every
surface that shows it now says so (§5), and PRODUCT_SPEC §3's calibration acceptance
criteria remain open with a named blocker rather than a claim.

## 5. Copy corrections (project-killer #1, product half)

The new guard (`test_mlops_artifacts.py::test_no_copy_claims_the_model_score_is_calibrated`)
scans the user-facing copy for calibration claims that no artifact supports. It found
three beyond the one already known:

| Location | Was | Now |
| --- | --- | --- |
| `DistrictDetailPage.tsx` (~989) | "AI ensemble confidence of X% **calibrated against ground stations and Sentinel-1 SAR observations**" | "model score of X% … the classifier's own (uncalibrated) softmax" with a methodology link |
| `DistrictDetailPage.tsx` (~2297) | "**Calibration Accuracy 98.55%** — Platt Calibration — calibrated directly against BWDB ground truth river gauge stations" | "Calibration — *Not yet fitted* — no calibration map has been fitted… no calibration accuracy can be quoted" |
| `DistrictDetailPage.tsx` (~2305) | "Ensemble Agreement X% / Sentinel-1 SAR — cross-verified across radar feeds" | "Model Score X% / Softmax — uncalibrated, and not an ensemble or ground-station agreement measure" |
| `DistrictDetailPage.tsx` (~2328) | "[2] Probability Scoring & Calibration (Platt Calibration & Softmax Scoring) … **This calibrated scoring prevents false alarms and guarantees** trustworthy early alerts" | "[2] Probability Scoring (Softmax — not yet calibrated) … publishes no calibration accuracy … POD/FAR/CSI reported only once measurable" |
| `DisasterDetailModalUI.tsx` (257/406) | "Confidence: X%" | "Model score: X% (uncalibrated)" |
| `disasterDetails.ts` | `confidenceLevel` presented as model output | module header documents that the panel is a **synthesis** from the static district baseline; the field carries a warning comment |

## 6. The FP32/INT8 question, answered with an audit rather than an artifact

`Models/hazardnet_int8.tflite` and `Models/hazardnet_fp32.tflite` are the same bytes
(`sha256 6b76d7ef…43d1c`). ADR 0007 recorded why: TFLite's converter crashes on
`CONV_3D` under INT8, so the shipped "int8" bundle is a copy with a historical name,
and `scripts/gen-model-version.mjs` excludes it from the handshake. The registry
therefore:

* lists `hazardnet_fp32.tflite` as the champion and `hazardnet_int8.tflite` as a
  **retired** alias with `duplicate_of` set;
* reports `duplicate_content` in its problems list, so nobody counts two deployment
  options;
* refuses to promote the duplicate — a promotion would leave two live models with
  identical bytes, which is the mislabel the rule exists to catch.

No quantization script was written. Producing an INT8 artifact needs a converter that
works on this architecture (or an architecture change), and shipping a script that
cannot be run or verified would be a claim presented as a capability.

## 7. Automation

`.github/workflows/mlops.yml` (three triggers: nightly cron, quarterly cron,
manual):

* **nightly** — `audit` → `registry --write` → evaluation against the event archive
  → drift against the previous published run → a run-page summary → reports uploaded
  as artifacts. Nothing in it promotes a model or stamps a calibrated probability.
* **quarterly** — builds the retrain brief and opens/updates an issue labelled
  `mlops,retrain`.

Action versions match the repository's central pins
(`test_workflows.py::test_action_versions_are_consistent`), the workflow declares
top-level `permissions`, per-job `timeout-minutes`, and a `concurrency` group.

## 8. Tests that changed behaviour (and why)

Several tests failed first and each failure was a real defect, not a test to adjust:

1. **PAVA fitted the scores against themselves** — `pava(scores, [1]*n)` returned the
   input unchanged, which looks perfectly monotone and calibrates nothing. Rewritten
   as `pava(x, y, weights)` and pinned by a test that asserts it does *not* return the
   input.
2. **Platt's Newton step had the wrong sign** (and the line search could not
   compensate, because the gradient's sign error made every step worse). Rewritten
   with `g = Σ(y − p)·z`, `H = Σ p(1−p)·zzᵀ`, a positive step and backtracking; the
   fit now converges in ~2 iterations and the Brier score improves.
3. **The isotonic artifact was stored in input order** — `apply()`'s interpolation
   then walked backwards through the knots. The map is now sorted by score with
   duplicate scores collapsed, and monotonicity is checked on the stored map.
4. **Per-class scores used the alarm flag as the forecast side**, so every class the
   model never predicted looked like a 100 % false-alarm rate. Now one-vs-rest on the
   predicted class.
5. **Near-miss buckets counted a district's entire history** (~2,000 entries per run,
   burying the signal). Now bounded to ±14 days and at most one entry per prediction
   per side.
6. **`state` paths outside the repository crashed the audit** (`relative_to` raises);
   the registry now prints an absolute path instead.
7. **The registry listed itself**, so the first write changed the document and the
   second did not. Self-output is excluded from the scan; a rebuild is byte-identical.

## 9. Open items and their blockers

| Item | Blocker | Owner action |
| --- | --- | --- |
| Fit the first calibration map | No observed-outcome dataset: the event archive is not loaded (empty store, no Postgres in this environment, no committed export) | Load the archive (`scripts/etl/README.md`) or provide an outcome export, then `mlops.cli calibrate` |
| POD/FAR/CSI for the live model | Same: evaluation currently reports `insufficient_truth` with counts | After the archive load, the nightly job produces them without further code |
| A true INT8 artifact | ADR 0007: converter incompatibility with `CONV_3D` | Architecture decision, not an MLOps task |
| Threshold semantics for alarms | Phase 3 scores at a stand-in `--alarm-threshold 0.5`; PRODUCT_SPEC §1.3's WATCH/WARNING/SEVERE levels belong to the Phase 4 alert engine | Phase 4 |
| Retraining on fresh data | Needs Earth Engine credentials and a frozen window | Quarterly checklist, human step by design |
| `docs/MODEL_CARD.md` §6.1's degenerate output | Unchanged by this phase — calibration cannot repair a collapsed classifier | Retrain (see `RETRAIN_AND_PROMOTION.md` §"What retraining cannot fix") |
