# TRD: HazardNet — Quality Assurance & Testing Requirements

Version 3.1 · Updated: 2026-09-29
Companion: `PRD.md`, `PUBLICATION_POLICY.md`

This document defines the testing and quality requirements for HazardNet's
**public surfaces** — the automated daily forecast pipeline, the 2000–2026
historical hazard intelligence archive, multilateral GLIDE ID linking, the website,
the API that serves published results, and operational transparency. It
intentionally excludes model internals, training procedures, evaluation
methodology, and dataset construction, all of which are research-private
(see `PUBLICATION_POLICY.md`).

---

## 1. Scope Boundaries

**In scope:**

- Automated daily pipeline (Kaggle notebook → GitHub Actions → frontend)
- CSV ingestion and field-mapping (advisory output → backend schema → UI)
- Historical hazard datasets (2000–2026, 3,062 events, 70 master disasters, 64-district vulnerability indices)
- Multilateral GLIDE ID validation and outbound URL resolution (ReliefWeb, FAO GIEWS, WHO Emergency, ADRC, IFRC GO)
- District-level and division-level geospatial mapping and vulnerability rank validation
- Interactive frontend visualization components (District Risk Choropleth Map, Vulnerability Matrix Table, Historical Hazard Catalog, Temporal Trend Graphs, Event Detail Modal)
- Public web application (landing, district map, alert archive, /validation, status page, blog, auth flows)
- API and backend — endpoints that serve forecast records, historical catalog, alerts, feedback
- Alert output correctness — published alerts display all expected fields
- Advisory tier display (SEVERE / WARNING / WATCH / NORMAL)
- Subscription and notification dispatch
- Accessibility, performance, internationalisation (বাংলা/English)
- SEO, structured data, and sitemap validity
- Security posture of the public surface

**Out of scope (research-private — see `PUBLICATION_POLICY.md`):**

- Model code, architecture, or inference implementation
- Dataset collection procedures or source composition
- Training pipelines, experiment records, or hyperparameters
- Evaluation methodology, split strategies, or benchmark sweeps
- Severity derivation logic or threshold calibration
- Any internal scoring, calibration, or fusion processes

**Standing rule:** no test scenario, fixture, or CI step may reference or
re-introduce research-private material.

---

## 2. Daily Pipeline Architecture

The end-to-end pipeline runs once per day with zero human intervention:

```
┌──────────────────────────────────────────────────────────────────────┐
│                        DAILY PIPELINE FLOW                          │
│                                                                      │
│  Kaggle Notebook (8-hazardnet-advisory)                             │
│       ↓  auto-run (daily schedule via Kaggle scheduling)            │
│  hazardnet_advisories_latest.csv                                    │
│       ↓  output artifact (64 districts × 2 horizons = 128 rows)    │
│                                                                      │
│  GitHub Actions (daily_advisory_ingest.yml)                         │
│       ├─ Fetch CSV from Kaggle output                               │
│       ├─ Validate schema + staleness (< 36h)                        │
│       ├─ Map advisory columns → backend ForecastRow schema          │
│       ├─ Write to backend/data/forecasts/ + manifest.json           │
│       ├─ Build static snapshot (forecasts-latest.json)              │
│       ├─ Ingest into Firestore forecast store                       │
│       └─ Deploy frontend bundle (Vercel)                            │
│                                                                      │
│  Frontend (Live)                                                     │
│       ├─ Firestore real-time listener (primary)                     │
│       └─ Static snapshot fallback (offline/degraded)                │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.1 Advisory CSV Schema (Kaggle Output)

The Kaggle notebook produces `hazardnet_advisories_latest.csv` with these
columns. All are required unless marked optional:

| Column | Type | Description |
| --- | --- | --- |
| `district` | string | Bangladesh district name (64 total) |
| `division` | string | Parent division (8 total) |
| `latitude` | float | District centroid latitude |
| `longitude` | float | District centroid longitude |
| `horizon` | enum | `7_days` or `15_days` |
| `hazard` | enum | One of 8 hazard classes |
| `confidence` | float [0,1] | Classification confidence |
| `cnn_severity_raw` | float [0,1] | Raw uncalibrated severity |
| `cnn_severity` | float [0,1] | Calibrated severity |
| `physics_severity` | float [0,1] | Physics-track severity |
| `final_severity` | float [0,1] | Fused final severity |
| `physics_override` | boolean | Whether physics overrode the model |
| `advisory_tier` | enum | `SEVERE` / `WARNING` / `WATCH` / `NORMAL` |
| `target_date` | ISO date | Forecast valid-for date |
| `generated_at` | ISO datetime | Pipeline execution timestamp |
| `om_max_temp_c` | float | Forecasted max temperature (°C) |
| `om_min_temp_c` | float | Forecasted min temperature (°C) |
| `om_precip_mm` | float | Forecasted cumulative precipitation (mm) |
| `om_wind_kmh` | float | Forecasted max wind speed (km/h) |
| `prob_top1` | float [0,1] | Top-1 class probability |
| `prob_top2` | float [0,1] | Top-2 class probability |
| `prob_top3` | float [0,1] | Top-3 class probability |

### 2.2 Column Mapping (Advisory CSV → Backend ForecastRow)

The ingestion step must map every advisory column to the backend schema that
the frontend consumes:

| Advisory CSV | Backend / ForecastRow | Notes |
| --- | --- | --- |
| `district` | `district_name` | |
| `division` | `division` | Direct pass-through |
| `latitude` | `latitude` | **NEW** — not in current schema |
| `longitude` | `longitude` | **NEW** — not in current schema |
| `horizon` | `horizon` | `7_days` or `15_days` |
| `hazard` | `hazard_type` | |
| `confidence` | `confidence` | |
| `cnn_severity_raw` | `model_severity_raw` | **NEW** — uncalibrated CNN output |
| `cnn_severity` | `model_severity` | Maps to existing field |
| `physics_severity` | `physics_severity` | |
| `final_severity` | `severity_score` | Main severity used in UI |
| `physics_override` | `physics_override` | **NEW** — boolean |
| `advisory_tier` | `advisory_tier` | **NEW** — SEVERE/WARNING/WATCH/NORMAL |
| `target_date` | `target_date` | |
| `generated_at` | `prediction_date` | Renamed |
| `om_max_temp_c` | `temperature_max` | |
| `om_min_temp_c` | `temperature_min` | |
| `om_precip_mm` | `precipitation_mm` | |
| `om_wind_kmh` | `wind_max_kmh` | |
| `prob_top1` | `prob_top1` | **NEW** — class probabilities |
| `prob_top2` | `prob_top2` | **NEW** |
| `prob_top3` | `prob_top3` | **NEW** |
| *(derived)* | `district_id` | Look up from district name |
| *(derived)* | `pcode` | Look up from district name |
| *(constant)* | `data_source` | `"Kaggle_Daily_Advisory"` |

### 2.3 Fields Currently Missing from Frontend

These fields are present in the Kaggle output but **not yet surfaced** in the
frontend `ForecastRow` type or UI components:

| Missing field | Required in UI | Display location |
| --- | --- | --- |
| `advisory_tier` | **Yes** | Alert cards, map markers, status strip, notifications |
| `physics_override` | **Yes** | Alert detail panel, transparency badge |
| `model_severity_raw` | Optional | Advanced detail panel (dual-track comparison) |
| `prob_top1/2/3` | Optional | Confidence breakdown chart |
| `latitude/longitude` | **Yes** | Map marker positioning (currently using static lookup) |
| `final_severity` | **Yes** | Primary severity displayed to user |

### 2.4 Historical Hazards Dataset Schemas & Contracts

The historical disaster datasets produced by notebook `1-HazardNet_BGD_climatic_hazards`
must conform to the following strict schemas:

#### 2.4.1 Cleaned Climatic Hazards Dataset (`BGD_climatic_hazards_dataset_2000_2026.csv`)

3,062 rows representing deduplicated meteorological hazard occurrences (2000–2026):

| Column | Type | Constraints / Description |
| --- | --- | --- |
| `Event_ID_Internal` | string | `Event_\d{4}` (e.g., `Event_0000`) |
| `GLIDE` | string | GLIDE format: `^[A-Z]{2}-\d{4}-\d{6}-BGD$` |
| `Date` | ISO date | `YYYY-MM-DD` between `2000-01-01` and `2026-12-31` |
| `District` | string | One of 64 recognized Bangladesh districts |
| `Latitude` | float | [20.5, 26.7] |
| `Longitude` | float | [88.0, 92.7] |
| `Hazard_Type` | enum | One of 8 classes: Cold Wave, Drought, Fire, Flash Flood, Flood, Heat Wave, Severe Local Storm, Tropical Cyclone |
| `GEE_Start` | ISO date | Temporal observation window start |
| `GEE_End` | ISO date | Temporal observation window end |
| `Severity_Index_Name` | string | Risk classification label (e.g., `MODERATE_RISK`, `HIGH_RISK`) |
| `Severity_Score` | float | Severity score [0.0, 1.0] |
| `Validated_Affected` | float | Documented affected population count (≥ 0.0) |
| `Full_Description` | string | Text summary / situation context |

#### 2.4.2 District Vulnerability Index (`hazardnet_district_vulnerability_index.csv`)

64 rows (one per district) sorted by composite vulnerability:

| Column | Type | Constraints / Description |
| --- | --- | --- |
| `District` | string | District name (exactly 64 distinct districts) |
| `Unique_Hazard_Types` | integer | Count of distinct hazard types recorded [1, 10] |
| `Total_Events` | integer | Total disaster occurrences (2000–2026) |
| `Avg_Severity` | float | Mean event severity score |
| `Cumulative_Affected` | float | Cumulative affected count |
| `Vulnerability_Score` | float | Composite normalized index [0.0, 1.0] (top: Bandarban/Cox's Bazar 0.992) |

#### 2.4.3 Hazard Type Analysis (`hazardnet_hazard_type_analysis.csv`)

Aggregated statistics across distinct hazard types:

| Column | Type | Constraints / Description |
| --- | --- | --- |
| `Hazard_Type` | enum | Hazard category name |
| `Event_Count` | integer | Number of recorded occurrences (e.g. Flood 890, TC 709, Storm 514) |
| `Mean_Severity` | float | Mean severity rating |
| `Std_Severity` | float | Standard deviation of severity |
| `Max_Severity` | float | Maximum observed severity |
| `Total_Affected` | float | Cumulative affected population |
| `Mean_Affected` | float | Mean affected population per event |
| `Max_Affected` | float | Maximum affected population in single event |

#### 2.4.4 Yearly Temporal Trends (`hazardnet_yearly_temporal_trends.csv`)

Annual frequency and impact trajectory (2000–2026):

| Column | Type | Constraints / Description |
| --- | --- | --- |
| `Year` | integer | Year between 2000 and 2026 |
| `Event_Frequency` | integer | Total disaster occurrences in year (e.g., 2007: 384, 2009: 261) |
| `Annual_Affected_Population` | float | Documented annual casualties / affected count |

#### 2.4.5 Master Aggregated Dataset (`HazardNet_Master_Dataset_Final.csv`)

70 aggregated disaster events with multilateral metadata:

| Column | Type | Description |
| --- | --- | --- |
| `Event_ID` | integer | Unique identifier |
| `GLIDE` | string | Official GLIDE identifier |
| `Date` | ISO date | Event initiation date |
| `Year` | integer | Calendar year |
| `Hazard_Type` | string | Hazard category |
| `Location_Districts` | string | Pipe-delimited list of impacted districts (e.g. `Cox's Bazar\|Chattogram\|Bandarban`) |
| `Full_Description` | string | Official disaster narrative & external citations |
| `IFRC_Severity` | string | IFRC severity rating (e.g., `Yellow`, `Orange`, `Red`) |
| `GDACS_Active_Alert` | integer | GDACS alert flag |

---

### 2.5 Multilateral GLIDE Link Resolution Algorithm & Schema

The frontend and backend use a deterministic URL generator for GLIDE identifiers:

```typescript
interface MultilateralGlideLinks {
  reliefweb: string;
  fao_giews: string;
  who_emergencies: string;
  adrc_registry: string;
  ifrc_go: string;
}

export function generateGlideLinks(glideId: string): MultilateralGlideLinks {
  if (!/^[A-Z]{2}-\d{4}-\d{6}-BGD$/.test(glideId)) {
    throw new Error(`Invalid GLIDE format: ${glideId}`);
  }
  return {
    reliefweb: `https://reliefweb.int/disaster/${encodeURIComponent(glideId)}`,
    fao_giews: `https://www.fao.org/giews/countrybrief/country.jsp?code=BGD`,
    who_emergencies: `https://extranet.who.int/public-emergencies`,
    adrc_registry: `https://www.glidenumber.net/glide/public/search/search.jsp?glide=${encodeURIComponent(glideId)}`,
    ifrc_go: `https://go.ifrc.org/emergencies?search=${encodeURIComponent(glideId)}`
  };
}
```

---

## 3. Test Strategy Overview

Testing is organised into four tiers:

| Tier | Scope | Runs on |
| --- | --- | --- |
| Pipeline | Daily advisory fetch, validation, ingestion, schema mapping | Daily cron (GitHub Actions) |
| Unit | Component-level frontend/backend logic, field mapping, input validation | Every commit |
| Integration | API contract conformance, auth flows, data consistency | Every merge to main |
| End-to-end | Full user journeys through the live site | Pre-deploy + nightly |

---

## 4. Tier 0 — Pipeline Tests (Daily Advisory Automation)

### 4.1 Kaggle Notebook Output Validation

```
Given  the Kaggle notebook (8-hazardnet-advisory) runs on schedule
When   the output CSV is fetched by GitHub Actions
Then   it has exactly 22 columns matching §2.1
  And  it contains 128 rows (64 districts × 2 horizons)
  And  every district in the 64-district list has exactly 2 rows
  And  generated_at is within the last 36 hours
  And  all float columns are parseable, non-NaN
  And  advisory_tier ∈ {SEVERE, WARNING, WATCH, NORMAL}
  And  hazard ∈ {Cold Wave, Drought, Fire, Flash Flood, Flood,
       Heat Wave, Severe Local Storm, Tropical Cyclone}
  And  horizon ∈ {7_days, 15_days}
```

### 4.2 Schema Mapping Correctness

```
Given  a valid advisory CSV row
When   the ingestion script maps it to ForecastRow
Then   every field in §2.2 is mapped correctly
  And  district_id is resolved from the district name lookup table
  And  severity_score = final_severity (not cnn_severity or physics_severity)
  And  advisory_tier is preserved verbatim (not re-derived on the backend)
  And  physics_override boolean is preserved
  And  data_source is set to "Kaggle_Daily_Advisory"
```

### 4.3 Staleness Guard

```
Given  the fetched CSV has generated_at > 36 hours ago
When   the ingestion workflow runs
Then   it halts with STALE_DATA error
  And  the previous day's data remains active (no blank-out)
  And  a staleness incident alert is sent to the ops channel
```

### 4.4 Manifest Integrity

```
Given  a successful ingestion
When   manifest.json is written
Then   it contains prediction_date matching the CSV's generated_at date
  And  row_count matches the CSV row count
  And  csv_sha256 matches the SHA-256 of the written CSV file
```

### 4.5 Static Snapshot Build

```
Given  a valid ingested CSV at backend/data/forecasts/
When   build_forecast_snapshot.mjs runs
Then   it emits frontend/public/data/forecasts-latest.json
  And  the JSON contains all rows from the CSV
  And  every row includes advisory_tier and physics_override
  And  the JSON is valid and parseable
```

### 4.6 Firestore Ingestion

```
Given  a valid CSV
When   ingest_forecast_csv.mjs runs with --mode=replace
Then   the forecast store is atomically replaced
  And  totalRows == validRows == 128
  And  duration < 30 seconds
  And  no validation errors are reported
```

### 4.7 Pipeline Failure Modes

| Failure | Expected behaviour |
| --- | --- |
| Kaggle notebook fails or times out | Workflow retries once; if still failed, sends alert, keeps previous data |
| CSV has 0 rows | Ingestion aborts, previous data preserved |
| CSV is missing columns | Schema validation fails, workflow stops |
| Firestore write fails | Static snapshot still updated; degraded-mode frontend works |
| GitHub Actions runner unavailable | Kaggle output sits until next run; staleness guard fires after 36h |

### 4.8 Historical Dataset Integrity & Static Bundling Tests

```
Given  the historical datasets from notebook 1 (1-HazardNet_BGD_climatic_hazards)
When   the historical bundling script (scripts/build_historical_catalog.mjs) runs
Then   BGD_climatic_hazards_dataset_2000_2026.csv contains exactly 3,062 rows
  And  all 64 Bangladesh districts are present in hazardnet_district_vulnerability_index.csv
  And  vulnerability scores are normalized within [0.0, 1.0] and sorted monotonically non-increasing
  And  every GLIDE ID in HazardNet_Master_Dataset_Final.csv matches ^[A-Z]{2}-\d{4}-\d{6}-BGD$
  And  all spatial coordinates satisfy Latitude ∈ [20.5, 26.7] and Longitude ∈ [88.0, 92.7]
  And  static JSON artifacts are emitted to frontend/public/data/historical/:
       - districts-vulnerability.json (64 districts)
       - temporal-trends.json (2000-2026 yearly frequencies)
       - hazard-distribution.json (proportions across 8 classes)
       - events-master.json (70 master GLIDE disaster events)
       - hazard-catalog-index.json (compact search index for 3,062 events)
  And  all emitted JSON files are valid and parseable
```

---

## 5. Tier 1 — Unit Tests

### 5.1 Frontend Components

- **Alert card rendering:** given a published alert record (district, hazard,
  advisory_tier, severity, confidence, target_date), the component renders
  all required fields without layout overflow on viewport widths 320px–1440px.
- **Advisory tier badge:** given each of SEVERE, WARNING, WATCH, NORMAL, the
  badge renders with the correct colour, icon, and accessible label.
- **Physics override indicator:** when `physics_override=true`, the card
  shows the transparency badge ("Physics-grounded").
- **Dual-track severity:** when both `model_severity` and `physics_severity`
  are present, the detail panel shows both values and the fused
  `severity_score`.
- **Language toggle:** switching between বাংলা and English replaces all visible
  strings; no untranslated tokens remain.
- **Status strip:** given a count of active alerts by tier, the strip
  displays "N SEVERE · M WARNING · K WATCH · L NORMAL" with correct
  arithmetic.
- **Freshness badge:** given a `generated_at` value, the badge shows the
  correct human-readable age string and shifts colour at the configured
  staleness threshold.
- **Confidence breakdown:** when `prob_top1/2/3` are present, the detail
  panel renders a stacked bar or list of the top-3 hazard probabilities.
- **Uncertain state:** when confidence < 0.40 (OOD threshold), the card
  displays the uncertainty message and does **not** display a single hazard
  name as fact.
- **District Risk Choropleth Map (`<DistrictRiskMap />`):** given 64 district
  vulnerability scores, renders all polygons with the correct color scale
  (normalized 0.0 to 1.0); hover displays tooltip with district name and
  vulnerability score; click fires the selected district callback.
- **District Vulnerability Matrix Table (`<DistrictVulnerabilityTable />`):**
  renders 64 rows; clicking header columns ("Score", "Events", "Rank") toggles
  ascending/descending sort; division filter dropdown correctly reduces the visible rows.
- **Historical Hazard Catalog Table (`<HistoricalHazardCatalog />`):** renders
  paginated records (default 20/page); instant text search filters by district,
  hazard type, or year; clicking GLIDE badge opens `<GlideResourcePopover>`.
- **Temporal Trends Chart (`<TemporalTrendChart />`):** renders Recharts bar/line
  chart spanning 2000–2026; tooltips display year, event frequency, and milestone
  annotations (e.g., 2007 Cyclone Sidr, 2017 Floods, 2024 Remal).
- **Multi-Hazard Distribution Chart (`<MultiHazardDistributionChart />`):**
  renders proportional breakdown across 8 classes; verifies percentage sum equals 100%.
- **Event Situation Report Modal (`<EventReportModal />`):** given an event from
  `HazardNet_Master_Dataset_Final.csv`, renders disaster narrative, validated affected
  count, GEE observation window, and multilateral action links.

### 5.2 Backend / API Utilities

- **Column mapper:** given a raw advisory CSV row object, the mapper
  produces a valid ForecastRow with all fields from §2.2.
- **District lookup:** given any of the 64 district names (including known
  aliases like Jessore/Jashore, Cumilla/Comilla), the lookup returns the
  correct `district_id` and `pcode`.
- **GLIDE link generator (`generateGlideLinks`):** given a valid GLIDE string
  (e.g., `FL-2026-000109-BGD`), returns valid URLs for ReliefWeb, FAO GIEWS,
  WHO Emergency, ADRC, and IFRC GO; invalid formats throw descriptive errors.
- **Historical catalog search utility:** filters 3,062 events by district, division,
  hazard type, and year range with latency < 50ms.
- **Input validation:** malformed district names, missing required fields, and
  out-of-range dates are rejected with appropriate error codes.
- **Rate-limit accounting:** the rate-limiter increments and resets correctly.
- **Auth token lifecycle:** expired, malformed, and missing tokens are rejected.

---

## 6. Tier 2 — Integration Tests

### 6.1 API Contract Tests

All endpoints documented in PRD §4.3 and §5.2 are tested for:

- **Happy path:** valid request → expected 200/201 response with correct schema.
- **New fields in response:** `GET /api/v1/forecasts/bulk` response rows
  include `advisory_tier`, `physics_override`, `latitude`, `longitude`.
- **Historical hazards query:** `GET /api/v1/historical/hazards?district=Sunamganj`
  returns 200 with matching events array and pagination metadata.
- **District vulnerability matrix:** `GET /api/v1/historical/vulnerability` returns
  all 64 districts sorted by vulnerability rank.
- **Temporal trends API:** `GET /api/v1/historical/trends` returns 2000–2026
  annual frequencies and multi-hazard distribution breakdown.
- **Event detail API:** `GET /api/v1/historical/events/:id` returns 200 with
  situation narrative and resolved multilateral links (ReliefWeb, FAO, WHO, ADRC, IFRC GO).
- **Auth enforcement:**
  - `POST /v1/alerts/{id}/review` without `reviewer` role → 403.
  - Unauthenticated requests to protected endpoints → 401.
- **State machine validity:**
  - Valid alert transitions (e.g., `DRAFT → PENDING_REVIEW → PUBLISHED`).
  - Invalid transitions are rejected with reason.
- **Feedback intake:** `POST /v1/feedback` with valid body → 201.

### 6.2 Data Consistency

- Published forecast records contain all required fields including the
  new advisory columns: `advisory_tier`, `physics_override`, `latitude`,
  `longitude`, `prob_top1`, `prob_top2`, `prob_top3`.
- The static snapshot (`forecasts-latest.json`) matches Firestore contents.
- Version identifiers on published forecasts are non-empty and match the
  deployment manifest.

### 6.3 Version Coupling

- API startup with mismatched artifact version identifiers → startup failure
  with explicit diff report.
- API startup with matched artifact versions → clean boot, health check passes.

### 6.4 Multilateral GLIDE Link Conformance

All 70 master events in `HazardNet_Master_Dataset_Final.csv` are verified against external resource linking contracts:
- **Format Integrity**: Every GLIDE ID strictly adheres to regex `^[A-Z]{2}-\d{4}-\d{6}-BGD$`.
- **ReliefWeb Resolution**: `https://reliefweb.int/disaster/${glide}` is syntactically well-formed; API query fallback is verified.
- **FAO GIEWS Integration**: Links correctly to Bangladesh Country Brief and resilience dossiers.
- **WHO Emergencies Integration**: Directs to public health surveillance for epidemic/outbreak/flood aftermath.
- **ADRC Registry**: `https://www.glidenumber.net/glide/public/search/search.jsp?glide=${glide}` correctly formats the query parameter.
- **IFRC GO Integration**: `https://go.ifrc.org/emergencies?search=${glide}` correctly searches active and historical DREF operations.

---

## 7. Tier 3 — End-to-End Tests

All E2E tests run in staging (Playwright), then smoke-tested post-deploy.

### 7.1 Daily Pipeline E2E

```
Given  a fresh advisory CSV from Kaggle (< 2 hours old)
When   the GitHub Actions daily workflow runs
Then   the CSV is fetched, validated, and ingested
  And  the static snapshot is rebuilt
  And  the Vercel deployment completes
  And  the live site shows the new prediction_date in the freshness badge
  And  total wall-clock time < 10 minutes
```

### 7.2 Alert Tier Display

```
Given  the advisory CSV contains rows with tiers SEVERE, WARNING, WATCH
When   the live map renders
Then   SEVERE districts show red markers
  And  WARNING districts show amber markers
  And  WATCH districts show yellow markers
  And  NORMAL districts show green markers
  And  the status strip totals match the CSV tier counts
```

### 7.3 District Detail Panel

```
Given  a user clicks on a district with a SEVERE Flash Flood advisory
When   the detail panel opens
Then   it displays:
       - district name and division
       - hazard type and advisory tier badge
       - fused severity score (final_severity)
       - confidence value
       - forecasted weather (max temp, precip, wind)
       - target date and generated_at timestamp
       - physics override indicator (if applicable)
  And  all fields are populated (no "undefined" or blank values)
```

### 7.4 HITL Review Enforcement

```
Given  an analyst WITHOUT the reviewer role
When   they attempt POST /v1/alerts/{id}/review
Then   the API returns 403 REVIEW_ROLE_REQUIRED
  And  an audit event is written
  And  no public page changes
```

### 7.5 Landing Page Performance

```
Given  2 active SEVERE alerts and 5 WARNING alerts
When   a visitor on a simulated Bangladesh 3G profile opens /
Then   LCP < 2.5s, total transfer < 500KB (excluding map tiles)
  And  the status strip shows correct tier counts
```

### 7.6 Offline / Degraded Mode

```
Given  the API is down
When   a visitor opens the landing page
Then   the static snapshot is served with all advisory tiers intact
  And  a staleness banner is shown with the snapshot's generated_at
```

### 7.7 Internationalisation

- Every public route renders in both বাংলা (`bn`) and English (`en`) with no
  untranslated tier strings.
- Advisory tier names are translated (e.g., SEVERE → গুরুতর).
- Disaster terminology matches the reviewed glossary.

### 7.8 SEO & Structured Data

- `sitemap.xml` returns valid XML including alert permalinks.
- `robots.txt` is consistent with sitemap.
- Structured-data validator passes on Organisation, Dataset, and FAQ blocks.

### 7.9 Historical Catalog Exploration & GLIDE External Outbound Flow

```
Given  a user navigates to /archive
When   they enter "Cyclone" in the search filter and select "Chattogram" division
Then   the table instantly filters to matching historical events
  And  clicking a GLIDE badge (e.g. TC-2024-000067-BGD) opens the <GlideResourcePopover>
  And  the popover displays verified external links to ReliefWeb, FAO, WHO, ADRC, and IFRC GO
  And  clicking an external link opens the authoritative agency source in a new tab with rel="noopener noreferrer"
  And  clicking "View Full Report" opens <EventReportModal> with narrative and GEE observation bounds
```

### 7.10 Interactive Choropleth Map & District Risk Profile Flow

```
Given  a user views the interactive district risk map on the landing or /archive page
When   the user hovers over a district polygon (e.g. Sunamganj)
Then   the tooltip displays "Sunamganj · Vulnerability Score: 0.898 · Top Threat: Flash Flood"
When   the user clicks on the district
Then   a detail drawer opens displaying:
       - 26-year total recorded events (54)
       - Unique hazard diversity count (9 hazard types)
       - Historical event timeline table sorted by date descending
       - Permalink link to /district/sunamganj
```

---

## 8. GitHub Actions Workflow Requirements

### 8.1 Daily Advisory Ingest Workflow

```yaml
# Required workflow: .github/workflows/daily_advisory_ingest.yml
name: Daily Advisory Ingest
on:
  schedule:
    - cron: '30 5 * * *'  # 05:30 UTC = ~11:30 BDT (after Kaggle run)
  workflow_dispatch: {}    # Manual trigger for recovery

# Steps (tested individually):
# 1. Fetch hazardnet_advisories_latest.csv from Kaggle output
# 2. Validate schema (22 columns, 128 rows, staleness < 36h)
# 3. Map columns to backend schema (§2.2)
# 4. Write to backend/data/forecasts/ + update manifest.json
# 5. Build static snapshot (node scripts/build_forecast_snapshot.mjs)
# 6. Ingest to Firestore (node scripts/ingest_forecast_csv.mjs)
# 7. Commit updated data files (if changed)
# 8. Trigger Vercel deployment
```

### 8.2 Secrets Required

| Secret | Purpose |
| --- | --- |
| `KAGGLE_USERNAME` | Kaggle API auth for fetching notebook output |
| `KAGGLE_KEY` | Kaggle API key |
| `FIREBASE_SERVICE_ACCOUNT` | Firestore ingestion |
| `VERCEL_TOKEN` | Trigger deployment |

### 8.3 Monitoring & Alerting

| Event | Alert channel |
| --- | --- |
| Pipeline success | Slack #hazardnet-ops (summary: row count, tier distribution) |
| Pipeline failure | Slack #hazardnet-ops + email to maintainers |
| Stale data (> 36h) | Slack #hazardnet-ops + staleness banner on site |
| Kaggle notebook failure | GitHub issue auto-created |

---

## 9. Performance & Security Requirements

### 9.1 Performance

| Metric | Target |
| --- | --- |
| Daily pipeline wall-clock (fetch → deploy) | < 10 min |
| Landing LCP (Bangladesh 3G) | < 2.5 s |
| Lite mode total transfer | < 50 KB |
| Alert list API p95 latency | < 300 ms |
| Concurrent public readers (load test) | 500, no 5xx, p95 < 300 ms |

### 9.2 Security

- OWASP top-10 baseline scan (ZAP) on staging — no critical findings.
- Content Security Policy evaluated; no `unsafe-inline`.
- Rate-limit probe: requests beyond threshold return 429.
- Auth token rotation test: old tokens rejected after rotation.
- HSTS, CORS allowlist, and `security.txt` present and correct.
- All mutating endpoints produce audit records.
- Kaggle API credentials stored as GitHub encrypted secrets only.

---

## 10. CI/CD Test Gates

```
PR             → Tier-1 unit + lint + a11y audit
merge to main  → Tier-2 integration (API contracts, auth, state machine)
deploy staging → Tier-3 E2E suite (Playwright) + performance smoke
promote prod   → manual gate: deployment manifest reviewed
daily cron     → Tier-0 pipeline (fetch, validate, ingest, deploy)
nightly        → E2E smoke + freshness check + status-page verification
```

---

## 11. Operational Verification

- `/validation` page is updated at the configured cadence and displays
  headline verification counts.
- `status.hazardnet.live` shows uptime and per-source data freshness.
- Freshness exceeding 36 hours triggers a staleness banner and incident alert.
- Daily pipeline success is logged with row count, tier distribution, and
  ingestion duration.

---

## 12. Test Data & Fixtures

- **Advisory fixtures:** synthetic CSV rows covering all 8 hazard classes,
  all 4 tiers, and the `physics_override=true` state.
- **District fixtures:** all 64 districts with known aliases.
- **Historical dataset fixtures:** sampled rows from `BGD_climatic_hazards_dataset_2000_2026.csv`
  and `HazardNet_Master_Dataset_Final.csv` verifying valid GLIDE regex formats,
  spatial coordinate bounds [20.5°-26.7°N, 88.0°-92.7°E], and multi-district pipes.
- **Vulnerability matrix fixtures:** sampled 64-district records validating
  `Vulnerability_Score` normalization [0.0, 1.0] and rank order.
- **Auth fixtures:** staging accounts for `public`, `analyst`, `reviewer`,
  and `admin` roles.
- **Performance fixtures:** pre-built static pages for degraded-mode testing.
- **Never in tests:** production alert data with real PII; production reviewer
  credentials; model checkpoints or inference artefacts.

---

## 13. Accessibility Requirements

- Lighthouse accessibility score ≥ 95 on all public routes.
- WCAG 2.2 AA compliance on all interactive elements.
- Screen-reader navigation tested on the alert page and district map.
- Colour contrast verified for all tier-colour combinations against both
  light and dark backgrounds.
- Advisory tier badges have distinct non-colour indicators (icons + labels).

---

## 14. Risks Specific to Testing

| Risk | Mitigation |
| --- | --- |
| Kaggle notebook times out (21-min run) | Retry once; alert if still failed; previous data preserved |
| Kaggle API rate limit | Exponential backoff in fetch step; manual dispatch as fallback |
| Advisory CSV column rename | Schema validation fails-fast; no partial ingest |
| District name mismatch (Kaggle vs backend) | Alias table with known variants (§5.2); test coverage for all 64 |
| Firestore quota exceeded | Static snapshot fallback ensures site never blanks |
| Notification dispatch flaky | Mock provider in CI; real-provider smoke only pre-launch |
| Bengali terminology drift | Glossary diff check in CI; native-speaker review pre-launch |
| Broken external multilateral links (FAO/WHO) | Offline mock validator in CI; live link health probe weekly |

---

## 15. Traceability to PRD Requirements

| PRD Req | Coverage |
| --- | --- |
| REQ-001 — Automated daily forecast publishing | §2, §4.1–§4.6, §7.1 |
| REQ-002 — Human-reviewed alerting | §7.4, §6.1 |
| REQ-003 — Provenance-first public surface | §7.3, §7.5, §7.6, §9.1 |
| REQ-004 — Advisory tier display | §2.1, §5.1, §7.2 |
| REQ-005 — Claims registry | CI gate (§10) |
| **REQ-006 — Historical hazard archive & scientific mapping** | **§2.4, §2.5, §4.8, §5.1, §5.2, §6.1, §6.4, §7.9, §7.10** |
| REQ-007 — Subscription & notification | §7.2 (dispatch leg) |
| REQ-008 — Operational transparency | §11 |
| REQ-009 — Feedback loop | §6.1 (feedback intake) |
| **REQ-010 — Daily automation** | **§2 (pipeline), §4 (pipeline tests), §8 (workflow)** |
| Security (PRD §5.5) | §9.2 |
| Performance (PRD §5.4) | §9.1 |
| Accessibility (PRD §5.6 / §13) | §13 |

> **Note:** Model training pipelines, internal feature extractors, and loss functions
> are research-private under `PUBLICATION_POLICY.md`. All public tests strictly exercise
> the automated ingestion pipeline, historical intelligence datasets, multilateral GLIDE
> verification, and user-facing presentation surfaces.
