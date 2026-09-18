# Phase 9 — Validation and soft launch: what the pipeline can actually detect, measured

**Date:** 2026-09-18 · **Branch:** `arena/01a0afa0-hazardnet` · **Scope:** the phase the deployment
plan reserved for the two questions every earlier phase deferred — *does the pipeline detect the
hazards we know happened?* and *is anything here fit to put in front of a user?*

**Headline:** the hindcast exists, it runs in CI, and its numbers are recomputable from committed
inputs (`python -m hindcast.cli check`). Five episodes — **Amphan 2020, Yaas 2021, Cyclone Mocha
2023, the August 2024 eastern flash floods, the June 2025 monsoon floods** — were replayed through
the pipeline's independent physics track over real reanalysis drivers. Every one of the **50 named
affected districts reached the alarm list at both horizons (50/50)**, and the track named the class
that occurred for **13 of them** — all 13 in the 2024 flood episode, whose class score is
rainfall-driven. On the three cyclones it named **0 of 27**, because the ERA5 sustained 10 m wind at
a district centroid on Amphan's landfall day is **19–69 km/h** where the cyclone carried 130–155 km/h
ashore — and even the archive's gust field, which the corrected wiring now reads, only reaches the
alarm band on **2 of Amphan's 128** windows.
The first measured detection in the project's history is therefore also its most useful finding:
**the hindcast found a driver-fidelity problem, four saturated physics terms, and two
inseparable class pairs — not a skill number.**

Three of those findings were corrected on **2026-09-18**: the physics wiring now feeds each formula
the quantity it describes, and the two wind-damage classes read the gust (§4.2). The correction moved
the 2024 flood's class-strict score from 22 hits / 4 false alarms to **26 hits / 0 false alarms**, and
the before/after is published in every report and on `/model-performance`. What it did *not* fix is
stated with the same precision: `Fire` still tops 45–119 of 128 windows per episode (§4.3), the
rain/wind class pairs remain inseparable at district-point resolution (§4.4), and no threshold band
moves (§3.3).

Phase 9 is *not* complete: the calibration map is still unfit (no fitted map, so `WARNING` stays
unreachable), the tabletop exercise has not been run and cannot be run by a repository, and the
source archive — without which the calibration map and the district histories stay empty — is still
absent. §8–§10 say exactly what is left and who owns it.

---

## 1. What the phase had to produce

| Requirement (from the phase directive) | What it required | Before this phase |
| --- | --- | --- |
| Calibrate (Platt/isotonic) so `WARNING` is reachable | a fitted `Models/calibration/confidence_map.json`, and the engine's gate opened with it | `mlops/cli.py calibrate` and `apply-calibration` existed (Phase 3); the shipped map is deliberately unfit and two tests pin that, so `alert_engine` keeps `WARNING` unreachable |
| Hindcast the last two monsoon seasons + Amphan 2020 + Yaas 2021 | four replayable episodes with sourced district-level truth | nothing: no episode format, no driver source, no scorer, no report |
| POD / FAR / CSI and a lead-time distribution | an evaluation whose denominators are honest about what the truth set does and does not say | the Phase 3 harness (`mlops/evaluate.py`) could score *pairs*; nothing produced historical pairs |
| Tabletop exercise | a facilitated desk exercise with a written record | not run — this is an owner action (§9) |
| Soft launch as an experimental decision-support beta | a stated scope, and a gate that a claim of operational use cannot pass without evidence | the site publishes no skill number, on purpose (`PRODUCT_SPEC.md` §3) |
| Public metrics dashboard | the measured numbers on a page | `/status` + `freshness.json` exist (Phase 7); the *model* metrics page does not |

## 2. What was built

### 2.1 The harness — `scripts/hindcast/` (stdlib only, four modules)

| Module | What it owns | Load-bearing detail |
| --- | --- | --- |
| `episodes.py` | loads and validates a curated event | a district that does not resolve through `etl.districts`, a source id that is not cited, a class outside the model's eight, or a source without a URL and an access date are all **hard failures** — a typo cannot become a score |
| `fetch.py` | Open-Meteo's historical archive (ERA5/ERA5-Land era), batched 32 stations per request, cached | **six** daily variables, including *both* wind drivers (`wind_speed_10m_max`, `wind_gusts_10m_max`) — see §4.1 for why the second one is the phase's most consequential input change |
| `score.py` | window aggregation in the pipeline's units, then `physics_severity` over the eight classes | every row carries `score_source='physics_track'` and a note that **the CNN was not re-run**; plus the two diagnostics of §4 |
| `cli.py` | `list` / `run` / `check` | `check` rebuilds every committed report from its committed episode **and** committed driver series, offline and clock-blind, and fails on any disagreement. `--require-reports` makes a deleted report a failure rather than a pass |

The driver series and the reports are both **committed**. That is the design decision that makes
the rest auditable: `python -m hindcast.cli check` recomputes every published number without
network access or credentials, in CI (`.github/workflows/ci.yml`) and inside the producing
workflow (`.github/workflows/hindcast.yml`).

### 2.2 The five episodes (`data/hindcast/episodes/`)

| Episode | Class | Onset scored | Truth | Sources |
| --- | --- | --- | --- | --- |
| `amphan-2020` | Tropical Cyclone | 2020-05-20 | 14 districts (9 the HCTT plan names as most impacted + 5 the Sentinel-1 flood mapping adds) | 4 |
| `yaas-2021` | Tropical Cyclone | 2021-05-26 | 9 coastal districts, from the NAWG joint needs assessment district table | 2 |
| `eastern-flood-2024` | Flash Flood | 2024-08-24 | 13 districts — the 11 that the Red Crescent sitrep, WHO and the World Bank GRADE report agree on, plus 2 the NASA activation adds | 5 |
| `northeast-flood-2025` | Flood | 2025-06-01 | 10 districts, from the BDRCS *Situation Report 1 — Flood 2025* | 1 |

Three properties are recorded in the files themselves rather than left to the reader:

* **`completeness: "named-affected-only"` for all five.** The truth set names affected districts; it
  does not claim to have surveyed the other 55. `absence_means_no_event: false` follows, and so
  does the consequence: **the false-alarm ratio is not measurable** against this truth set, because
  there is no legitimate negative sample. The reports say that in words, and `far` is reported as
  measured-but-not-meaningful rather than quietly published as 1.0.
* **Onset provenance.** Yaas and Amphan use the landfall date; the 2024 flood uses 2024-08-24 (four
  days *inside* the event, stated with its reason — the harness scores the window before the date it
  is given, so an earlier onset would score windows that closed before the rivers rose); the 2025
  episode uses the situation report's own date and says so, because a guessed onset moves every
  window in the report.
* **The episodes are not independent samples.** The 2024 and 2025 events share six districts, and
  Amphan and Yaas overlap almost completely. **No aggregate "N of 4 events detected" figure is
  derived anywhere in this report**, exactly as `PRODUCT_SPEC.md` §3 requires of a claim that has
  not been earned.

### 2.3 The artifact

`data/hindcast/reports/<id>.json` — schema `hazardnet-hindcast-report/v1`, containing:

* `episode` — title, class, onset, **the episode file's SHA-256**, canonical affected list, sources;
* `what_was_hindcast` — `cnn_evaluated: false` with its reason, `drivers.is_forecast: false` with the
  "ceiling on detection, not skill" statement, `absence_means_no_event`, and a `how_to_read` block
  that explains the three detection numbers below;
* `evaluation` — the Phase 3 engine's output verbatim (status, scores, per-class one-vs-rest);
* `threshold_sensitivity` — the §1.3 WATCH (0.40) and WARNING (0.65) bands plus the harness default,
  each with its own hit/miss/false-alarm split;
* `detection` — the three counts of §3.1, per district and per horizon;
* `physics_diagnostics` — §4's saturation counts for the corrected wiring **and** the one it
  replaced, the corrected driver ranges, the two wind-driver scenarios with a generated `finding`
  sentence, and `detection_legacy` (the same detection counts under the pre-correction wiring);
* `per_district`, `alarmed_without_a_recorded_impact`, `counts`, `caveats`, `citations`.

## 3. Results

All numbers below are read from the committed reports (the four of `7db70fb`, plus `mocha-2023`
added under §8 item 9.7); `python -m hindcast.cli check --require-reports` reproduces every one of
them from the committed drivers.

### 3.1 Detection, under three explicit definitions

The engine's own metric is class-strict: an alarm counts as a hit only when the track *named* the
class that occurred. That is the right metric for a verification table and the wrong one for the
question a duty officer asks ("would I have seen this district at all?"). Publishing only one of
them would state either a false disaster or a false success, so the report carries three.

| Episode | Named districts | Flagged, any class | Named the episode's class | Episode class score over the 0.5 band |
| --- | --- | --- | --- | --- |
| `amphan-2020` (Tropical Cyclone) | 14 | **14 / 14** | 0 | 0 / 14 |
| `yaas-2021` (Tropical Cyclone) | 9 | **9 / 9** | 0 | 0 / 9 |
| `mocha-2023` (Tropical Cyclone) | 4 | **4 / 4** | 0 | 0 / 4 |
| `eastern-flood-2024` (Flash Flood) | 13 | **13 / 13** | **13** | 13 / 13 |
| `northeast-flood-2025` (Flood) | 10 | **10 / 10** | 0 | 10 / 10 |
| **all five** | **50** | **50 / 50** | **13** | 23 / 50 |

Same table by horizon: the any-class column is identical at 7 days and at 15 days in all five
episodes — nothing in this hindcast is a lead-time story, and `lead_time_days` is
`{min 7, max 15, mean 11.0, samples_with_lead_over_0 = all}` by construction rather than by skill.

### 3.2 POD / FAR / CSI, and what the denominators are

| Episode | Scored district-windows | Hits | Misses | False alarms | POD | FAR | CSI |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `amphan-2020` | 28 | 0 | 0 | 28 | — (no hit possible) | 1.0 | 0.0 |
| `yaas-2021` | 18 | 0 | 0 | 18 | — | 1.0 | 0.0 |
| `mocha-2023` | 8 | 0 | 0 | 8 | — | 1.0 | 0.0 |
| `eastern-flood-2024` | 26 | 26 | 0 | 0 | **1.0** | — (no negative sample) | — |
| `northeast-flood-2025` | 20 | 0 | 0 | 20 | — | 1.0 | 0.0 |

Four readings that a table alone would hide, each of which the report states:

1. **`misses: 0` everywhere, and `POD` is `None` on four episodes.** Every scored window carried an
   alarm, so there is no non-alarmed scored window to be a miss: POD is undefined, not zero. The
   project may not say "we missed no events" on this evidence.
2. **`FAR: 1.0` on the cyclones is not "every alarm was wrong."** It is the class-strict reading of
   27 alarms that were *called by another name*: all 14 Amphan districts were alarmed, under
   `Fire`. The class-agnostic count (14/14) sits beside it precisely so that a reader cannot take
   the 1.0 for a false-alarm rate.
3. **The 2024 flood is now scored 26 hits / 0 false alarms, and `FAR` is `None` for a structural
   reason.** Under the pre-correction wiring it read 22 hits / 4 false alarms (`FAR: 0.154`, the first
   measured false-alarm ratio this project ever computed); the corrected wiring names `Flash Flood` on
   all 26 scored windows, so no false alarm is possible — and with no negative sample left, `FAR` and
   `CSI` become uncomputable rather than 0. The report says that in place (`unmeasurable.reason`)
   instead of printing a perfect score. It is also the positive control that the scoring path can
   produce hits at all: `POD: 1.0` on 26 samples.
4. **The false-alarm denominator is still a boundary, not a sample.** 100–110 district-windows per
   episode were alarmed with **no outcome on record**; they are counted
   (`alarmed_without_a_recorded_impact.count`) and listed as UNKNOWN, never as false alarms. That
   number is the size of what this hindcast does not know, and it is why the site still cannot
   publish an accuracy claim.

### 3.3 The operating point does not move anything

| Threshold | Amphan | Yaas | 2024 flood | 2025 flood |
| --- | --- | --- | --- | --- |
| 0.40 (WATCH band) | 0 hits / 28 FA | 0 / 18 FA | 26 hits / 0 FA | 0 / 20 FA |
| 0.50 (harness default) | identical | identical | identical | identical |
| 0.65 (WARNING band) | identical | identical | identical | identical |

The three bands give byte-identical splits on all five episodes — before and after the wiring
correction. **Threshold tuning cannot fix what this hindcast found**, because the alarms are not
marginal: they are either far above the band, or the correct class is scoring 0.03–0.52 with the
cyclone windows a few hundredths under it. That is the single most important sentence for the Phase 9
calibration workstream, and it is why §4 is a wiring finding rather than a tuning recommendation.

## 4. What the hindcast found (four measured findings)

### 4.1 The wind driver, not the formula, decides whether a cyclone is detectable

The cyclone score is `0.7 · clip((gust − 50) / 150) + 0.3 · clip(rain / 300)`. On Amphan's landfall
day the daily maximum 10 m wind from the archive, at the district centroids the pipeline samples, is:

| | sustained `wind_speed_10m_max` | `wind_gusts_10m_max` |
| --- | --- | --- |
| Range across 64 districts, 2020-05-20 | **19.2 – 69.1 km/h** | 51.1 – 133.9 km/h |
| Cyclone class score, Amphan | 0.0136 – 0.2480 | 0.0987 – 0.5145 (**2 / 128** windows over the band) |
| Cyclone class score, Yaas | 0.0285 – 0.2457 | 0.0388 – 0.3166 (0 / 128) |

Amphan carried 130–155 km/h sustained to landfall. A district *centroid* is not the eyewall, and the
sustained field — the same `wind_speed_10m_max` the live pipeline originally fed the physics track
and the CNN's ERA5-Land band — therefore reports less than half of what the district experienced. The
gust field the same archive endpoint offers gets Amphan's coastal windows over the band and strokes
within 0.16 of it.

**Shipped 2026-09-18 (§4.6):** the two wind-damage classes read the gust. The sustained maximum is
still carried in every report as the pre-correction half of the comparison, and the 2024 and 2025
episodes are unaffected by the choice — their class scores are rainfall-dominated, so both driver
rows are byte-identical there, which is itself worth knowing before attributing anything to the
driver.

Two things the driver change does *not* fix: the track's top class is still `Fire` on 45–119 of 128
windows per episode, and the correct class is never the top pick on a cyclone — gusting to 185 km/h
makes `Severe Local Storm` (which saturates its wind term at 150 km/h) the pick, not the cyclone.

### 4.2 Four terms in the pre-correction wiring sat at their ceiling, three of them on every row

| Term | Formula as wired | Argument it received | Rows at ceiling, pre-correction |
| --- | --- | --- | --- |
| `fire_wind` | `(wind − 5) / 20` | the windiest afternoon's maximum, not the mean daily wind | 128/128 (2025) · 116/128 (Amphan) · 86/128 (Yaas) · 74/128 (Mocha) · 36/128 (2024) |
| `fire_drying` | `et_sum_mm / 6` | the **horizon total** ET (the divisor is a *daily* value; the formula's own default is 3 mm) | **128/128 in all five episodes** |
| `heat_persistence` | `duration_days / 5` | the horizon **length** (7 or 15 days), not an exceedance count | **128/128 in all five** |
| `cold_persistence` | `duration_days / 5` | the same | **128/128 in all five** |

The harness measured this and recomputed the same rows with the quantities the formulas describe
(mean daily ET, mean daily maximum wind, exceedance days), publishing both distributions beside each
other. The owner shipped that correction on 2026-09-18 (§4.6), so the numbers below are now the
before/after record carried in every report:

| Episode | Top class, corrected wiring | Top class, pre-correction wiring |
| --- | --- | --- |
| `amphan-2020` | Fire 92 / Flash Flood 30 / Drought 6 | Fire 127 / Flash Flood 1 |
| `eastern-flood-2024` | Flash Flood 78 / Fire 49 / Drought 1 | Fire 88 / Flash Flood 40 |
| `northeast-flood-2025` | Flash Flood 83 / Fire 45 | Fire 75 / Flash Flood 53 |
| `mocha-2023` | Fire 94 / Drought 30 / Flash Flood 2 / Heat Wave 2 | Fire 126 / Flash Flood 2 |
| `yaas-2021` | Fire 119 / Drought 5 / Flash Flood 4 | Fire 127 / Flash Flood 1 |

The wiring correction moves 9–127 windows per episode across a class boundary and turns the two flood
episodes' top class from `Fire` into the rain class that occurred. It does not remove the `Fire`
dominance, which is the next finding.

### 4.3 `Fire` still outranks a cyclone in Bangladesh in May — four times less often than before

`Fire` topped 127 of 128 windows in both cyclone episodes and 75–88 of 128 in the flood episodes
under the pre-correction wiring, at scores of 0.55–0.87, while the class that occurred scored
0.03–0.25. The cause was arithmetic rather than meteorological: coastal winds above the 25 km/h clip,
pre-monsoon temperatures around 33 °C and a saturating drying term put
`Fire = 0.4·h + 0.3·w + 0.3·d` at ≈0.5–0.6 on an ordinary May day in the coastal belt.

With the wiring corrected the dominance is reduced, not resolved: `Fire` is still the top class on
**119 of 128** Yaas windows, **94 of 128** Mocha windows, **92 of 128** Amphan windows and **45–49 of
128** in the two flood episodes — but `Drought` now rises to second place on the hot dry windows
(30 rows in Mocha, 6 in Amphan) and the rain classes lead both flood episodes. The residual is a
property of the formula, not the wiring: it is a temperate fire-weather rule, and in a coastal
pre-monsoon belt it is high everywhere, so it cannot discriminate anywhere. Fixing that means either
tropicalising its inputs or masking the class outside a fire season, and both change published values
in a way the harness cannot validate against a truth set it does not have. **Owner decision, §8
item 9.2b.**

### 4.4 The physics family cannot separate the pairs that share a driver

| Pair | Evidence |
| --- | --- |
| `Tropical Cyclone` vs `Severe Local Storm` | both are wind-driven; with the gust driver the cyclone reaches 0.51–0.85 while `Severe Local Storm` hits its 150 km/h ceiling at 1.0 and takes the top spot on 8 of the fixture's 12 windows and on the real coastal windows |
| `Flood` vs `Flash Flood` | both are rain-driven with almost the same inputs. The 2025 episode is scored as `Flood`; **10 of 10** districts crossed the band on the `Flood` score, and the track named `Flash Flood` (or `Fire`) on **all 128** windows — so the class-strict score is 0 hits, 20 false alarms, and the district-level detection is 10/10. The 2024 episode is the mirror image: the track names `Flash Flood` on all 26 scored windows, so it scores 26 hits and **loses** `FAR`/`CSI` to the absence of a negative sample. The pair is the same class differing by a duration the physics track does not measure, which is why one episode scores perfectly and the other scores zero on an identical formula. |

This is the finding the plan's "class fidelity" question was actually asking, and it now has numbers:
detection is *class-conditional*, and the physics family's four rain/wind classes are not
distinguishable at district-point resolution.

### 4.5 Cyclone Mocha 2023: the fifth data point, and the same two defects

The 2023 episode added under §8 item 9.7 is the set's first *eastern*-coast cyclone and its first
near-miss: Mocha's eye crossed into Myanmar while the Cox's Bazar coast took the outer wind field.
The result is consistent with the three earlier episodes rather than different from them, which is
the useful part:

* the four named districts (Cox's Bazar, Chattogram, Feni, Noakhali) were all flagged under some
  class, and **none under `Tropical Cyclone`** — the score range at district centroids is
  18.1–51.0 km/h sustained and 36.7–85.3 km/h gust, and **neither driver moves the cyclone class
  over the 0.5 band on any of the 128 rows**;
* `Fire` was the track's top class on **126 of 128** rows before the correction and is the top class
  on **94 of 128** after it, with `Drought` second on 30 — Mocha's outer bands crossed the coast on a
  real pre-monsoon drying window, which is also why the corrected fire drying term is the only one in
  the set that still saturates anywhere;
* three terms were at their ceiling on every row under the pre-correction wiring (`fire_drying`,
  `heat_persistence`, `cold_persistence`) and `fire_wind` on 74 of 128; after the correction the fire
  drying term still saturates on 24 of 128 rows — the one episode where the window's mean daily ET
  genuinely reaches the 6 mm divisor — which is what that term saturating *should* mean;
* `POD` is `None` and `FAR` is 1.0 for the same structural reason as the other two cyclones — the
  truth set names districts, and no dated outcome exists inside the prediction window.

In other words, adding a fourth vulnerability cycle and a third year did not produce a new finding:
it reproduced the two pipeline defects on an episode the harness had never seen, which is what a
validation episode is for.

### 4.6 The 2026-09-18 correction: what changed, where it is enforced, and what it left open

Items 9.2 and 9.3 of §8 were owner-gated because they change published values. The owner shipped
them in this workstream, on this harness's evidence, and the discipline that made the finding
auditable is the discipline that makes the correction auditable: the old wiring is still computed on
every row, so no number in this section depends on anyone's memory of what the code used to do.

| Change | From | To |
| --- | --- | --- |
| Fire drying term | the horizon **total** ET (`et_sum_mm`) | the window's **mean daily** ET (`et_mm_per_day`) |
| Fire wind term | the windiest afternoon (`wind_max_kmh`) | the **mean daily maximum** wind (`wind_mean_kmh`) |
| Cyclone + severe-storm wind | the sustained 10 m maximum | the **gust** maximum (`wind_gust_kmh`) |
| Heat/cold persistence | the horizon **length** | the count of days past **30 °C / 16 °C** |

**How the defect class is prevented now.** Not by a better scalar: by removing the aggregation from
the callers. `scripts/physics_severity.py::resolve_drivers` takes the observed daily series
(`daily_temp_max_c`, `daily_temp_min_c`, `daily_et0_mm`, `daily_wind_max_kmh`) and computes the mean
daily ET, the mean daily wind and the two exceedance counts itself, so a caller cannot pass the wrong
aggregate — it is not the one aggregating. Both live callers (`scripts/auto_forecast.py` and
`scripts/hindcast/score.py`) pass the series. The guards that remain (`_require_daily_et` rejects a
value only a horizon total could produce; `_require_exceedance_days` rejects a non-integer or a
duration) are the second line, not the first, and the report says so rather than implying a
magnitude check can tell a count from a length.

**What is enforced in CI.** `python -m hindcast.cli check --require-reports` recomputes all five
reports from the committed episodes and drivers and fails on a single differing value;
`node scripts/build_model_performance.mjs --check` fails if the published artifact no longer matches
those reports; `node scripts/build_content_engine.mjs --check` does the same for the page.
`__tests__/modelPerformance.test.js` asserts the before/after pairs reach the page. On the Python
side, `tests/test_physics_severity.py` pins the aggregation, the guards and the legacy saturation,
and `tests/test_hindcast.py` pins that the corrected fire score is never above the legacy one on any
row and that the legacy wiring still reproduces its ceiling.

**What the correction changed in the headline results.** The 2024 flood episode moved from 22 hits /
4 false alarms to **26 hits / 0 false alarms**, and the named-class total from 12 of 50 districts to
**13**. The cyclone episodes did not move: the gust driver puts 2 of Amphan's 128 windows over the
band, and a class that is over the band on 2 windows of 14 districts is not detection. Nothing about
the calibration conclusion changed — no threshold band moved.

**What it left open, with the same precision.** (a) `Fire` remains the top class on 45–119 of 128
windows per episode (§4.3) — a formula-shape question, not a wiring one. (b) The rain/wind class
pairs remain inseparable at district-point resolution (§4.4). (c) The bulletin and event ETLs ingest
prose wind speeds whose averaging the source may not state; those records now carry that fact in
their `severity_basis` rather than being silently converted to a gust
(`scripts/etl/bulletins.py`, §11). (d) Every number here is still a *ceiling on detection*: the
drivers are reanalysis, and the CNN was not re-run.

## 5. Calibration — still the blocker, and the hindcast says why

`mlops calibrate` exists (Phase 3, isotonic + Platt harnesses with tests) and
`Models/calibration/confidence_map.template.json` is refused by `CalibrationMap.validate`; two tests
pin that, and `alert_engine` keeps `WARNING` unreachable behind `warning_requires_calibration`.

**This hindcast does not and cannot produce the map.** A calibration map needs (prediction,
outcome) pairs with both positives and negatives; this truth set is a list of affected districts,
so every scored pair is a positive and the 100–110 unknown windows are unknown — not negatives. The
sequence that can produce it is now written down as owner **Action 13b**: load the event archive
(Action 12) → `mlops calibrate` → stamp `model_version` → re-run the hindcast (the reports then
carry a real `scores.calibration` block) → set the WARNING threshold in writing.

What the hindcast adds to that decision: **the threshold is not the binding constraint.** At 0.40,
0.50 and 0.65 the splits are identical, and the failures are class-naming failures, not
confidence-ordering failures. Calibrating before fixing §4 would produce a well-calibrated alert for
the wrong hazard.

## 6. Verification

| Check | Command | Result |
| --- | --- | --- |
| Reports recompute from committed inputs | `cd scripts && python -m hindcast.cli check --require-reports` | ✅ 5 reports, every number matches (also runs in `ci.yml`) |
| Harness unit tests | `python -m pytest scripts/tests/test_hindcast.py -q` | ✅ 25 passed |
| Physics-track tests | `python -m pytest scripts/tests/test_physics_severity.py -q` | ✅ 25 passed (the aggregation, the guards, the legacy saturation) |
| Whole script suite | `python -m pytest scripts/tests -q` | ✅ 539 passed, 1 skipped |
| Derived artifacts match their inputs | `node scripts/build_model_performance.mjs --check` · `node scripts/build_content_engine.mjs --check` | ✅ both exact |
| Producing workflow | `gh workflow run hindcast.yml -f episode=all` (and on push to the harness/episodes) | ✅ run `35286394326` — fetched 4 episodes' drivers, scored, checked, tested, committed |
| Network | none in the sandbox; the archive is reached from a GitHub runner | driver series committed so the science stays auditable offline |
| Branch CI (PR #29, run `35286726745`) | `ci.yml` | Backend, Frontend, Code Quality, Pipeline Scripts, Security Audit, TFLite smoke: ✅ · **E2E Tests: ❌** — a regression against a green `main` (`3a44545`), unattributed: the report artifact and job logs are not reachable from this sandbox and Playwright cannot run here. See `docs/PHASES_0-9_AUDIT.md` §5.1 |

The harness caught three of its own defects during this phase, all through the `check` gate or a
test rather than through review: a report whose `per_district` table disagreed with its inputs (a
name join with an unresolved side, which silently dropped two districts of the 2024 episode), an
`alarmed_without_a_recorded_impact` field that could only ever read `0` beside a count of 100
unknowns, and a fixture whose scripted 205 km/h *sustained* wind was tuned until the output looked
right. Each is now a test.

## 7. What is *not* claimed

* **No forecast skill.** The drivers are reanalysis — the weather that occurred. Every report says
  the number is a *ceiling on detection*, and that a lead-time hindcast needs archived forecast
  fields (ECMWF MARS/CDS), which is an owner credential.
* **No CNN evaluation.** `cnn_evaluated: false` in all five reports, with the reason: the tensor
  needs Sentinel-1/2, Landsat and ERA5-Land bands over Earth Engine for the historical window.
* **No false-alarm ratio.** See §3.2; the denominator does not exist yet.
* **No operational claim, and no accuracy claim on the site.** The Phase 8 content engine still
  fails any build that publishes a number nobody read from a committed artifact, and the validation
  page added below refuses the metric itself: `scripts/build_model_performance.mjs` fails the build
  if `accuracy`, `f1`, `precision`, `recall`, `frequency_bias`, `brier` or `log_loss` appears
  anywhere in the published artifact, and it refuses a report that claims `cnn_evaluated: true` or
  `drivers.is_forecast: true`.

## 8. Remaining work in this phase, with owners

| # | Item | Owner | Why it is not done here |
| --- | --- | --- | --- |
| 9.1 | ~~Publish the model-performance page~~ **done** — `/model-performance`, prerendered, generated from `data/hindcast/reports/*.json` via `frontend/public/data/model-performance.json` | shipped | see §8.1 for what it publishes and what it refuses |
| 9.2a | Fix the four saturated terms (§4.2) in `scripts/physics_severity.py` / `auto_forecast.py` | **done 2026-09-18** — see §4.6 | the corrected wiring ships; the pre-correction wiring is recomputed on every row as `legacy_*`, so the before/after stays measured. `python -m hindcast.cli check --require-reports` recomputes all five reports from the committed inputs |
| 9.2b | Address the residual `Fire` dominance (§4.3) — tropicalise its inputs or mask the class outside a fire season | pipeline owner | `Fire` is still the top class on 45–119 of 128 windows per episode. Both routes change published values in a way no truth set here can validate, and the formula is a temperate fire-weather rule being asked about a coastal pre-monsoon belt — an owner decision with the before/after in `physics_diagnostics` |
| 9.3 | Read the gust for the two wind-damage classes (§4.1) | **done 2026-09-18** — see §4.6 | the sustained maximum is still published beside it in every report's `wind_drivers` block, so the effect of the choice is on the record |
| 9.4 | Load the event archive, then fit and stamp the calibration map (Action 12 + 13b) | owner | needs the archive; 2,931 events is the model card's claim and nothing here restates it |
| 9.5 | Run the tabletop exercise and write its record into `docs/ops/owner-actions.md` (Action 13a) | owner + duty desk | a facilitated exercise with people; the script and pass criteria are written |
| 9.6 | Open the soft-launch beta gate (Action 13c) | owner | needs a stated scope and a named number owner; §10 lists the exact gate |
| 9.7 | A 2023 episode and a second cycle to break the overlap between 2024 and 2025 | **done** — `data/hindcast/episodes/mocha-2023.json` (Cyclone Mocha, Cox's Bazar coast, 14 May 2023) | the episode is committed and validated (`hindcast.cli list` shows it); its drivers and report are produced by `hindcast.yml`, which fetches from Open-Meteo — the sandbox has no route to that endpoint |

### 8.1 The metrics page — spec, and what shipped

**Spec.** `frontend/public/data/model-performance.json` generated from the committed reports by a new
`scripts/build_model_performance.mjs`, rendered as a prerendered route (the Phase 8 pattern: routes
in `frontend/src/content/generated-routes.json`, `--check` in CI, sitemap auto-derived), showing:
the four-episode detection table of §3.1, the POD/FAR/CSI table of §3.2 with the `None`s explained,
the threshold band comparison of §3.3, the driver comparison of §4.1, and the "what is not claimed"
list of §7 verbatim. It must **not** show a single headline accuracy percentage: the plan asked for
a metrics dashboard, and the honest dashboard for this system is the three-number one.

**Shipped.** All of the above, at `/model-performance` (75th generated route; in the built sitemap).

| Piece | Where | What it enforces |
| --- | --- | --- |
| The artifact | `frontend/public/data/model-performance.json` (`hazardnet-model-performance/v1`) | Every field is copied through an explicit allow-list, never spread; the document carries no clock (only the reports' own `generated_at` and their sha256), so rebuilding without a changed input is byte-identical and `--check` is exact |
| The builder | `scripts/build_model_performance.mjs` | Refuses an empty report directory, a mixed `hindcast_version`, a duplicate episode, `cnn_evaluated: true`, `drivers.is_forecast: true`, a report with no caveats or no citations, and any forbidden metric key in the output |
| The page | composed in `scripts/build_content_engine.mjs`; tables rendered by `ArticlePage`/`prerender.mjs`; route registered in `App.tsx`; `Dataset` node (`kind: hindcast-validation`) emitted by `src/lib/structuredData.js` | Every number on the page is read from the artifact; the framing copy is fixed text, and the reports' findings, caveats and reading notes are reproduced verbatim |
| The gate | `ci.yml` — `build_model_performance.mjs --check` beside the other derived-artifact gates, plus a Pipeline Scripts smoke test that asserts the refusals | A hand-edited artifact or a re-scored report fails CI before it reaches a deploy |
| The coupling | `hindcast.yml` now rebuilds and commits `model-performance.json`, `generated-routes.json` and `content-index.json` together with the reports it writes | A gate on a derived artifact is only honest if the workflow that changes the inputs also regenerates the outputs; without this step the bot's own commit would fail the gate it feeds |
| The tests | `__tests__/modelPerformance.test.js` (22 tests) | The artifact equals what the reports produce; `null` POD stays `null` and renders as `—`; no forbidden key; the route's tables match the artifact; the prerendered HTML carries the same numbers and the limits |

**What the page publishes:** the detection table (all five episodes), POD/FAR/CSI with the
uncomputable values explained in place, the 0.40/0.50/0.65 band comparison (15 rows), the
gust-versus-sustained wind comparison (10 rows) with each report's finding, the saturated-term table
with the **pre-correction counts beside the corrected ones** (10 rows), the wiring-correction table
(top class before and after, 5 rows), the 14 deduplicated caveats, the four reading notes, and the
truth-set citations. **What it does not publish:** any accuracy percentage — the words are absent and
the metric keys are structurally impossible.

## 9. Tabletop exercise

Not run, and it cannot be: it needs the duty desk, a facilitator and a written record. **Action 13a**
in `docs/ops/owner-actions.md` now contains the five-step script with pass criteria, built around
what the hindcast actually shows — including the step where the desk is shown the Amphan window, in
which every named district is alarmed and not one is flagged as a cyclone, and is asked what it
would publish. The site may not claim operational validation until that record exists.

## 10. The soft-launch gate, as it stands today

| Gate condition | State |
| --- | --- |
| A fitted calibration map, `WARNING` reachable | ❌ `Models/calibration/confidence_map.template.json` is deliberately unfit; `WARNING` is unreachable by design |
| A hindcast with published caveats | ✅ five episodes, CI-verified, recomputable offline |
| POD/FAR/CSI + lead-time distribution | ✅ computed; ❌ not publishable as a skill claim (see §3.2) |
| A written tabletop record | ❌ Action 13a |
| Public metrics dashboard | ✅ `/model-performance`, generated from the reports, CI-gated (§8.1) |
| A stated beta scope and a named owner of the numbers | ❌ Action 13c |
| Live deployment security headers (Phase 6 Action 7) | ❌ still owner-blocked; the probe stays red until then |

**Verdict:** the validation half of Phase 9 is evidenced and now *published* — the findings are no
longer only in a phase report but on a prerendered, CI-gated page that states its own limits. The
launch half remains owner-gated, and the honest recommendation is unchanged: publish the findings,
keep the operational framing closed until the calibration map, the tabletop and a named owner of
the numbers exist.

---

## Provenance

* **Harness, episodes, workflow:** commits `f5a86db`, `fc9dcdb`, `242cd92`, `181d07a`, `f3963d4`,
  `db047ac`, `7276314` on `arena/01a0afa0-hazardnet`; the four reports are the bot commits
  `49ed7e2`, `7c9a0b9`, `9d48b74`, `f648ab5`, `7db70fb`.
* **The published page (§8.1):** `scripts/build_model_performance.mjs`,
  `frontend/public/data/model-performance.json`, the `/model-performance` route in
  `frontend/src/content/generated-routes.json`, `__tests__/modelPerformance.test.js`, and the two
  CI gates in `.github/workflows/ci.yml`. The E2E failure that was still red when this report was
  first written is fixed in `e2cd663` and verified by run `35289414892` (all jobs green); the audit's
  §5.1 carries that evidence chain.
* **Drivers:** Open-Meteo historical archive (`archive-api.open-meteo.com/v1/archive`), ERA5/ERA5-Land
  era reanalysis, fetched by GitHub Actions (the sandbox has no route to the endpoint). Committed at
  `data/hindcast/drivers/`.
* **Truth sets:** the sources cited per episode in `data/hindcast/episodes/*.json` (OCHA/HCTT, NAWG,
  IFRC, BDRCS, WHO, NASA Disasters, VOA/MoDMR, World Bank GRADE), each with a URL and a 2026-09-18
  access date.
* **Attribution:** Master's Thesis of **Ashif Ahmed Shuvo** — https://github.com/myself-aas ·
  https://orcid.org/0009-0003-5734-1519 · https://www.linkedin.com/in/me-aas ·
  https://x.com/myself_aas · Supervisor **Dr. Ahmed Khairul Hasan** — https://bau.edu.bd/profile/AGRON1013 ·
  co-supervisor — https://csm.bau.edu.bd/teachers/CSM1007 · Department of Agrometeorology, BAU.
  MIT © 2026 Ashif Ahmed Shuvo.
