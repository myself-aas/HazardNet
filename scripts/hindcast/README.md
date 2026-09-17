# `scripts/hindcast/` — the Phase 9 hindcast harness

`python -m hindcast.cli <command>` (run from `scripts/`, the same convention as
`python -m etl.cli` and `python -m mlops.cli`). Stdlib-only apart from the two sibling
packages it reuses: `physics_severity` for the scores and `mlops` for the evaluation.

| Command | What it does | Network |
| --- | --- | --- |
| `list` | Lists the committed episodes, their date, class, named-district count and whether a driver series is present | no |
| `run --episode P --out P [--refresh-drivers]` | Fetches (optionally) the driver series, scores the episode, writes the report | only with `--refresh-drivers` |
| `check [--require-reports]` | Rebuilds every committed report from its committed episode **and** committed driver series, and fails when they disagree | no |

## Why it exists

The deployment plan's Phase 9 asks a specific question — *did the pipeline detect the events
we know happened?* — and the site is not allowed to answer it from memory.
`docs/PRODUCT_SPEC.md` §3 lists the claims that need evidence ("Confidence 0.9 means 90 %",
"this is early warning", "we are improving"), and Phase 8 shipped without any of them. This
harness is the first half of the answer: it replays a named historical event through the
**independent physics track** and scores it with the Phase 3 evaluation harness, publishing
every input so the number can be re-derived rather than trusted.

## The four pieces

1. **Episodes** (`data/hindcast/episodes/*.json`, curated and reviewed). A dated event, a
   hazard class from the model's eight, and a truth set: the districts the cited assessments
   name as affected, each with the source id it came from. `scripts/hindcast/episodes.py`
   refuses a file that names a district outside the 64, a source id that is not cited, a
   hazard class the pipeline cannot emit, or a source without a URL and an access date.
2. **Drivers** (`data/hindcast/drivers/<episode>.json`, fetched by CI and committed). Daily
   reanalysis values per district centroid from Open-Meteo's historical archive
   (ERA5/ERA5-Land era) — five variables over the episode's longest window. Committed on
   purpose: `check` recomputes the report from this file, so the science is auditable offline.
3. **Scoring** (`scripts/hindcast/score.py`). Aggregates the window the way the live pipeline
   does (totals for precipitation and ET, extremes for temperature and wind), then runs
   `physics_severity.compute_physics_scores` over eight classes. **The CNN is not re-run** —
   its tensor needs Sentinel-1/2, Landsat and ERA5-Land bands over Earth Engine for the
   historical window — and every row, and the report, says so.
4. **The report** (`data/hindcast/reports/<episode>.json`) — the deliverable. Episode
   provenance (including the file hash), a `what_was_hindcast` block that states what was not
   done, the Phase 3 evaluation, a threshold-sensitivity table for the §1.3 bands, a
   per-district table, the detection counts under three explicit definitions, and the
   caveats.

## The three detection numbers, and why one is not enough

| Field | Question it answers |
| --- | --- |
| `detection.flagged_any_class` | Would a duty officer have seen this district at all? |
| `detection.flagged_episode_class` | Did the track name the class that actually occurred? |
| `detection.episode_class_over_threshold` | Did the score *for that class* cross the threshold, even if another class topped it? |

The engine's `events.far` is class-strict (a district flagged under a different class is a
false alarm there), so the report carries all three and explains the difference in
`what_was_hindcast.how_to_read`. A single "detection rate" would hide the difference between
*the pipeline saw nothing* and *the pipeline saw something and called it by the wrong name* —
and on the physics formulas those are very different failures.

## Running it

```bash
# Score everything (fetches drivers; used by .github/workflows/hindcast.yml)
cd scripts
for id in ../data/hindcast/episodes/*.json; do
  python -m hindcast.cli run --episode "$id" \
    --out "../data/hindcast/reports/$(basename "${id%.json}").json" --refresh-drivers
done

# Verify the committed reports (offline, deterministic — what CI runs)
python -m hindcast.cli check --require-reports

# The harness suite (offline; six scripted stations, no network)
python -m pytest tests/test_hindcast.py -q
```

## What it still cannot do

* **No CNN score.** Detection is the physics track's; model skill stays unmeasured until the
  Earth Engine tensor rebuild runs (Phase 9's remaining half).
* **No lead-time skill.** Reanalysis knows the weather that occurred in the window, so the
  number is a ceiling. A true lead-time hindcast needs archived forecast fields (ECMWF
  MARS/CDS) — a credential the owner holds, not the repository.
* **No false-alarm ratio** until the historical event archive is loaded (owner Action 12):
  the truth set names affected districts, and treating unnamed districts as clear would
  manufacture the very number the plan wants published.
* **No sub-district resolution.** The unit is the district, matching the pipeline.
