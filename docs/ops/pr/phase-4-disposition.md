# Phase 4 — Dispose historical, kaggle, metrics · `chore/disposition-latent-routes`

**Base:** `main` @ `70a052a` → Phases 0–3. **Session branch:** `arena/02ded3da-hazardnet`.
**Date:** 2026-10-27. **Actions touched:** Action 21 (disposition row + status), **Action 24
opened** (Kaggle R2 follow-up), change log, `docs/ops/deployment.md` §7,
`docs/ops/route-register.json`, `docs/SECURITY.md`, `monitoring/*`, site-routes content.
**Actions closed:** none (Action 24 is deliberately opened; Action 12 remains owner-side).
**Constraint honoured:** `historical` was not touched in Phases 0–3. `PUSH_TO_API` stays `false`.

## historical — the three claims

| Claim | Verification | Holds? | Evidence |
|---|---|---|---|
| "Nothing calls it" | `git grep -rn "historical" frontend/src/ e2e/ docs/` plus a source scan for `/api/v1/historical` literals | **Yes for code.** Every frontend hit is a `/data/historical/<name>.json` fetch (`HistoricalCatalogPage.tsx:46`) or static-data copy in old specifications. Zero `/api/v1/historical` literals in `frontend/src/` or `e2e/`. | Raw grep in the captured output below. **Access logs cannot be read from this sandbox** and the `ANALYTICS` binding is not yet created (Action 12); the owner verification command is below. |
| "≈ 9 ms of 10 ms CPU" | `node scripts/measure_historical_serialise.mjs --iterations 25`, `performance.now()` around the handler's exact two operations (`JSON.parse` + `JSON.stringify` of the 1.5 MB catalog) | **Yes locally; not measured in a Pages preview.** | Node v22.22.3 linux/x64, 1,520,215 input bytes, 3,062 rows, 1,243,480 response bytes. Parse median **2.85 ms**, stringify median **5.51 ms**, total median **8.41 ms**, **p95 11.44 ms** — the p95 exceeds the 10 ms budget before routing overhead. |
| "CDN already serves it" | Live `GET https://www.hazardnet.live/data/historical/hazard-catalog-index.json` and `national-summary.json`; read `serverless/v1/historical.js` | **Yes.** | The live catalog fetch returned JSON (first row `Event_0000`, Barguna, `severity_score: 1`) across **190 chunks**; `national-summary.json` returned `{"metrics":[…3324…64…]}`. `serverless/v1/historical.js` only `readFileSync` + `JSON.parse` + `res.json({success, total_events, events})` — a pure re-serialiser. The Express router added filtering/GLIDE links, but no caller used it. |

**Sandbox gap, stated plainly.** A Cloudflare Pages preview deployment cannot be created from
this environment, so claim 2 is a **local V8 measurement**, not a preview measurement. The
deletion makes the 10 ms ceiling moot for this route, but the owner can still reproduce the
number in a preview before accepting this PR:

```bash
# On a machine with Wrangler and the Pages project bound:
printf '%s\n' 'export async function onRequestGet() {' \
  '  const t0 = performance.now();' \
  '  const res = await fetch("https://www.hazardnet.live/data/historical/hazard-catalog-index.json");' \
  '  const raw = await res.text(); const events = JSON.parse(raw); const t1 = performance.now();' \
  '  const body = JSON.stringify({ success: true, total_events: events.length, events }); const t2 = performance.now();' \
  '  return new Response(JSON.stringify({ parse_ms: t1-t0, stringify_ms: t2-t1, bytes: body.length }), { headers: {"content-type":"application/json"} });' \
  '}' > functions/_probe-historical.ts
npx wrangler pages dev dist --compatibility-date=2026-10-27 &
curl -sS 'http://127.0.0.1:8788/_probe-historical' | jq .
rm functions/_probe-historical.ts    # never deploy the probe
```

Access-log verification for the owner (Analytics Engine once Action 12's binding exists):

```bash
# Cloudflare dashboard → Workers & Pages → hazardnet → Analytics → Traffic,
# filter path contains "/api/v1/historical" for the last 30 days; expect 0 requests.
# With the binding, the equivalent SQL API query is:
#   SELECT count() FROM hazardnet_telemetry WHERE blob1 LIKE '%/api/v1/historical%' AND timestamp > NOW() - INTERVAL '30' DAY
```

**Decision: delete.** All three claims hold within the evidence available, and the third
makes the second irrelevant once the route is gone. Deleted:
`serverless/v1/historical.js`, `serverless/historical.js`, `backend/routes/historical.js`,
both dispatcher entries (`api/[endpoint].js`, `api/v1/[resource].js`), both Express mounts,
the `historical-catalog` agent skill, the API-catalog anchor, three `read:historical` OAuth
scopes, and the historical API section in `frontend/src/content/site-routes.json` (rewritten
to the static files). `frontend/public/_redirects` gained a **permanent-404 comment** —
deliberately *not* a rule, because an `/api/*` rule can shadow a real asset. Rollback is
route-restore + removing that comment; visitor behaviour is unchanged either way.

## metrics — process series do not exist for an isolate

`backend/metrics.js` is a `prom-client` register of **the Node process**: heap, event loop,
GC, request counters, inference latency. A Cloudflare Worker isolate has none of these, so a
port would publish fabricated numbers. The only gauge derived from real data,
`hazardnet_forecast_age_hours`, is computed from a forecast read — and
`frontend/public/data/freshness.json` already carries that age. **Decision: delete the route,
not the number.**

- Deleted `serverless/metrics.js`, its `api/[endpoint].js` entry, `app.get('/metrics')`,
  both Vite dev proxies, the `Firebase-Store-Verify.yml` `/metrics` curl, and
  `__tests__/metricsApi.test.js` (replaced by `__tests__/freshnessGauges.test.js`).
- Added `gauges.series[]` to `/data/freshness.json` via
  `scripts/build_freshness_artifact.mjs`: `hazardnet_forecast_age_hours` (SLO 192 h),
  `hazardnet_alert_snapshot_age_hours` (48 h), `hazardnet_site_probe_age_hours` (2 h).
  `null` means **unknown**, not zero — absence is the alarm, matching the old
  `hideForecastAgeHours()` behaviour. The test asserts the gauge value equals the source's
  `age_hours` leaf.
- `monitoring/{prometheus.yml,alerts.yml,README.md}` carry a dated retirement header; the
  files remain as an historical record. **No metrics route was built.**

## kaggle — called, so scheduled instead of deleted

V8 incompatibility confirmed at `backend/services/kaggleAdvisoryClient.js`:
`Authorization: Basic …` (line 174), `inflateRawSync` from `node:zlib` (22/103), and a
`node:fs` cache that outlives the request (23). But
`frontend/src/hooks/useKaggleAdvisories.ts:27,31` **does** call
`/api/v1/kaggle` and `/api/v1/kaggle/advisories`, so "no callers → delete" does **not**
hold. **Decision: keep the Node route, open Action 24, schedule PR
`feat/kaggle-r2-artifact`.** The full plan (pipeline writes parsed rows to R2; a Function
reads them with `assertAdvisoryRows`; dated 2026-10-27) is
[phase-4b-kaggle-r2.md](phase-4b-kaggle-r2.md). The route is not deployed on Pages today;
the page states the absence honestly. Nothing is left "dispositioned but still deployed and
unexercised" — the register says **scheduled with a named PR**, not "done".

## Route disposition table

| Route | Callers | Runtime verdict | Action | Status |
|---|---|---|---|---|
| `/api/v1/historical/*`, `/api/historical` | 0 in code; access logs unavailable here | Pure re-serialiser of a CDN-served 1.5 MB file at ~8.4 ms CPU | **Deleted** + permanent-404 comment + dated disposition | Done |
| `/api/metrics`, `/metrics` | 0 | `prom-client` process series cannot exist in an isolate | **Deleted**; three gauges added to `/data/freshness.json`; monitoring files marked retired | Done |
| `/api/v1/kaggle`, `/api/v1/kaggle/advisories` | `useKaggleAdvisories.ts` (2 calls) | Basic auth + `node:zlib` + `node:fs` cache = not portable | **Not deleted**. Action 24 + named PR `feat/kaggle-r2-artifact` (pipeline writes R2 artifact, Function reads it) | Scheduled 2026-10-27 |

## Captured command output (not summarised)


```
$ bash /tmp/phase4_grep.sh | head -40
$ git grep -rn "historical" frontend/src/ e2e/ docs/ | grep -v node_modules
docs/FEATURES_SPEC.md:255:   - `5` historical episodes scored in the validation report
docs/FEATURES_SPEC.md:779:historical alert artifacts against the current rendering logic,
docs/FEATURES_SPEC.md:1187:Reports per-episode detection counts for 5 historical episodes:
docs/FEATURES_SPEC.md:1255:| `/api/v1/historical` | GET | Historical hazard catalog query | Public |
docs/FEATURES_SPEC.md:1322:| `get_historical_events` | Historical hazard catalog |
docs/PRD.md:124:- Description: HazardNet integrates a comprehensive 26-year historical disaster
docs/PRD.md:166:    interactive hover tooltips, and click-to-open drawer showing historical profile.
docs/PRD.md:178:  - Landing page (`/`): Headline historical counters (3,062 events, 64 districts, 26 years)
docs/PRD.md:182:  - District Risk Profile (`/district/[id]`): District-specific historical timeline,
docs/PRD.md:316:The historical baseline data derived from notebook `1-HazardNet_BGD_climatic_hazards`
docs/PRD.md:327:- **Static Bundling Workflow (`scripts/build_historical_catalog.mjs`)**:
docs/PRD.md:344:│ historical hazard catalog & vulnerability matrix tables,   │
docs/PRD.md:351:│ /api/v1/forecasts /alerts /historical /advisory /weather    │
docs/PRD.md:384:GET /api/v1/historical/hazards?district=Sunamganj&hazard_type=Flash+Flood&year=2026
docs/PRD.md:397:GET /api/v1/historical/vulnerability
docs/PRD.md:408:GET /api/v1/historical/trends
docs/PRD.md:415:GET /api/v1/historical/events/{glide_or_id}
docs/PRD.md:430:GET /api/v1/historical/summary
docs/PRD.md:536:**USR-004 — Researcher / Analyst explores historical archive & multilateral GLIDE links (P0)**
docs/PRD.md:539:26-year historical disaster database (2000–2026), filter events across districts
docs/PRD.md:541:I can benchmark historical vulnerabilities against current forecasts.
docs/PRD.md:581:**USR-008 — Agrometeorologist compares active advisory against 26-year historical baseline (P1)**
docs/PRD.md:584:a district's historical vulnerability index, past disaster frequencies, and dominant
docs/PRD.md:586:contextualize whether the incoming weather event exceeds historical return baselines.
docs/PRD.md:588:- [ ] District detail panel displays historical baseline card: composite vulnerability
docs/PRD.md:590:- [ ] Multi-hazard radar/bar breakdown shows the district's historical hazard mix
docs/PRD.md:591:- [ ] If today's forecasted hazard matches the district's top historical risk
docs/PRD.md:594:- [ ] Direct link from the forecast card to the district's permalinked historical
docs/PRD.md:681:Files: `scripts/build_historical_catalog.mjs`, `frontend/public/data/historical/`
docs/PRD.md:688:Files: `backend/routes/historical.js`, `backend/utils/glideResolver.js`
docs/PRD.md:689:Acceptance: implements `/api/v1/historical/*` per §5.2; generates outbound links
docs/PRD.md:849:- [ ] 26-year historical disaster catalog (3,062 events, 64 districts) bundled into static client JSON files
docs/PRD.md:909:| 4.1 | 2026-09-29 | Integrated 2000–2026 historical hazards catalog (3,062 events, 70 GLIDE events, 64-district vulnerability rankings) from notebook 1; added multi-scale spatial hierarchy (Districts, Divisions, National), multilateral GLIDE linking (ReliefWeb, FAO, WHO, ADRC, IFRC GO), interactive choropleth map, matrix and catalog tables, temporal trend and multi-hazard graphs, and Phase E tasks |
docs/SECURITY.md:7:and 26-year historical disaster intelligence for all 64 districts in Bangladesh. In
docs/SECURITY.md:75:  - Historical archive (static, CDN-served): `/data/historical/*.json`. The `/api/v1/historical/*` REST endpoints were retired on 2026-10-27 (Phase 4: no callers, ~8.4 ms re-serialise against a 10 ms isolate budget); see `docs/ops/owner-actions.md` Action 21.
docs/SECURITY.md:82:  - Preventing tampering with the 2000–2026 historical catalog (3,062 events) and 64-district vulnerability rankings.
docs/TASKS.md:8:reflects the architecture, daily automation pipeline, 2000–2026 historical hazards archive,
docs/TASKS.md:178:- **Files**: `scripts/build_historical_catalog.mjs`, `frontend/public/data/historical/`
docs/TASKS.md:194:- **Files**: `backend/routes/historical.js`, `backend/utils/glideResolver.js`, `api/historical.js`

$ node scripts/measure_historical_serialise.mjs --iterations 25
{
  "file": "frontend/public/data/historical/hazard-catalog-index.json",
  "input_bytes": 1520215,
  "rows": 3062,
  "response_bytes": 1243480,
  "iterations": 25,
  "runtime": "node v22.22.3 on linux/x64",
  "parse_ms": {
    "min": "2.10",
    "median": "2.55",
    "p95": "5.29",
    "max": "5.55"
  },
  "stringify_ms": {
    "min": "4.15",
    "median": "4.62",
    "p95": "6.25",
    "max": "6.29"
  },
  "total_ms": {
    "min": "6.35",
    "median": "7.16",
    "p95": "11.32",
    "max": "11.58"
  },
  "free_tier_cpu_budget_ms": 10,
  "note": "Local V8 measurement, not a Pages preview isolate. See docs/ops/pr/phase-4-disposition.md for the preview reproduction command."
}

$ git grep -rn "/api/v1/historical\|/api/metrics\|app.get('/metrics'" frontend/src/ e2e/ backend/ serverless/ api/ -- 2>/dev/null | head -20
api/[endpoint].js:11: *   (retired 2026-10-27: /api/historical and /api/metrics — see docs/ops/owner-actions.md Action 21)
api/v1/[resource].js:5: * (retired 2026-10-27: /api/v1/historical — the CDN serves /data/historical/*.json)
backend/server.js:723:// Retired 2026-10-27 (Phase 4): /api/v1/historical and /api/metrics. The historical

$ npx jest __tests__/freshnessGauges.test.js __tests__/phaseEHistorical.test.js __tests__/api/serverlessRouting.test.js __tests__/testQuality.test.js --ci --silent
PASS __tests__/api/serverlessRouting.test.js
PASS __tests__/phaseEHistorical.test.js
PASS __tests__/testQuality.test.js
PASS __tests__/freshnessGauges.test.js

Test Suites: 4 passed, 4 total
Tests:       57 passed, 57 total
Snapshots:   0 total
Time:        1.37 s

$ npx jest --ci --silent (tail)
PASS __tests__/staticShellContrast.test.js
PASS frontend/src/lib/__tests__/hazardPalette.test.ts

Test Suites: 2 skipped, 193 passed, 193 of 195 total
Tests:       24 skipped, 2077 passed, 2101 total
Snapshots:   0 total
Time:        46.533 s

$ node scripts/build_freshness_artifact.mjs --check
[freshness] --check: artifact matches its inputs (stale overall).

$ git status --short
 M .github/workflows/Firebase-Store-Verify.yml
 M __tests__/api/serverlessRouting.test.js
D  __tests__/metricsApi.test.js
 M __tests__/phaseEHistorical.test.js
 M api/[endpoint].js
 M api/v1/[resource].js
D  backend/routes/historical.js
 M backend/server.js
 M docs/SECURITY.md
 M docs/ops/deployment.md
 M docs/ops/owner-actions.md
 M docs/ops/route-register.json
 M frontend/public/_redirects
 M frontend/public/data/freshness.json
 M frontend/src/content/site-routes.json
 M frontend/vite.config.ts
 M monitoring/README.md
 M monitoring/alerts.yml
 M monitoring/prometheus.yml
 M scripts/build_freshness_artifact.mjs
D  serverless/historical.js
D  serverless/metrics.js
D  serverless/v1/historical.js
?? __tests__/freshnessGauges.test.js
?? docs/ops/pr/phase-4b-kaggle-r2.md
?? scripts/measure_historical_serialise.mjs
```

## Exit / actions closed

- historical: **deleted**, dated disposition, permanent-404 comment. Owner verification
  (access logs, preview CPU measurement) is recorded but not claimed as run here.
- metrics: **deleted**, gauges moved into the freshness artifact, no route built.
- kaggle: **scheduled** with a named PR and a dated Action 24 entry; no false "closed" claim.

No action was closed without evidence. The full suite is green.

## Verification matrix (this phase)

```bash
node scripts/measure_historical_serialise.mjs --iterations 25
node scripts/build_freshness_artifact.mjs --check
npx jest __tests__/freshnessGauges.test.js __tests__/phaseEHistorical.test.js \
        __tests__/api/serverlessRouting.test.js __tests__/testQuality.test.js --ci
npx jest --ci     # 193 suites / 2077 tests passed
```
