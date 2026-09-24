# HazardNet

**Multi-hazard early warning for Bangladesh agriculture.** HazardNet publishes dated
7- and 15-day hazard outlooks for all 64 districts of Bangladesh — eight hazard classes,
a severity value and a confidence score per district and forecast date, in two honestly
labelled severity tracks.

**Live site:** https://www.hazardnet.live

## What is public

This repository and the website publish **results and outputs only**:

- published forecast records (district, hazard class, severity, confidence, horizons,
  forecast date) and the snapshots that serve them
- published alert levels (at or below each class's configured ceiling) and run reports
- the validation scorecard (detection counts against five historical episodes — and the
  plain statement of what those numbers cannot support)
- the freshness/provenance record behind every number
- the web application that presents these results

## What is not public

The following are **research-private** and are deliberately not published here or on the
site (see `docs/PUBLICATION_POLICY.md`):

- model code and implementation details
- dataset collection procedures and source composition
- training procedures and experiment records
- benchmarking methodology and sweeps
- severity derivation

Trained model files in `Models/` are retained unadvertised; they are not part of the
published surface, and nothing in this repository offers them for download.

## Repository layout

| Path | Purpose |
| --- | --- |
| `frontend/` | The public web application (results surfaces, maps, blog, auth) |
| `api/` | Serverless API: stored forecast reads, alerts, chat assistant, weather widget |
| `backend/` | Self-host Express backend (same result-serving surfaces) |
| `Models/` | Trained artifacts (unadvertised — not part of the public surface) |
| `docs/` | Publication policy, ops runbooks, attribution |
| `scripts/` | Site build, result publishing and QA tooling only |

## Running the site locally

```bash
# 1. Install and run the frontend
cd frontend && npm install && npm run dev

# 2. (Optional) the self-host backend
cd .. && npm install && npm run dev
```

Build for production: `npm run build` at the repository root (or `cd frontend && npm run build`).

## Licence and citation

Source code: [MIT](LICENSE). If you use HazardNet outputs in academic work or an
operational product, please cite the repository (`CITATION.cff`).

HazardNet is a Master's thesis project, Department of Agrometeorology, Bangladesh
Agricultural University. It is **not** an official warning service: official warnings come
from the Bangladesh Meteorological Department and the Flood Forecasting and Warning
Centre. For emergencies, call 999.
