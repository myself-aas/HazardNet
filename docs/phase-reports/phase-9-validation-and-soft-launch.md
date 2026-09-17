# Phase 9 — Validation and soft launch: what the pipeline can actually detect, measured

**Date:** 2026-09-18 · **Branch:** `arena/01a0afa0-hazardnet` · **Scope:** the phase the deployment
plan reserved for the two questions every earlier phase deferred — *does the pipeline detect the
hazards we know happened?* and *is anything here fit to put in front of a user?*

**Headline:** the hindcast exists, it runs in CI, and its numbers are recomputable from committed
inputs (`python -m hindcast.cli check`). Four episodes — **Amphan 2020, Yaas 2021, the August 2024
eastern flash floods, the June 2025 monsoon floods** — were replayed through the pipeline's
independent physics track over real reanalysis drivers. Every one of the **46 named affected
districts reached the alarm list at both horizons (46/46)**, and the track named the class that
occurred for **12 of them** — all 12 in the 2024 flood episode, whose class score is rainfall-driven.
On the two cyclones it named **0 of 23**, because the ERA5 daily-maximum 10 m wind at a district
centroid on Amphan's landfall day is **44–69 km/h** where the cyclone carried 130–155 km/h ashore.
The first measured detection in the project's history is therefore also its most useful finding:
**the hindcast found a driver-fidelity problem, three saturated physics terms, and two
inseparable class pairs — not a skill number.**

Phase 9 is *not* complete: the calibration map is still unfit (no fitted map, so `WARNING` stays
unreachable), the tabletop exercise has not been run and cannot be run by a repository, and the
public metrics dashboard does not exist yet. §8–§10 say exactly what is left and who owns it.

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

### 2.2 The four episodes (`data/hindcast/episodes/`)

| Episode | Class | Onset scored | Truth | Sources |
| --- | --- | --- | --- | --- |
| `amphan-2020` | Tropical Cyclone | 2020-05-20 | 14 districts (9 the HCTT plan names as most impacted + 5 the Sentinel-1 flood mapping adds) | 4 |
| `yaas-2021` | Tropical Cyclone | 2021-05-26 | 9 coastal districts, from the NAWG joint needs assessment district table | 2 |
| `eastern-flood-2024` | Flash Flood | 2024-08-24 | 13 districts — the 11 that the Red Crescent sitrep, WHO and the World Bank GRADE report agree on, plus 2 the NASA activation adds | 5 |
| `northeast-flood-2025` | Flood | 2025-06-01 | 10 districts, from the BDRCS *Situation Report 1 — Flood 2025* | 1 |

Three properties are recorded in the files themselves rather than left to the reader:

* **`completeness: "named-affected-only"` for all four.** The truth set names affected districts; it
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
* `physics_diagnostics` — §4's saturation counts, the wiring counterfactual, and the wind-driver
  comparison with a generated `finding` sentence;
* `per_district`, `alarmed_without_a_recorded_impact`, `counts`, `caveats`, `citations`.

## 3. Results

All numbers below are read from the committed reports at `7db70fb`; `python -m hindcast.cli check
--require-reports` reproduces every one of them from the committed drivers.

### 3.1 Detection, under three explicit definitions

The engine's own metric is class-strict: an alarm counts as a hit only when the track *named* the
class that occurred. That is the right metric for a verification table and the wrong one for the
question a duty officer asks ("would I have seen this district at all?"). Publishing only one of
them would state either a false disaster or a false success, so the report carries three.

| Episode | Named districts | Flagged, any class | Named the episode's class | Episode class score over the 0.5 band |
| --- | --- | --- | --- | --- |
| `amphan-2020` (Tropical Cyclone) | 14 | **14 / 14** | 0 | 0 / 14 |
| `yaas-2021` (Tropical Cyclone) | 9 | **9 / 9** | 0 | 0 / 9 |
| `eastern-flood-2024` (Flash Flood) | 13 | **13 / 13** | **12** | 13 / 13 |
| `northeast-flood-2025` (Flood) | 10 | **10 / 10** | 0 | 10 / 10 |
| **all four** | **46** | **46 / 46** | **12** | 23 / 46 |

Same table by horizon: the any-class column is identical at 7 days and at 15 days in all four
episodes — nothing in this hindcast is a lead-time story, and `lead_time_days` is
`{min 7, max 15, mean 11.0, samples_with_lead_over_0 = all}` by construction rather than by skill.

### 3.2 POD / FAR / CSI, and what the denominators are

| Episode | Scored district-windows | Hits | Misses | False alarms | POD | FAR | CSI |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `amphan-2020` | 28 | 0 | 0 | 28 | — (no hit possible) | 1.0 | 0.0 |
| `yaas-2021` | 18 | 0 | 0 | 18 | — | 1.0 | 0.0 |
| `eastern-flood-2024` | 26 | 22 | 0 | 4 | **1.0** | **0.154** | **0.846** |
| `northeast-flood-2025` | 20 | 0 | 0 | 20 | — | 1.0 | 0.0 |

Four readings that a table alone would hide, each of which the report states:

1. **`misses: 0` everywhere, and `POD` is `None` on three episodes.** Every scored window carried an
   alarm, so there is no non-alarmed scored window to be a miss: POD is undefined, not zero. The
   project may not say "we missed no events" on this evidence.
2. **`FAR: 1.0` on the cyclones is not "every alarm was wrong."** It is the class-strict reading of
   23 alarms that were *called by another name*: all 14 Amphan districts were alarmed, under
   `Fire`. The class-agnostic count (14/14) sits beside it precisely so that a reader cannot take
   the 1.0 for a false-alarm rate.
3. **The 2024 flood's `FAR: 0.154` is a real, measured false-alarm ratio** — 4 of 26 scored windows
   were alarmed under a class other than the one that occurred — and the first one this project has
   ever been able to compute. It is also the only episode where the physics track did what it is
   supposed to do, so it doubles as the positive control that the scoring path can produce hits.
4. **The false-alarm denominator is still a boundary, not a sample.** 100–110 district-windows per
   episode were alarmed with **no outcome on record**; they are counted
   (`alarmed_without_a_recorded_impact.count`) and listed as UNKNOWN, never as false alarms. That
   number is the size of what this hindcast does not know, and it is why the site still cannot
   publish an accuracy claim.

### 3.3 The operating point does not move anything

| Threshold | Amphan | Yaas | 2024 flood | 2025 flood |
| --- | --- | --- | --- | --- |
| 0.40 (WATCH band) | 0 hits / 28 FA | 0 / 18 FA | 22 hits / 4 FA | 0 / 20 FA |
| 0.50 (harness default) | identical | identical | identical | identical |
| 0.65 (WARNING band) | identical | identical | identical | identical |

The three bands give byte-identical splits on all four episodes. **Threshold tuning cannot fix what
this hindcast found**, because the alarms are not marginal: they are either far above the band under
a saturated term, or the correct class is scoring 0.03–0.25. That is the single most important
sentence for the Phase 9 calibration workstream, and it is why §4 is a wiring finding rather than a
tuning recommendation.

## 4. What the hindcast found (four measured findings)

### 4.1 The wind driver, not the formula, decides whether a cyclone is detectable

The cyclone score is `0.7 · clip((wind − 50) / 150) + 0.3 · clip(rain / 300)`. On Amphan's landfall
day the daily maximum 10 m wind from the archive, at the district centroids the pipeline samples, is:

| | sustained `wind_speed_10m_max` | `wind_gusts_10m_max` |
| --- | --- | --- |
| Range across 64 districts, 2020-05-20 | **19.2 – 69.1 km/h** | 51.1 – 133.9 km/h |
| Cyclone class score, Amphan | 0.0136 – 0.2480 | 0.0987 – 0.5145 (**2 / 128** windows over the band) |
| Cyclone class score, Yaas | 0.0285 – 0.2457 | 0.0388 – 0.3166 (0 / 128) |

Amphan carried 130–155 km/h sustained to landfall. A district *centroid* is not the eyewall, and the
pipeline's own driver — the same `wind_speed_10m_max` its live runs feed the physics track and the
CNN's ERA5-Land band — therefore reports less than half of what the district experienced. The gust
field the same archive endpoint offers gets Amphan's coastal windows over the band and strokes
within 0.16 of it. **The harness fetched both rather than recommending one**, and the reports carry
the comparison with a generated finding sentence.

Two things this does *not* fix, both in the same block: the track's top class is still `Fire` for
127 of 128 windows under **either** driver, and the correct class is never the top pick — gusting to
185 km/h makes `Severe Local Storm` (which saturates its wind term at 150 km/h) the pick, not the
cyclone. The finding sentence says so.

### 4.2 Three terms in the shipped wiring are at their ceiling on every row

| Term | Formula as wired | Argument it receives | Rows at ceiling |
| --- | --- | --- | --- |
| `fire_wind` | `(wind − 5) / 20` | the daily max wind (≥ 25 km/h on a coastal afternoon) | 116/128 (Amphan), 128/128 (2025), 36/128 (2024) |
| `fire_drying` | `et_sum_mm / 6` | the **horizon total** ET (the divisor is a *daily* value; the formula's own default is 3 mm) | **128/128 in all four episodes** |
| `heat_persistence` | `duration_days / 5` | the horizon **length** (7 or 15 days), not an exceedance count | **128/128 in all four** |
| `cold_persistence` | `duration_days / 5` | the same | **128/128 in all four** |

Measured effect of correcting them (the *counterfactual*, recomputed by the harness with mean daily
ET and exceedance days — the shipped formulas are **not** changed here, because changing published
values is the pipeline owner's call with this evidence in hand):

| Episode | Top class, as shipped | Top class, counterfactual |
| --- | --- | --- |
| `amphan-2020` | Fire 127 / Flash Flood 1 | Fire 118 / Flash Flood 10 |
| `eastern-flood-2024` | Fire 88 / Flash Flood 40 | Fire 69 / Flash Flood 59 |
| `northeast-flood-2025` | Fire 75 / Flash Flood 53 | Fire 54 / Flash Flood 74 |
| `yaas-2021` | Fire 127 / Flash Flood 1 | Fire 127 / Flash Flood 1 |

The wiring fix moves 9–21 windows per episode across a class boundary. It does not remove the `Fire`
dominance, which is the next finding.

### 4.3 `Fire` outranks a cyclone, a flood and a monsoon onset in Bangladesh in May

`Fire` tops 127 of 128 windows in both cyclone episodes and 75–88 of 128 in the flood episodes, at
scores of 0.55–0.87 — while the class that occurred scores 0.03–0.25 (cyclones) or sits below `Fire`
despite a saturated rainfall term (floods). The cause is arithmetic rather than meteorological: with
coastal winds above the 25 km/h clip, pre-monsoon temperatures around 33 °C and a saturating drying
term, `Fire = 0.4·h + 0.3·w + 0.3·d` starts at ≈0.5–0.6 on an ordinary May day in the coastal belt.
A class that is high everywhere cannot discriminate anywhere — and because the physics summary
reports it as the track's "own pick", every downstream comparison inherits the noise.

### 4.4 The physics family cannot separate the pairs that share a driver

| Pair | Evidence |
| --- | --- |
| `Tropical Cyclone` vs `Severe Local Storm` | both are wind-driven; with the gust driver the cyclone reaches 0.51–0.85 while `Severe Local Storm` hits its 150 km/h ceiling at 1.0 and takes the top spot on 8 of the fixture's 12 windows and on the real coastal windows |
| `Flood` vs `Flash Flood` | both are rain-driven with almost the same inputs. The 2025 episode is scored as `Flood`; **10 of 10** districts crossed the band on the `Flood` score, and the track named `Flash Flood` (or `Fire`) on **all 128** windows — so the class-strict score is 0 hits, 20 false alarms, and the district-level detection is 10/10. The 2024 episode is the mirror image and gets 12/13. |

This is the finding the plan's "class fidelity" question was actually asking, and it now has numbers:
detection is *class-conditional*, and the physics family's four rain/wind classes are not
distinguishable at district-point resolution.

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
| Reports recompute from committed inputs | `cd scripts && python -m hindcast.cli check --require-reports` | ✅ 4 reports, every number matches (also runs in `ci.yml`) |
| Harness unit tests | `python -m pytest scripts/tests/test_hindcast.py -q` | ✅ 23 passed |
| Whole script suite | `python -m pytest scripts/tests -q` | ✅ 531 passed, 1 skipped |
| Producing workflow | `gh workflow run hindcast.yml -f episode=all` (and on push to the harness/episodes) | ✅ run `35286394326` — fetched 4 episodes' drivers, scored, checked, tested, committed |
| Network | none in the sandbox; the archive is reached from a GitHub runner | driver series committed so the science stays auditable offline |

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
* **No CNN evaluation.** `cnn_evaluated: false` in all four reports, with the reason: the tensor
  needs Sentinel-1/2, Landsat and ERA5-Land bands over Earth Engine for the historical window.
* **No false-alarm ratio.** See §3.2; the denominator does not exist yet.
* **No operational claim, and no accuracy claim on the site.** The Phase 8 content engine still
  fails any build that publishes a number nobody read from a committed artifact.

## 8. Remaining work in this phase, with owners

| # | Item | Owner | Why it is not done here |
| --- | --- | --- | --- |
| 9.1 | Publish the model-performance page (`/model-performance`, SSR, generated from `data/hindcast/reports/*.json` by the Phase 8 content engine) | code — next increment | scoped in §8.1; the numbers now exist, so it is a build task, not a research task |
| 9.2 | Fix the three saturated terms (§4.2) and the `Fire` dominance (§4.3) in `scripts/physics_severity.py` / `auto_forecast.py` | pipeline owner | changes published values; the measurement is in the reports and the counterfactual is already implemented and tested |
| 9.3 | Switch the wind driver (or add the gust as a second driver) in the live pipeline (§4.1) | pipeline owner | same reason; the evidence is the wind-driver block of every report |
| 9.4 | Load the event archive, then fit and stamp the calibration map (Action 12 + 13b) | owner | needs the archive; 2,931 events is the model card's claim and nothing here restates it |
| 9.5 | Run the tabletop exercise and write its record into `docs/ops/owner-actions.md` (Action 13a) | owner + duty desk | a facilitated exercise with people; the script and pass criteria are written |
| 9.6 | Open the soft-launch beta gate (Action 13c) | owner | needs a stated scope and a named number owner; §10 lists the exact gate |
| 9.7 | A 2023 monsoon episode (and any second cycle) to break the overlap between 2024 and 2025 | anyone | one JSON file plus a source list; the workflow picks it up automatically |

### 8.1 The metrics page, precisely

`frontend/public/data/model-performance.json` generated from the committed reports by a new
`scripts/build_model_performance.mjs`, rendered as a prerendered route (the Phase 8 pattern: routes
in `frontend/src/content/generated-routes.json`, `--check` in CI, sitemap auto-derived), showing:
the four-episode detection table of §3.1, the POD/FAR/CSI table of §3.2 with the `None`s explained,
the threshold band comparison of §3.3, the driver comparison of §4.1, and the "what is not claimed"
list of §7 verbatim. It must **not** show a single headline accuracy percentage: the plan asked for
a metrics dashboard, and the honest dashboard for this system is the three-number one.

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
| A hindcast with published caveats | ✅ four episodes, CI-verified, recomputable offline |
| POD/FAR/CSI + lead-time distribution | ✅ computed; ❌ not publishable as a skill claim (see §3.2) |
| A written tabletop record | ❌ Action 13a |
| Public metrics dashboard | ❌ §8.1 |
| A stated beta scope and a named owner of the numbers | ❌ Action 13c |
| Live deployment security headers (Phase 6 Action 7) | ❌ still owner-blocked; the probe stays red until then |

**Verdict:** the validation half of Phase 9 is now evidenced; the launch half is not, and the honest
recommendation is to publish the *findings* (they are the most valuable thing this repository has
produced) while keeping the operational framing closed.

---

## Provenance

* **Harness, episodes, workflow:** commits `f5a86db`, `fc9dcdb`, `242cd92`, `181d07a`, `f3963d4`,
  `db047ac`, `7276314` on `arena/01a0afa0-hazardnet`; the four reports are the bot commits
  `49ed7e2`, `7c9a0b9`, `9d48b74`, `f648ab5`, `7db70fb`.
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
