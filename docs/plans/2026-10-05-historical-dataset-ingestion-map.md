# Historical hazard dataset — ingestion map (2026-10-05)

Maps the eight attached analysis CSVs onto the codebase: what each file is,
where it is (or is not) ingested today, the exact ingestion points, and where
the ingested fields surface in the API and UI. Written for the ingestion pass
that commits the sources and rebuilds the artifacts.

## 1 · The datasets and their roles

| File | Rows (contract) | Role |
|---|---|---|
| `BGD_climatic_hazards_dataset_2000_2026.csv` | 3,062 | Cleaned district-level event archive: id, GLIDE, date, district, lat/lon, hazard type, GEE window, severity index, validated affected, summary |
| `hazardnet_district_vulnerability_index.csv` | 64 | One row per district: unique hazard types, total events, avg severity, cumulative affected, vulnerability score |
| `HazardNet_Master_Dataset_Final.csv` | 70 | Curated master events: GLIDE, date/year, hazard type/class, pipe-delimited district list, narrative description, GEE window, IFRC severity, GDACS flag, validated affected |
| `hazardnet_yearly_temporal_trends.csv` | 2000–2026 | National trajectory: year, event frequency, annual affected population |
| `hazardnet_hazard_type_analysis.csv` | per hazard | Distribution: hazard type, count, mean/std/max severity, total affected |
| `hazardnet_general_summary_stats.csv` | headline | National baseline headline stats (PRD line 326) — **not ingested anywhere yet** |
| `hazardnet_statistical_correlations.csv` | pairs | Hazard/impact correlations — **not ingested anywhere yet** |
| `HazardNet_Events_For_GEE.csv` | master subset | Earth-Engine export (observation windows/footprints) — **referenced by PRD only, not ingested** |

## 2 · Existing pipeline (five of the eight files)

`scripts/build_historical_catalog.mjs` is the single ingestion point. It:

1. Locates sources via `locateSourceDirectory()`, checking in order:
   `manuscript/kaggle-notebooks/1-HazardNet_BGD_climatic_hazards/1-…`,
   `kaggle-notebooks/1-…`, `manuscript/kaggle-notebooks/1-…`,
   and finally **`backend/data/historical`**.
   The first three are git-ignored (`.gitignore` lines 104-105), so the only
   committable home is `backend/data/historical/` — currently absent; the
   committed artifacts were built on a machine that had the notebook export.
2. Parses each CSV positionally (`parseCsv`, quote/multiline-safe) and
   enforces row-count contracts (3,062 catalog rows; exactly 64 districts).
3. Emits five artifacts to `frontend/public/data/historical/` and mirrors to
   `dist/data/historical/` when a dist exists.

Column → artifact map (positional, 0-based):

- **vulnerability index** → `districts-vulnerability.json`: [0] district, [1] unique_hazard_types, [2] total_events, [3] avg_severity, [4] cumulative_affected, [5] vulnerability_score (re-ranked by score desc).
- **yearly trends** → `temporal-trends.json`: [0] year, [1] event_frequency, [2] annual_affected_population.
- **hazard type analysis** → `hazard-distribution.json`: [0] hazard_type, [1] event_count, [2..4] mean/std/max severity, [5] total_affected; percentage recomputed from the count sum.
- **master dataset** → `events-master.json`: [0] event_id, [1] **GLIDE**, [2] date, [3] year, [4] hazard_type, [5] hazard_class, [6] location_districts (`|`-split), [9] full_description, [10]/[11] gee_start/gee_end, [12] ifrc_severity, [14] gdacs_active_alert, [16] validated_affected; GLIDE runs through `generateGlideLinks()` (GLIDE_REGEX `^[A-Z]{2}-\d{4}-\d{6}-(BGD|[A-Z]{3})$`) to produce ReliefWeb / GLIDE ADRC / IFRC GO / FAO / WHO report links.
- **3,062-row archive** → `hazard-catalog-index.json`: [0] id, [1] glide, [2] date, [3] **district**, [4]/[5] lat/lon, [6] **hazard_type**, [7]/[8] GEE window, [9] severity index name, [10] severity_score, [11] validated_affected, [12] summary (200-char cap).

Derived artifact: `scripts/build_climatic_hazards_summary.mjs` builds
`frontend/public/data/climatic_hazards_summary.json` **from the committed
`events-master.json`** (not the raw CSV); `npm run check:events-summary`
fails CI if the artifact drifts from the committed catalog, so any master
CSV change must be followed by `npm run build:events-summary`.

## 3 · Where the artifacts surface

- API: `backend/routes/historical.js` — `/api/v1/historical/summary|vulnerability|trends|events|events/:id`; `backend/utils/glideResolver.js` resolves GLIDE → report links server-side.
- Client: `frontend/src/lib/eventsClient.ts`, `frontend/src/lib/glide.ts`.
- UI: `HistoricalHazardCatalog.tsx` (catalog browse + filters), `EventReportModal.tsx` (narrative, affected, GEE window, report links), `GlideResourcePopover.tsx` (branded external resource badges), `DistrictBriefBody.tsx` (district vulnerability + events), `DivisionDetailPage.tsx`, `HazardDetailPage.tsx`.

## 4 · Ingestion gaps for the three un-ingested files

1. `hazardnet_general_summary_stats.csv` — PRD line 326 promises national
   baseline headline stats. Ingest in `build_historical_catalog.mjs` as a
   sixth source → new `national-summary.json`; extend
   `/api/v1/historical/summary` to merge it; surface in the catalog header.
2. `hazardnet_statistical_correlations.csv` — new artifact
   `correlations.json`; surface as a compact matrix/rows section in
   `HistoricalHazardCatalog.tsx` (colour never the only carrier, role tokens).
3. `HazardNet_Events_For_GEE.csv` — export-oriented twin of the master rows
   (GEE windows/footprints). Commit under `backend/data/historical/` as the
   reproducible GEE hand-off; use it in the builder to **validate** the
   master's `gee_start/gee_end` columns (warn on drift) rather than shipping
   it to the client.

## 5 · Ingestion pass (next commit, needs the CSVs re-attached)

1. Commit the eight CSVs to `backend/data/historical/` (the only
   non-ignored `locateSourceDirectory()` candidate).
2. Run `node scripts/build_historical_catalog.mjs`; verify the logged row
   counts (3,062 / 64 / 70) and diff the five artifacts.
3. Run `npm run build:events-summary` to keep the summary artifact in sync.
4. Add the two new artifacts + API fields with tests; keep the honesty
   rules (no invented figures; unreadable source ⇒ explanatory sentence).
5. Gates: jest, `check:events-summary`, tokens/prose/design; build; preview.
