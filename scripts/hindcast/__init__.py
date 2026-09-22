#!/usr/bin/env python3
"""The Phase 9 hindcast harness: replay a historical event through the physics track.

WHY THIS EXISTS
---------------
`docs/PRODUCT_SPEC.md` §3 lists the claims that need evidence before the site may make
them — "Confidence 0.9 means 90 %", "we are improving", "this is early warning" — and
`docs/phase-reports/phase-8-seo-content.md` §5 records that Phase 8 could not measure any
of them. This package is the smallest honest thing that starts closing that gap: it takes
a *named, sourced* historical event (an episode), reconstructs the weather drivers for
every district over the forecast windows that preceded it, runs the **independent physics
cross-check** (`scripts/physics_severity.py`) over those drivers, and scores the result
with the Phase 3 harness (`scripts/mlops/evaluate.py`).

WHAT IT DELIBERATELY DOES NOT DO
--------------------------------
* **It does not run the CNN.** Rebuilding the t2 tensor needs Sentinel-1/2, Landsat and
  ERA5-Land bands over Earth Engine for 2020/2021 — an owner-credentialed job. The report
  says `cnn_evaluated: false` in as many words; a physics-track number must never be read
  as a model-skill number.
* **It does not treat an unrecorded district as clear.** The truth set is the districts
  the cited assessment names; unnamed districts are `unknown`, so the false-alarm ratio is
  reported as unmeasurable rather than as zero (the same rule `mlops.evaluate` enforces).
* **It does not call reanalysis a forecast.** The drivers come from Open-Meteo's historical
  archive (ERA5/ERA5-Land era), which knows the weather that occurred. That makes the
  detection number a *ceiling*, and the report prints that in its caveats.

HOW TO RUN IT
-------------
    cd scripts
    python -m hindcast.cli run --episode ../data/hindcast/episodes/amphan-2020.json \
        --out ../data/hindcast/reports/amphan-2020.json
    python -m hindcast.cli check            # offline; verifies committed reports vs episodes

`run` needs network access to the Open-Meteo archive API. `check` never does.
"""

HINDCAST_VERSION = '1.0.0'
EPISODE_SCHEMA = 'hazardnet-hindcast-episode/v1'
REPORT_SCHEMA = 'hazardnet-hindcast-report/v1'

__all__ = ['HINDCAST_VERSION', 'EPISODE_SCHEMA', 'REPORT_SCHEMA']
