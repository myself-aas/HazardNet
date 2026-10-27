# Phase 1 — Sweep latent routes · `fix/latent-route-sweep`

**Base:** `main` @ `70a052a` → Phase 0 commit. **Session branch:** `arena/02ded3da-hazardnet`
(see `docs/ops/pr/README.md`). **Date:** 2026-10-27.
**Actions touched:** Action 21 (dated disposition row), change log, `docs/ops/deployment.md` §7.
**Actions closed:** none closed; Action 21's route queue is now a *register*, not prose, and
the one outstanding verification (live POST to telemetry) is owned by Action 12 with a curl.

## Why this phase exists

The batch bug was latent because its route 404'd during the 2026-10-26 Pages cutover. The
question is therefore not "which routes are broken" but "**which routes have never been
exercised since cutover**". Three greps (raw output below) enumerate the surface: 13
`app.get/post` registrations in `backend/server.js` (all static/well-known plus `/health` and
`/metrics`), 27 `/api` literals in `frontend/src`, and **no `/api` line in the history of
`frontend/public/_redirects`** (that file has exactly one commit, `70a052a`; the deliberate
absence of an `/api/*` guard is documented in its own header).

## Live exercise — actual responses, 2026-10-27

All seven Pages Functions were called on `www.hazardnet.live`. These are the **bodies as
returned**, not summaries. `/api/v1/telemetry` is POST-only, so its GET answer plus a local
invocation of the POST handler are shown; a live POST cannot be sent from this sandbox.

```
GET /api/v1/weather?lat=23.8&lng=90.4&mini=1
{"latitude":23.796133,"longitude":90.38055,...,"current":{"time":"2026-10-27T22:30","interval":900,"temperature_2m":31.1,"relative_humidity_2m":62,...,"wind_direction_10m":173,...},"_meta":{...,"current_vars":11,...}}

GET /api/v1/weather?lat=23.8&lon=90.4&mini=1            <-- verification matrix spelling
{"error":"lat and lng query parameters are required (numeric)"}     (HTTP 400 — FIXED below)

GET /api/v1/weather/batch?coords=23.8%2C90.4%3B22.3%2C91.8   <-- verification matrix spelling
{"count":1,"generated_at":"2026-10-27T16:31:50.570Z","points":[{"id":"91.8",...}]}  (FIXED below)

GET /api/v1/weather/batch?coords=23.8103,90.4125,dhaka%7C22.3569,91.7832,chattogram
{"count":2,...,"points":[{"id":"dhaka",...,"current":{"temperature_2m":31,"relative_humidity_2m":63,...}},{"id":"chattogram",...,"current":{"temperature_2m":27.7,"relative_humidity_2m":85,...}}]}

GET /api/v1/forecasts/metadata
{"prediction_date":"2026-10-24","ingestion_timestamp":"2026-10-25T10:49:05.018Z","data_source":"hazardnet/weekly-forecasts","row_count":128,...,"generated_at":"2026-10-27T16:46:23.015Z"}

GET /api/v1/forecasts/bulk?horizon=7_days
{"horizon":"7_days","count":64,...,"forecasts":[{"district_id":40,"district_name":"Bagerhat","severity_score":0.6721,"advisory_tier":"WARNING",...}, ...]}

GET /api/v1/alerts?limit=1
{"generated_at":"...","count":1,"counts":{"WATCH":1},"state_counts":{"PUBLISHED":1},"alerts":[{"district_id":60,"district_name":"Chandpur","hazard_type":"Flash Flood","severity_score":0.7062,"state":"PUBLISHED",...}]}

GET /api/v1/alerts/policy
{"version":"alert-policy/1.0.0","thresholds":{"watch_probability":0.4,"warning_probability":0.65,...},"policy_source":"builder",...}

GET /api/v1/telemetry
{"error":"method not allowed"}    (405, allow: POST — the route exists)

POST /api/v1/telemetry  (local handler invocation in __tests__/routeValueAssertions.test.js)
→ 204; bound sink: writeDataPoint({blobs:['route_value_assertion','phase1-route-sweep','{"phase":1,"hollow":false}'], doubles:[1767000000000], indexes:['phase1-route-sweep']})
→ 204; unbound sink: log line {"tag":"analytics","event":"route_value_assertion",...}
```

**Two latent divergences found by exercising, not reading.** The verification matrix's `lon=`
spelling answered 400, and its `;`-separated `coords` answered `count: 1` with an id of
`"91.8"` — the `;` was parsed as part of the longitude. That is the same bug class as Phase 0
(a shape the code does not recognise, described incorrectly in a comment), one layer up. The
fix follows Phase 0's pattern: **`backend/utils/weatherQuery.js`** is one parser imported by
the Express router, the Node serverless function and the Pages Functions. `lng` stays
canonical and `lon` is an accepted alias; `|` stays documented and `;` is accepted too
(`%7C` / `%3B` decode before parsing). No call site keeps its own copy of the mini-language.

**One correction to the verification matrix:** `POST -d '{"events":[]}' /api/v1/telemetry`
cannot answer 204 — `validateTelemetryBatch` requires a non-empty `events` array and a
`sessionId`. A valid 204 probe is:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' \
  -d '{"sessionId":"phase1-probe","events":[{"event":"page_view","at":1767000000000,"properties":{"probe":"phase1"}}]}' \
  'https://www.hazardnet.live/api/v1/telemetry'     # 204
```

## Route table

"404'd during cutover" is **yes for every `/api/**` path**: Pages served static assets only
until 2026-10-26. "First live call" for dispositioned paths is "none on the edge" by design —
they are Node-only, and the client has a documented fallback. Every row either has a value
assertion or a dated disposition; no row is "known-unexercised". Source of truth:
`docs/ops/route-register.json`, enforced by `__tests__/routeReachability.test.js`.

| Route | Registered in | Called by frontend? | 404’d during cutover? | First live call since cutover | Has value assertion? | Disposition / action |
|---|---|---|---|---|---|---|
| `/api/v1/forecasts/bulk` | functions/api/v1/forecasts/bulk.ts + Node twins | yes | yes | 2026-10-26 (Action 21 first port, probed by site-health.yml); re-probed 2026-10-27T16:47Z: 64 rows, Bagerhat severity_score 0.6721 | yes — `__tests__/routeValueAssertions.test.js` | exercised 2026-10-27 |
| `/api/v1/forecasts/metadata` | functions/api/v1/forecasts/metadata.ts + Node twins | yes | yes | 2026-10-26 (site-health.yml probe); re-probed 2026-10-27T16:46Z: prediction_date 2026-10-24, row_count 128 | yes — `__tests__/routeValueAssertions.test.js` | exercised 2026-10-27 |
| `/api/v1/alerts` | functions/api/v1/alerts/index.ts + Node twins | yes | yes | 2026-10-26 (Action 21 second port); re-probed 2026-10-27T16:46Z with ?limit=1: Chandpur Flash Flood, severity 0.7062, state PUBLISHED | yes — `__tests__/routeValueAssertions.test.js` | exercised 2026-10-27 |
| `/api/v1/alerts/policy` | functions/api/v1/alerts/policy.ts + Node twins | yes | yes | 2026-10-26 (Action 21 second port); re-probed 2026-10-27T16:46Z: watch_probability 0.4, policy_source builder | yes — `__tests__/routeValueAssertions.test.js` | exercised 2026-10-27 |
| `/api/v1/weather` | functions/api/v1/weather.ts + Node twins | yes | yes | 2026-10-27 (Action 21 third port, preview + production probes); re-probed 2026-10-27T16:31Z: 31.1 °C, current_vars 11. `lon=` alias added 2026-10-27 after the matrix probe returned 400. | yes — `__tests__/routeValueAssertions.test.js` | exercised 2026-10-27 |
| `/api/v1/weather/batch` | functions/api/v1/weather/batch.ts + Node twins | yes | yes | 2026-10-27 (GET preview probe found the hollow-point defect; production re-probe after #105/#107). Re-probed 2026-10-27T16:46Z with `\|`: count 2, 31.0 °C / 27.7 °C. The POST form the client actually uses has never been called live from outside a browser — see open verification in Action 21. | yes — `__tests__/routeValueAssertions.test.js` | exercised 2026-10-27 |
| `/api/v1/telemetry` | functions/api/v1/telemetry.ts + Node twins | yes | yes | 2026-10-27 (GET probe returned 405, proving the route exists). A live POST from outside a browser has NOT been recorded in this sandbox; the POST path is exercised locally in __tests__/routeValueAssertions.test.js and __tests__/pagesTelemetry.test.js, and the exact curl is an owner verification in Action 12. | yes — `__tests__/routeValueAssertions.test.js` | exercised 2026-10-27 |
| `/api/advisory` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only, store/AI-backed writes |
| `/api/chat/query` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only, store/AI-backed writes |
| `/api/chat/sample-questions` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only, store/AI-backed writes |
| `/api/grounding/district-facilities/*` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only, store/AI-backed writes |
| `/api/grounding/district-updates/*` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only, store/AI-backed writes |
| `/api/grounding/maps` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only, store/AI-backed writes |
| `/api/grounding/search` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only, store/AI-backed writes |
| `/api/predict` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only, store/AI-backed writes |
| `/api/push` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — authenticated push/conversion writes |
| `/api/push/send` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — authenticated push/conversion writes |
| `/api/push/subscribe` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — authenticated push/conversion writes |
| `/api/push/unsubscribe` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — authenticated push/conversion writes |
| `/api/push/vapid-key` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — authenticated push/conversion writes |
| `/api/conversions/track` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — authenticated push/conversion writes |
| `/api/v1/events/summary` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — events summary is a build artifact, not an API |
| `/api/v1/events/district/*` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — events summary is a build artifact, not an API |
| `/api/v1/events/division/*` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — events summary is a build artifact, not an API |
| `/api/v1/events/hazard/*` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — events summary is a build artifact, not an API |
| `/api/v1/kaggle` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Kaggle advisory (Phase 4 disposition) |
| `/api/v1/kaggle/advisories` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Kaggle advisory (Phase 4 disposition) |
| `/api/v1/forecasts` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/v1/forecasts/update` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/v1/forecasts/ingest-csv` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/v1/forecasts/history` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/v1/alerts/transports` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/v1/alerts/export.csv` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/v1/alerts/preview` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/v1/alerts/run` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/v1/alerts/id/for` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/v1/alerts/:id` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/v1/alerts/:id/evidence-card` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/v1/alerts/:id/review` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/chat/directory` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/conversions/dispatch` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/conversions/reconciliation` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/conversions/debug` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/push/status` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/v1/historical/*` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/metrics` | no edge file (Node surface or client-only path) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/metrics` | backend/routes/, serverless/, api/ (Node only) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/health` | backend/routes/, serverless/, api/ (Node only) | no | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — Node-only router registrations with no browser caller |
| `/api/live-voice` | no edge file (Node surface or client-only path) | yes | yes — 404 since 2026-10-26 | none on the edge; 404 is the documented answer | n/a — dated disposition | 2026-10-27 · Action 21 — WebSocket voice advisor |


## Reachability invariant

`__tests__/routeReachability.test.js` scans every `/api/...` literal in `frontend/src`
(excluding tests and external URLs), derives the route paths from the `functions/api/` file
tree, and fails when a called path is neither a Function file nor in the dated disposition
list. It also fails when:

- the scanner finds fewer than 21 paths (a vacuous pass),
- a Function exists but has no register row,
- a disposition has no date, reason or verify command,
- a disposition goes stale because the route has since been ported,
- an edge route has no value-assertion test (presence assertions do not count),
- the shared weather query parser disagrees between `URLSearchParams` and `req.query`.

The disposition list is **Action 21's dated register**, not a TODO: each entry names the
runtime property that keeps a route unhosted and the command that would disprove it.
`__tests__/routeValueAssertions.test.js` exercises all seven Functions against captured
upstream fixtures and the committed deployed artifacts, reading expected leaves from those
fixtures at test time.

## Captured command output (not summarised)

```
$ bash /tmp/phase1_grep.sh
$ git grep -nE "app\.(get|post|put|delete)\(" serverless/ api/ backend/
backend/server.js:135:app.get(['/.well-known/security.txt', '/security.txt'], (req, res) => {
backend/server.js:157:app.get('/.well-known/http-message-signatures-directory', (req, res) => {
backend/server.js:209:app.get('/.well-known/ai-catalog.json', (req, res) => {
backend/server.js:232:app.get('/.well-known/oauth-protected-resource', (req, res) => {
backend/server.js:256:app.get('/.well-known/oauth-authorization-server', (req, res) => {
backend/server.js:301:app.get('/.well-known/openid-configuration', (req, res) => {
backend/server.js:337:app.get('/.well-known/agent-card.json', (req, res) => {
backend/server.js:457:app.get('/.well-known/agent-skills/index.json', (req, res) => {
backend/server.js:471:app.get('/.well-known/mcp/server-card.json', (req, res) => {
backend/server.js:481:app.get('/.well-known/api-catalog', (req, res) => {
backend/server.js:706:app.get('/health', (req, res) => {
backend/server.js:741:app.get('/metrics', async (req, res) => {
backend/server.js:761:app.get('*', (req, res, next) => {

$ git grep -n "/api" frontend/src/ | grep -E "fetch\(|apiClient\."
frontend/src/components/AdvisoryPanel.tsx:52:        const response = await fetch('/api/advisory', {
frontend/src/components/ChatBot.tsx:98:      const res = await fetch('/api/chat/sample-questions');
frontend/src/components/ChatBot.tsx:116:      const res = await fetch('/api/chat/query', {
frontend/src/components/GroundingIntelligencePanel.tsx:53:      const res = await fetch(`/api/grounding/district-facilities/${encodeURIComponent(districtId)}`);
frontend/src/components/GroundingIntelligencePanel.tsx:71:      const res = await fetch(`/api/grounding/district-updates/${encodeURIComponent(districtId)}`);
frontend/src/components/GroundingIntelligencePanel.tsx:99:        const res = await fetch('/api/grounding/maps', {
frontend/src/components/GroundingIntelligencePanel.tsx:113:        const res = await fetch('/api/grounding/search', {
frontend/src/hooks/useForecasts.ts:37:    const res = await fetch(`/api/v1/forecasts/bulk?horizon=${encodeURIComponent(horizon)}&fresh=${Date.now()}`, { cache: 'no-store' });
frontend/src/hooks/useKaggleAdvisories.ts:27:  let res = await fetch(`/api/v1/kaggle?horizon=${encodeURIComponent(horizon)}`, {
frontend/src/hooks/useKaggleAdvisories.ts:31:    const fallback = await fetch(`/api/v1/kaggle/advisories?horizon=${encodeURIComponent(horizon)}`, {
frontend/src/lib/eventsClient.ts:197:    const res = await fetch('/api/v1/events/summary');
frontend/src/lib/eventsClient.ts:246:    const res = await fetch(`/api/v1/events/district/${encodeURIComponent(districtId)}`);
frontend/src/lib/eventsClient.ts:318:    const res = await fetch(`/api/v1/events/division/${encodeURIComponent(divisionId)}`);
frontend/src/lib/eventsClient.ts:405:    const res = await fetch(`/api/v1/events/hazard/${encodeURIComponent(hazardId)}`);
frontend/src/lib/forecasts.ts:205:    const metadataResponse = await fetch(`/api/v1/forecasts/metadata?fresh=${Date.now()}`, {
frontend/src/lib/forecasts.ts:230:    const bulkResponse = await fetch(`/api/v1/forecasts/bulk?horizon=7_days&fresh=${Date.now()}`, {
frontend/src/lib/storedPrediction.ts:193:    response = await fetch('/api/predict', {
frontend/src/lib/weather.ts:204:  const resp = await fetch(`/api/v1/weather?${params.toString()}`, {
frontend/src/lib/weather.ts:229:  const resp = await fetch(`/api/v1/weather?${params.toString()}`, {
frontend/src/lib/weather.ts:248:  const resp = await fetch('/api/v1/weather/batch', {
frontend/src/pages/AdvisoriesPage.tsx:135:      const response = await fetch('/api/advisory', {
frontend/src/serviceWorker.ts:103:          fetch('/api/predict', {
frontend/src/services/conversionTracking.ts:150:    const res = await fetch('/api/conversions/track', {
frontend/src/services/pushNotification.ts:26:    const res = await fetch('/api/push/vapid-key');
frontend/src/services/pushNotification.ts:76:    const res = await fetch('/api/push/subscribe', {
frontend/src/services/pushNotification.ts:111:      await fetch('/api/push/unsubscribe', {
frontend/src/services/pushNotification.ts:163:  const res = await fetch('/api/push/send', {

$ git log -p -- frontend/public/_redirects | grep -E "^[+-]/api"
(no /api lines: the file has a single commit, 70a052a)

$ find functions/api -type f | sort
functions/api/v1/alerts/index.ts
functions/api/v1/alerts/policy.ts
functions/api/v1/forecasts/bulk.ts
functions/api/v1/forecasts/metadata.ts
functions/api/v1/telemetry.ts
functions/api/v1/weather.ts
functions/api/v1/weather/batch.ts

$ npx jest __tests__/routeReachability.test.js --ci
PASS __tests__/routeReachability.test.js
  route register
    ✓ has a dated schema, dated dispositions, and one row per Functions file (6 ms)
    ✓ every edge route names a value-assertion test that exists and asserts values (4 ms)
    ✓ no disposition is stale — a ported route must be removed from the list (7 ms)
  reachability invariant
    ✓ a route called from frontend/src exists in functions/api/ or has a dated disposition (9 ms)
  weather query contract — one parser, three runtimes
    ✓ lon is an alias for lng in the verification matrix, on URLSearchParams and req.query (1 ms)
    ✓ ; and | are the same separator, including the encoded matrix form (1 ms)
    ✓ POST bodies keep the numeric-coordinate rule and the same wording (1 ms)

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
Snapshots:   0 total
Time:        0.597 s, estimated 1 s
Ran all test suites matching /__tests__\/routeReachability.test.js/i.

$ npx jest __tests__/routeValueAssertions.test.js --ci
PASS __tests__/routeValueAssertions.test.js
  GET /api/v1/forecasts/bulk — leaf values from the deployed snapshot
    ✓ count, district id and severity are the artifact’s values, not just present keys (14 ms)
  GET /api/v1/forecasts/metadata — freshness headline
    ✓ prediction_date and row_count match the snapshot (5 ms)
  GET /api/v1/alerts — published row values
    ✓ the first published alert carries the artifact’s district, severity and state (17 ms)
  GET /api/v1/alerts/policy — the stamped thresholds
    ✓ watch_probability is the artifact’s stamped value, and policy_source names the writer (5 ms)
  GET /api/v1/weather — real reading
    ✓ temperature and wind direction are the captured upstream leaves (5 ms)
  GET /api/v1/weather/batch — both separator spellings
    ✓ `|` and `;` produce the same two points with the captured leaves (4 ms)
  POST /api/v1/telemetry — both sinks, method gate
    ✓ bound: 204 and one data point whose blobs are the fixture’s leaves (4 ms)
    ✓ unbound: 204 and the same event name in the fail-open log line (1 ms)
    ✓ GET is 405, so the route exists without POST being callable (1 ms)

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
Snapshots:   0 total
Time:        0.625 s, estimated 1 s
Ran all test suites matching /__tests__\/routeValueAssertions.test.js/i.

$ npx jest __tests__/pagesWeather.test.js __tests__/pagesTelemetry.test.js __tests__/pagesForecasts.test.js __tests__/pagesAlerts.test.js --ci --silent
PASS __tests__/pagesAlerts.test.js
PASS __tests__/pagesForecasts.test.js
PASS __tests__/pagesWeather.test.js
PASS __tests__/pagesTelemetry.test.js

Test Suites: 4 passed, 4 total
Tests:       49 passed, 49 total
Snapshots:   0 total
Time:        1.175 s, estimated 6 s
```

## Actions closed

None closed. Action 21 gains the dated disposition row and now points at the register;
Action 12 keeps the outstanding live POST verification. Phase 1's exit criteria are met:
every route row has a value assertion or a dated disposition, and the invariant passes.

## Verification matrix (this phase)

```bash
npx jest __tests__/routeReachability.test.js       # 7 passed
npx jest __tests__/routeValueAssertions.test.js   # 9 passed
npx jest __tests__/pagesWeather.test.js __tests__/pagesTelemetry.test.js \
        __tests__/pagesForecasts.test.js __tests__/pagesAlerts.test.js --ci  # 49 passed
```
