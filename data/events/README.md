# `data/events/` — the historical hazard event archive (not redistributed here)

## What this directory is for

The content engine (`scripts/build_content_engine.mjs`) reads a **normalised event export** from
this directory at build time and publishes the two content surfaces that need history:

| Surface | Route | Built from |
| --- | --- | --- |
| District history sections | `/districts/:id` | the events whose `adm2_name` is that district |
| Annual season retrospectives | `/retrospectives`, `/retrospectives/:year` | the whole archive, grouped by year |

With no export present — the state of this repository — both surfaces say so in one sentence
("this deployment has no event archive loaded") and the retrospectives routes are not generated at
all. They never render a placeholder count. See `docs/ops/SEO_AND_CONTENT.md` §"Loading the event
archive".

## Why the file is not committed

`docs/MODEL_CARD.md` §4 quotes **2,931 events (2000–2025)** as the dataset behind the model's
historical prior. That archive is the thesis author's compilation of third-party records
(Kaggle/Colab working copy; sources named on `/data-sources`). It is **not redistributed by this
repository**:

- the sources it is assembled from carry their own attribution and redistribution terms;
- a stale copy committed here would silently outlive the pipeline and be quoted by the pages as
  current;
- the loader, not the page, is the thing that decides what is valid — publishing the raw rows
  would invite edits that bypass `scripts/etl/events.py`.

`.gitignore` therefore keeps `*.json` in this directory untracked. A deployment that has the
export — the owner's machine, a CI job with the artifact, a self-hoster — drops it here (or passes
`--events <path>`) and rebuilds; the pages then carry real counts, each one stating the archive it
came from and the drift against the 2,931 claim.

## Producing the export (three commands)

```bash
# 1. Validate + normalise the raw archive. Reports the drift against 2,931; never restates it.
python -m etl.cli events --input <raw-export.csv> --export-json data/events/hazardnet-events.json

# 2. Rebuild the content (district history + retrospectives). --check fails on drift.
node scripts/build_content_engine.mjs --events data/events/hazardnet-events.json

# 3. Rebuild the site (this runs step 2 with the default path anyway).
cd frontend && npm run build
```

The export schema is `hazardnet-events-export/v1` — the **normalised** rows (the same ones
`--emit-sql` loads into PostGIS), plus `claimed_total`, `ingested` and `drift` so a page can state
what it is comparing. It is written by `scripts/etl/cli.py`; do not hand-write it. A row the loader
would reject cannot reach a page, because the export is produced *after* validation.

## What the pages say when the archive is present

Every generated sentence is derived from the rows:

- the district count, the per-class breakdown, the years present and the most recent events with
  their sources (`/districts/:id`);
- the yearly totals and the fatality-coverage gap — "fatalities are recorded for N of M events;
  the rest are unknown rather than zero" (`/retrospectives/:year`);
- the drift line against the model card's claim, on both surfaces.

The counts are **event-district pairs**, not distinct physical events: a multi-district flood
appears once per district, which each retrospective states. A rise in a year's count can be a rise
in reporting rather than in hazard, and the pages say that too.
