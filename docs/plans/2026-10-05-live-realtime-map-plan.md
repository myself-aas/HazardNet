# Live-map real-time plan — free, keyless-first, with fallback ladders

Date: 2026-10-05 · Status: PROPOSED (awaiting owner approval before implementation)
Scope: `/live` (LiveMapView) · Deployment target: Vercel · Branch: `arena/01a1045f-hazardnet`

Knowledge base: the full `DATA_SOURCES.md` of `bilawalsidhu/gods-eye-view` (47.5k-star
real-time globe) was read end to end on 2026-10-05. Every architecture pattern below is
taken from or measured against that document; sources that project uses are credited inline.
Nothing in this plan reuses GEV code (MIT) — the reuse is architectural, which is what the
document actually teaches.

---

## 0. What GEV's DATA_SOURCES.md teaches (the rules this plan inherits)

1. **Live sources vs bundled snapshots.** Live data is fetched at runtime and never committed;
   bundled snapshots ship for out-of-the-box resilience and always carry their own license.
2. **Keyless first.** The best layers need no key at all: NOAA Open Data on AWS, ECMWF Open
   Data, NASA GIBS, USGS, OpenFreeMap, Esri World Imagery's classic endpoint, Photon,
   Open-Meteo. Keys are a last resort (NASA FIRMS free MAP_KEY) or user-supplied (BYOK).
3. **Proxies exist for CORS, budgets and caching — not for storage.** Server-side fetch with
   singleflight, bounded bodies, deadlines, short TTLs, and serve-stale-on-outage.
4. **Fallback ladders are explicit and labelled.** Primary → alternate provider → last good
   (labelled "as of …") → bundled snapshot (labelled "snapshot …") → distinct unavailable
   state. Empty, partial, stale and unavailable are four different UI states, never collapsed.
5. **Nothing invented.** A layer either has a source behind it or it does not exist. Forecasts
   are labelled forecasts; observations are labelled observations; "latest" is never presented
   as zero-delay. (This repository already enforced this discipline by deleting its fake radar.)
6. **Attribution is a first-class feature.** One expandable "Data attribution" lightbox; each
   layer registers its credit when it activates; required credits stay visible in all modes.
7. **Fair-use mechanics.** Rate limits, concurrency budgets, byte-range reads (fetch only the
   GRIB fields you need), per-key dedupe, conditional requests, viewport-bounded reads,
   identifying User-Agent, no bulk downloads, no tile persistence (OSM lesson, 2026-10-05).

---

## 1. Hard constraints carried into every step

- **OSM tile policy (osm.wiki/Tile_usage_policy):** no tile pre-fetching, no tile persistence,
  no service-worker interception of cross-origin tiles, ever. Payload JSON may be cached with
  labelled staleness; tiles may not. This cost us an IP block once; it is a standing rule.
- **Vercel Hobby budget:** 12 serverless functions max; 6 are used (`api/[endpoint].js`,
  `api/chat/[action].js`, `api/v1/[resource].js`, `api/v1/alerts/[action].js`,
  `api/v1/weather/batch.js`, `api/v1/forecasts/[action].js`). This plan adds at most 2.
- **No fabricated data.** Repo rule: every number and glyph on the map must trace to a source.
- **Claims registry:** any metric-shaped number in copy must be registered in `docs/CLAIMS.md`.
- **Bundle budget:** `npm run check:bundle` gates every phase; heavy renderers must be
  route-lazy chunks.
- **Design gates:** 44px targets, no glass chrome on HUD, dark theme via `hn-tile-*` hooks,
  low-bandwidth mode collapses optional layers.

---

## 2. Source inventory — free for HazardNet's Bangladesh hazard mission

| # | Source | Serves | License | Key? | Fetch mode | Attribution |
|---|--------|--------|---------|------|------------|-------------|
| S1 | NASA GIBS WMTS (`gibs.earthdata.nasa.gov`) | MODIS Terra/Aqua + VIIRS true colour, GPM IMERG rain rate, VIIRS thermal anomalies | US public domain | No | Browser-direct (CORS `*`), bounded concurrency | NASA GIBS/ESDIS acknowledgement line |
| S2 | NOAA GFS on AWS (`noaa-gfs-bdp-pds.s3.amazonaws.com`) | 10 m wind, 2 m temp, MSLP — 0.25°, 6-hourly | US public domain (NOAA) | No | Server proxy: `.idx` + byte-range GRIB2 | "NOAA Global Forecast System (GFS)" (courtesy) |
| S3 | ECMWF Open Data (`data.ecmwf.int/forecasts`) | Same fields, alternate model | CC BY 4.0 + ECMWF terms | No | Server proxy: JSONL inventory + byte-range | "based on ECMWF data/products" + CC BY link + modification + disclaimer |
| S4 | USGS earthquake feeds (`earthquake.usgs.gov`) | Real-time quakes GeoJSON | US public domain | No | Browser-direct (CORS `*`) | "Data courtesy of the U.S. Geological Survey" |
| S5 | Open-Meteo (`api.open-meteo.com`, flood API) | Point weather now/16-day; GloFAS river discharge | CC BY 4.0 (non-commercial free) | No | Browser-direct (CORS `*`) | Linked "Weather data by Open-Meteo.com" |
| S6 | NASA FIRMS (`firms.modaps.eosdis.nasa.gov`) | Active-fire CSV (VIIRS ×3 + MODIS) | CC0 / public domain | Free MAP_KEY | Server proxy, bbox-clamped | FIRMS acknowledgement line |
| S7 | Esri World Imagery (classic ArcGIS endpoint) | Satellite basemap | Esri Master Agreement: public-facing use with attribution, keyless at this endpoint | No | Browser tiles (on demand, HTTP cache only) | "Powered by Esri — Source: Esri, Maxar, Earthstar Geographics" |
| S8 | OpenTopoMap | Current street/topo basemap | OSM data; style CC-BY-SA | No | Browser tiles | OSM contributors + OpenTopoMap |
| S9 | OpenFreeMap (vector, future) | Street basemap upgrade path | OSM ODbL; keyless, unlimited | No | Requires MapLibre — deferred | OpenFreeMap © OpenMapTiles © OSM |
| S10 | Photon (komoot) → Nominatim | District/place fly-to search | ODbL data; fair use | No | Server proxy, 1 rps queue | "Photon (komoot)" / OSM |
| S11 | IMD RSMC New Delhi (UNVERIFIED) | Bay of Bengal cyclone advisories | Gov. public information | No | Only if a stable endpoint is proven in Phase I | "India Meteorological Department" |

Explicitly rejected (with reasons), so future work does not re-litigate them:
- **tile.openstreetmap.org** — IP-blocked for this deployment; block persists (2026-10-05).
- **OpenSky / adsb.lol / AISStream / CelesTrak / transit feeds / CCTV packs** — GEV's flagship
  layers, but irrelevant to Bangladesh hazards and several are non-commercial-only.
- **Google 3D Tiles, TomTom, Cesium ion** — keys + billing; violates "completely free".
- **NHC/CPHC cyclone feed** — Atlantic/east Pacific only; does not cover the Bay of Bengal.
- **nowCOAST radar/satellite/lightning** — US coverage only.

---

## 3. The fallback ladder (one pattern, every layer)

```
L0 LIVE       bounded fetch — deadline (12 s), body cap, concurrency cap, singleflight,
              identifying UA where the source asks for one
L1 ALTERNATE  same-role provider swap (GFS↔ECMWF · GIBS↔FIRMS · Photon↔Nominatim)
L2 LAST-GOOD  previous valid response, served with a visible "as of HH:MM UTC" chip
              (payload JSON only — never tiles; TTL matched to source cadence)
L3 SNAPSHOT   repo-bundled static fallback (GEV "bundled snapshots" pattern) with a
              visible "snapshot <date>" label — only for layers where a static truth exists
L4 UNAVAILABLE distinct, honest empty state — never synthetic, never silent
```

Rules of the ladder:
- Every state change is visible in the layer row's freshness chip: `LIVE 12:40Z` /
  `STALE as of 09:10Z` / `SNAPSHOT 2026-09-16` / `UNAVAILABLE`.
- Falling down the ladder never invents data; falling back up requires a fresh L0 success.
- Tile layers (S1, S7, S8) skip L2/L3 by policy — tiles show or show the layer's unavailable
  state; the browser HTTP cache is the only tile cache (OSM rule §1).
- Payload JSON caching reuses the existing service-worker pattern for `/api/v1/alerts`:
  network-first, labelled stale fallback (`X-HazardNet-Stale`), no silent stale reads.

---

## 4. Architecture

```
Browser (Leaflet)
 ├─ tile layers (S1 GIBS WMTS, S7 Esri, S8 OpenTopoMap)   → direct, HTTP cache only
 ├─ payload layers (S4 USGS, S5 Open-Meteo)                → direct (CORS *)
 ├─ proxied layers (S2/S3 wind, S6 fires, S10 search, S11 cyclones)
 │        │
 │        ▼
 │   api/v1/live/[source].js          ← ONE new serverless function, action-routed
 │        │   singleflight · 12 s deadline · body caps · TTL cache · serve-stale
 │        ▼
 │   NOAA S3 · ECMWF · FIRMS · Photon/Nominatim · IMD (if proven)
 └─ attribution registry (dataCredits.ts) → expandable panel, per-active-layer credits
```

- **One** new function `api/v1/live/[source].js` (route-param dispatch: `wind`, `fires`,
  `cyclones`, `geocode`) keeps the Vercel budget at 7/12 with room for a future
  `api/v1/live/wind-worker` split if GRIB decode gets heavy. Second function reserved, not built.
- All proxy responses carry `Source`, `X-Data-Time`, `X-Fallback: live|alternate|stale` headers;
  the UI renders chips from them — the ladder is observable, not assumed.
- No new npm runtime dependency except a GRIB decoder (ecCodes-WASM, ~1 MB, worker-lazy) if
  Phase E chooses raw GRIB; the pre-resampled-JSON alternative (below) avoids even that.

---

## 5. Step-by-step implementation

Each phase lists: what, sources + fallback chain, integration point, acceptance criteria.
Phases are ordered by value-per-risk; every phase ends with full gates + CI green + preview check.

### Phase A — Foundation: attribution registry, layer framework, freshness chips
*No external sources. Everything later plugs into this.*

1. `frontend/src/lib/dataCredits.ts`: registry — `registerCredit(layerId, {html, license})`,
   `activeCredits()`; GEV's `dataCredits.js` + `creditDisplay.addStaticCredit` pattern translated
   to React.
2. Layers panel (`LiveMapView` `isLayerModalOpen` sheet) grows grouped sections — **Ground**
   (basemaps), **Weather & satellite**, **Hazards** — one row per layer: icon, name, On/Off
   44px pill, and a freshness chip slot. Attribution lightbox opens from the panel footer:
   "Data attribution (n)" listing every active source credit with licence links.
3. `frontend/src/lib/liveLayers.ts`: declarative layer table — id, name, ladder config
   (provider list, TTL, caps), credit, legend, defaults (enabled/low-bandwidth behaviour).
   Every later phase is a row in this table plus a renderer; the UI, caching, and attribution
   come for free from the framework.
4. Contract test `frontend/src/lib/__tests__/liveLayersContracts.test.ts`: every declared layer
   has a credit + legend + ladder; no layer renders without a source id.

**Accept:** panel renders grouped rows with chips; attribution lightbox lists OSM/Topo credits;
tests pin the registry shape. No network calls yet.

### Phase B — Satellite basemap toggle (S7)
*First "high-quality visual" win; zero backend.*

1. Add `esriSatellite` to `MAP_LAYERS` (`server.arcgisonline.com/ArcGIS/rest/services/
   World_Imagery/MapServer/tile/{z}/{y}/{x}`, maxZoom 18) + attribution line verbatim from §2.
   The dark-theme hook `.hn-tile-esriSatellite` already exists in `styles/dark.css` (it survived
   the earlier provider purge) — verify its filter suits imagery.
2. Basemap row in the Ground section: Street/Topo (current) ⇄ Satellite radio pair (still "one
   ground at a time"; this is a toggle, not a picker-of-six — MapToolbar contract stands).
3. **Fallback chain:** tile `tileerror` threshold (e.g. >40% of a view's tiles failing twice) →
   auto-return to OpenTopoMap + toast "Satellite imagery unavailable — showing street map"; the
   reverse toggle is always available manually. No retry storms: back off 60 s before re-trying Esri.
4. Esri terms note in the audit ledger: classic endpoint is keyless-with-attribution; if traffic
   grows, review ArcGIS Location Platform terms (GEV carries the same caveat).

**Accept:** toggle switches ground with attribution swap; error-injection test (mocked
tileerror) proves the auto-fallback and the toast; dark mode verified.

### Phase C — True-colour satellite imagery (S1 GIBS, browser-direct)
*The single most dramatic honest visual: what Bangladesh looked like this morning.*

1. WMTS layer on `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/`:
   - `MODIS_Terra_CorrectedReflectance_TrueColor` (~4 h after acquisition, bands 250 m–1 km)
   - `VIIRS_SNPP_CorrectedReflectance_TrueColor` (daily, 375 m) as the sharper alternate.
   Time dimension: date control `today → yesterday → 2 days ago` (GIBS best-layer latency means
   "today" resolves to the newest available date — the UI says "newest available", never "live").
2. Concurrency governor: max 6 in-flight GIBS requests (GEV's cap), queue the rest; paused when
   the layer is off or tab hidden. Layer opacity slider 0–100, default 80.
3. **Fallback chain (L1/L4):** Terra unavailable → VIIRS SNPP same-date; both failing → layer
   chip `UNAVAILABLE` + "why" tooltip (GIBS status link). **Never** reproject or invent frames.
4. Low-bandwidth mode: layer hidden by default, toggle still available (labelled "heavy").
5. Attribution credit registered while active: the NASA GIBS/ESDIS acknowledgement sentence from
   GEV's doc, verbatim pattern.

**Accept:** imagery renders for the newest available date; date control steps back 2 days;
concurrency cap proven by a fetch-spy test; attribution appears only while active.

### Phase D — Rain rate: GPM IMERG (S1 GIBS)
*Directly serves Flash Flood / Monsoon Flood — the two wettest hazard classes in the app.*

1. GIBS `IMERG_Precipitation_Rate` (~30-min cadence, 0.1°, ~2–4 h latency) as an overlay with a
   calibrated colour ramp + legend in mm/h; legend explains "near-real-time estimate, not gauge
   data" (GEV's meaning-discipline: state what the product is and is not).
2. Time control: newest 6 frames replay (GIBS time steps) with the advertised observation time
   displayed separately from "now" — GEV's exact pattern.
3. **Fallback chain:** IMERG tile failure → chip `UNAVAILABLE` (no L2 for tiles by policy) and
   the DistrictForecastCard's precipitation row (Phase H) becomes the rain story instead.
4. Claim wording registered if any cadence numbers appear in reader copy (claims gate).

**Accept:** rain ramp visible over Bangladesh with correct legend; replay steps frames;
unavailable state reachable via mocked failure.

### Phase E — Animated wind: GFS ⇄ ECMWF (S2/S3, one proxy)
*Cyclone-season centrepiece; the only phase needing GRIB plumbing.*

1. `api/v1/live/[source].js` action `wind`:
   - Inputs: `?model=gfs|ecmwf&bbox=84,17,95,29&grid=1.0` (Bangladesh + Bay of Bengal box only —
     viewport-bounded like GEV, never global bulk).
   - GFS path: list latest 0.25° cycle, read `.idx`, byte-range fetch only `UGRD`/`VGRD` at 10 m;
     ECMWF path: JSONL inventory, byte-range `10u`/`10v` from the latest 0.25° run.
   - Decode with ecCodes-WASM in the function, resample to 1° grid, return manifest +
     Float32 U/V (base64) + model issue time + valid time. Body cap 2 MB, deadline 12 s,
     singleflight per (model, cycle), memory cache 60 min, serve-stale up to 6 h with
     `X-Fallback: stale`.
   - Simpler alternative if WASM-in-serverless proves flaky on Vercel: pre-decode in a scheduled
     GitHub Action every 6 h and commit/publish the small resampled JSON (GEV's bundled-snapshot
     idea applied to derived data) — then the function just serves the latest artifact. Decision
     point E.1, resolved before coding.
2. Renderer: Leaflet canvas overlay, GPU-friendly particle advection (≤1,800 particles on
   desktop, ≤600 on coarse pointers; `prefers-reduced-motion` and low-bandwidth collapse it to a
   static quiver plot). Curves bake through the sampled field; animation is flow through ONE
   forecast — it does not advance forecast time (GEV's wording, adopted).
3. **Fallback chain:** GFS → ECMWF → last-good JSON ("as of" chip) → static quiver from bundled
   climatology? NO — no bundled wind exists, so L4 unavailable. Model picker shows which model is
   live and its cycle time; a forecast is labelled a forecast.
4. Attribution: GFS courtesy line or the full ECMWF CC BY block (licence link + modification +
   disclaimer) depending on which model is serving — credits follow the ladder.

**Accept:** particles animate from live model data; model swap works; kill-switch proves every
ladder rung; bundle gate green (renderer lazy-loaded).

### Phase F — Fire hotspots: GIBS thermal ⇄ FIRMS (S1/S6)
*Dry-season hazard (Cold Wave months) + crop-residue burning visibility.*

1. Primary keyless: GIBS `VIIRS_SNPP_Thermal_Anomalies` + `VIIRS_NOAA20_Thermal_Anomalies`
   (day/night variants) as a time-stepped overlay, newest available granule times labelled.
2. Enriched key: free `FIRMS_MAP_KEY` → proxy action `fires` merges NOAA-20/21 + Suomi-NPP + MODIS
   CSV for the trailing 24 h, clamped to the Bangladesh+margin bbox, 30-min cache (GEV's exact
   quota-respect pattern), marker cluster coloured by confidence, popup shows FRP + time + source
   satellite + link to the FIRMS map page.
3. **Fallback chain:** FIRMS proxy failing/over-quota → GIBS-only mode (chip says so) → L4.
   Key unset in an environment → GIBS-only by design; the layer never requires the key.
4. Attribution: NASA FIRMS acknowledgement verbatim + GIBS/ESDIS line.

**Accept:** hotspots appear with honest per-point metadata; quota cache proven in proxy tests;
both keyless and keyed modes work.

### Phase G — Earthquakes: USGS (S4, browser-direct) — trivial, ship early
*The easiest live win; could even move ahead of C/D if the owner wants quick momentum.*

1. `all_day.geojson` (poll 5 min, browser-direct) filtered to mag ≥ 3.5 within Bangladesh +
   400 km margin; markers sized/coloured by magnitude; popup: mag, depth, place, time-ago,
   link to the USGS event page. Optional `all_week` context layer at low zoom.
2. **Fallback chain:** fetch fail → last-good in `sessionStorage` ("as of" chip, 24 h max) →
   hidden row state. Public domain; courtesy credit registered.
3. Meaning discipline in the legend: "reported seismic events, not a hazard forecast".

**Accept:** recent regional quakes render with live metadata; offline-sessionStorage rung tested.

### Phase H — District card point weather + river discharge (S5 Open-Meteo)
*Deepens the existing DistrictForecastCard; the layer-to-place payoff.*

1. On district select: Open-Meteo current + hourly (temp, rain, wind, gusts) + 16-day summary for
   the district centroid; card gains a "Current conditions" block with the required linked credit
   "Weather data by Open-Meteo.com" (CC BY 4.0 adjacent-link rule).
2. Flood season: Open-Meteo **Flood API (GloFAS)** daily river-discharge forecast for the nearest
   grid cell → sparkline in the card with "river discharge forecast (GloFAS)" label; commercial
   caveat documented (free for non-commercial with attribution — HazardNet's current posture).
3. **Fallback chain:** Open-Meteo failing → card keeps its stored forecast baseline with the
   existing `baseline` label (UI-01/UX-12 pattern already in the codebase) → never blend the two.
   Distinct states: `live` / `baseline`, as today.
4. 0.1° coordinate rounding + 5-min client cache (GEV's cache-cell trick) to stay a polite client.

**Accept:** selected district shows live conditions + discharge sparkline; baseline fallback
proven; attribution link present and correct.

### Phase I — Bay of Bengal cyclone advisories (S11, CONDITIONAL)
*Highest value in cyclone season; highest source risk. Gate before building.*

1. **Gate I.0 (research spike, max half a day):** verify a stable, machine-readable IMD RSMC
   New Delhi advisory endpoint for BoB systems (position, intensity, forecast track). NHC/CPHC —
   the only advisory feed GEV documents — does not cover this basin. If no reliable free
   endpoint exists: Phase I ships as **"cyclone context"**: GFS/ECMWF wind + IMERG rain + a link
   to the official IMD page, and the decision is written in the audit ledger. No synthetic tracks,
   no hand-plotted "forecast" cones (repo rule).
2. If an endpoint is proven: proxy action `cyclones`, 15-min singleflight cache, serve-stale
   3 h, bounded geometry; renders official track points + uncertainty wording ("cone means track
   uncertainty, not storm size" — GEV's sentence applies verbatim to any cone ever drawn).
3. Attribution: India Meteorological Department; advisory issue time and position time displayed
   separately (GEV discipline).

**Accept:** either the conditional layer with proven data, or the documented honest downgrade —
both count as success for this phase.

### Phase J — Search fly-to (S10)
1. Search box in the toolbar gains geocoding: Photon (komoot) keyless fair-use first, Nominatim
   second (1 rps queue, identifying UA, 5-min cache, singleflight — all from GEV's `/api/geocode`
   spec), results constrained to Bangladesh by a country filter.
2. District-name matches hit the app's own 64-district index first (offline, instant) — external
   geocoding only for places the index lacks.
3. **Fallback chain:** local index → Photon → Nominatim → "place not found" state.

**Accept:** upazila/city search flies to the right place with the correct credit active.

---

## 6. Visual & feature quality bar (applies to every phase)

- Legends: every data layer gets a legend with units, cadence, latency and a "what this is not"
  line (GEV meaning-discipline). Legends live in the layer row expansion, not in modals.
- Freshness chip grammar: `LIVE <UTC time>` / `NRT ~<lag>` / `STALE as of <time>` /
  `SNAPSHOT <date>` / `UNAVAILABLE` — one vocabulary, all layers.
- Time controls wherever the source has a Time dimension (GIBS layers): newest-first, max 3 days
  back, advertised observation time always shown.
- Dark mode: imagery layers neutral (no inversion); data ramps reuse `MAP_HEAT_RAMP`-style keyed
  palette entries — new ramp colours are palette additions with tests, never inline hex.
- Low-bandwidth (`data-low-bandwidth`): satellite imagery, particles, and fire overlay default
  OFF; the layer table declares each layer's class.
- Mobile: all new rows 44px; the sheet scrolls; chip row wraps; no element under 12px.
- Accessibility: every toggle `aria-pressed`, every chip has text (never colour-only), imagery
  layers expose `aria-label` with the advertised time.

---

## 7. Testing & gates per phase

- Unit: proxy actions tested against mocked upstreams (deadline, body cap, singleflight,
  serve-stale header, negative cache) — same harness style as `__tests__/serviceWorker.test.js`.
- Contracts: `liveLayersContracts` (registry completeness), per-layer attribution-presence tests,
  freshness-chip vocabulary test.
- Honesty: a standing test asserts no layer renders without a source id, and no "live" label may
  appear on a path that can only serve snapshots (guards against the fake-radar class of error).
- Gates: `npm test` (1,755+ green), `check:design`, `check:prose`, `check:claims` for any new
  reader-facing numbers, `check:bundle`, eslint ≤ cap.
- CI: all 7 jobs; preview smoke on `/live` after merge.

---

## 8. Rollout order & effort

| Order | Phase | Backend needed | Risk | Why here |
|-------|-------|----------------|------|----------|
| 1 | A foundation | none | low | everything plugs into it |
| 2 | B satellite basemap | none | low | instant visual upgrade, Esri keyless |
| 3 | G earthquakes | none (direct) | trivial | easiest live-data win |
| 4 | C true-colour | none (direct) | low | flagship visual |
| 5 | D IMERG rain | none (direct) | low | core hazard relevance |
| 6 | F fires | 0–1 key | low-med | GIBS works keyless anyway |
| 7 | E wind | 1 function | medium | GRIB plumbing; decision E.1 first |
| 8 | H district weather | none (direct) | low | deepens existing card |
| 9 | J search | 1 action in same fn | low | polish |
| 10 | I cyclones | conditional | high | gated on I.0 research spike |

Net new serverless functions: **1** (`api/v1/live/[source].js`) → budget 7/12.
Everything else is browser-direct against CORS-open public endpoints.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| NASA GIBS "no bulk use" clause | concurrency cap 6, viewport-bounded, no pre-fetch, no persistence; honour tile TTLs |
| Esri classic endpoint terms at scale | attribution now; audit note to review ArcGIS Location Platform terms if traffic grows (same caveat GEV carries) |
| Open-Meteo commercial clause | attribution link always rendered; commercial-use decision belongs to the owner before any monetisation |
| FIRMS_MAP_KEY quota | 30-min proxy cache, bbox clamp; keyless GIBS thermal is the floor |
| ecCodes-WASM on Vercel serverless | decision point E.1; scheduled pre-decode artifact path avoids it entirely |
| IMD endpoint instability (Phase I) | gate I.0 before any build; honest downgrade is an accepted outcome |
| Tile-policy regression | standing contract test: no code path may persist or pre-fetch tiles; SW pass-through preserved |
| Bundle growth | renderer chunks lazy; check:bundle every phase |

---

## 10. Open decisions for the owner

1. **Decision E.1:** WASM-in-serverless vs scheduled pre-decoded artifacts for wind (Phase E).
2. **Phase I scope:** accept the conditional design (research spike first; honest downgrade is
   success)?
3. **OpenFreeMap vector street basemap** (S9) as a later upgrade once MapLibre integration is
   accepted — it would replace OpenTopoMap as the default ground with a cleaner style, still free
   and keyless. Not in this plan's critical path.
4. **FIRMS_MAP_KEY:** owner registers the free key when Phase F starts (2-minute form), or the
   layer ships GIBS-only until then.
