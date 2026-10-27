# Phase 0 — Shape-audit the normaliser · `fix/openmeteo-shape-audit`

**Base:** `main` @ `70a052a` (#107). **Session branch:** `arena/02ded3da-hazardnet` (this
checkout is pinned to one branch; see `docs/ops/pr/README.md` for why the phase PRs are
recorded as descriptions + one stacked commit each instead of six remote head branches).
**Date:** 2026-10-27. **Actions touched:** Action 21 (audit row), change log. **Actions closed:** none —
Phase 0 closes the shape+comment class, not the route/cache/test classes (Phases 1–3).

## What the upstream actually says

Captured verbatim from <https://open-meteo.com/en/docs> (§ *API Documentation*, latitude /
longitude row) on 2026-10-27:

> `latitude, longitude | Floating point | Yes | Geographical WGS84 coordinates of the
> location. Multiple coordinates can be comma separated. E.g.
> &latitude=52.52,48.85&longitude=13.41,2.35. To return data for multiple locations the
> JSON output changes to a list of structures. CSV and XLSX formats add a column location_id.`

And § *JSON Return Object*: "On success a JSON object will be returned", with `latitude`,
`longitude`, `elevation`, `generationtime_ms`, `utc_offset_seconds`, `timezone`,
`timezone_abbreviation`, `current`, `hourly`, `daily`, `hourly_units`, `daily_units`.

Two live calls on 2026-10-27 (parsed bytes committed as fixtures):

```
GET /v1/forecast?latitude=23.8103&longitude=90.4125&current=…&timezone=Asia%2FDhaka…
→ { "latitude": 23.796133, …, "current": {"temperature_2m": 31.1, …} }        # OBJECT

GET /v1/forecast?latitude=23.8103,22.3569&longitude=90.4125,91.7832&current=… (same vars)
→ [ {"latitude": 23.796133, …, "current": {"temperature_2m": 31.1, …}},
    {"latitude": 22.390158, …, "location_id": 1, "current": {"temperature_2m": 27.8, …}} ]
                                                                                 # ARRAY
```

`URLSearchParams` encodes the coordinate comma as `%2C`. **The tell is the `latitude=`
parameter**, not `%2C` anywhere in the URL: the `current=`, `hourly=` and `daily=` variable
lists also contain encoded commas. `pagesWeather.test.js` scopes its regex to `latitude=`;
the new shape test reads the parameter with `new URL(...).searchParams`.

There is **no** documented "nested form" in which one object carries `latitude: [lat0,
lat1]` or `current.temperature_2m: [v0, v1]`. That story existed only in
`backend/utils/openMeteo.js`'s comment and in the code that indexed by it.

## The table (built before any fix)

Lines are from `70a052a`, the file as read before the edit. "Code assumes" is what the old
implementation did with the raw body.

| Function | Line | Query shape (single/multi) | Response shape (object/array) | Code assumes | Comment says | Divergent? |
|---|---|---|---|---|---|---|
| `clearCache` | 197 | n/a — no upstream call | n/a | `Map.clear()` | "tests / admin" | No |
| `fetchWeather(lat,lng,opts)` | 317 | **single** (`latitude=23.8103&longitude=90.4125`) | **object** | `_extractPoint(raw, 0)` where `scalar(key)` does `Array.isArray(v) ? v[i] : v` and `pickSub` treats any flat array at `i>0` as a per-location value | "Single-point full 16-day forecast (current + hourly + daily)" — correct | **Yes (latent)**: the same helper is used by the batch path with `i>0`; its `pickSub` would turn a real hourly series into a scalar on a batch full forecast. `generationtime_ms`, `current_units`, `hourly_units`, `daily_units` bypass `scalar` entirely. |
| `fetchCurrentWeather(lat,lng,opts)` | 326 | **single** (mini) | **object** | same `_fetchSingle` → `_extractPoint(raw, 0)` | "Single-point current-only (mini)" — correct | **Yes (inherited)**: reads a cache entry the batch path may have written with no data block; see Phase 2. |
| `fetchCurrentWeatherBatch(coords,opts)` | 341 | **multi** (`latitude=a,b&longitude=c,d`, `%2C`) | **array** of complete per-location objects | before #105: `_extractPoint(raw, j)` on the array → `raw[key]` undefined; after #105: unwrap `raw = raw[j]` but still run `scalar`/`pickSub` with `i=j` | "Batch endpoint supports 64 districts in one upstream call" — true but silent on response shape; `_extractPoint`'s JSDoc claimed the nested form | **Yes**: #105 fixed the array unwrap but left shape detection inside a function whose comment describes a shape upstream never sends; `current_units`/`generationtime_ms` were un-normalised and `pickSub` still conflated series with locations. |
| `CURRENT_VARS` / `CURRENT_VARS_MINI` / `HOURLY_VARS` / `DAILY_VARS` / `PRESSURE_LEVELS` (const exports) | 426 | n/a | n/a | variable-name lists only | "Full hourly set (surface + 133 pressure-level fields = 191 total)" etc. | No shape divergence; these are query inputs. |
| `_extractPoint` (internal at 249; exported for tests by this PR) | 249 | both | both | `Array.isArray(raw) ? raw[i] : raw`, then `scalar`/`pickSub` heuristics keyed on `i` | JSDoc: "**A flat object** — one location, either a single value per variable or, for a multi-location request made in the nested form, an array per variable with the index selecting the location" | **Yes — the root divergence.** The documented "nested form" is not an Open-Meteo response; `raw.generationtime_ms` on an array body read the array's property, not a location's; `pickSub` guessed from `i` whether an array meant "time series" or "per-location value". |
| `_addMeta` (internal, 297) | 297 | n/a | n/a | counts keys, writes `_meta` even when there is no `current`/`hourly`/`daily` block | none | **Yes as a defect carrier**: a `_meta` with no data block is a defect, not a valid envelope. Phase 2's write guard stops it reaching callers; Phase 0 does not widen any test to accept it. |

## Fixes in this commit

1. **`_normalisePoint(raw)` (new export, line 266)** — the only code that knows the two real
   shapes. Object → `[record]`; array → one record per element; anything else → `[]`.
   Metadata (`generationtime_ms`, `utc_offset_seconds`, `timezone`, `timezone_abbreviation`,
   `elevation`, `location_id`, `*_units`) is scalar on both paths. `current`/`hourly`/`daily`
   blocks are passed through untouched: an array inside a record is a time series, never a
   list of locations.
2. **`_extractPoint(record)` (line 309)** is now **pure mapping**. No `Array.isArray(raw)`
   branch, no `pickSub`, no `i` heuristics, no dependence on the caller's query shape.
3. **Both paths call `_normalisePoint`** — `fetchCurrentWeatherBatch` (line ~425) and
   `_fetchSingle` (line ~473). One file, imported by Node, serverless and Pages Functions;
   no fork. A multi query answered with the single-point object shape now returns the one
   location that exists instead of a second `{id, _meta}` point.
4. **Comments corrected in the same commit** — module header, batch JSDoc,
   `functions/api/v1/weather.ts`, and the two regression comments in
   `__tests__/pagesWeather.test.js`. The header now quotes the docs' "changes to a list of
   structures" rule and states that `%2C` must be read from the `latitude` parameter.
5. **`jest.config.cjs` ignores `/fixtures/`** — without it the full suite treats each
   committed `.js` fixture as a test file and fails with "Your test suite must contain at
   least one test". This is part of the same commit so Phase 0 is independently green.
6. **Shape-contract tests** — `backend/utils/__tests__/openMeteo.test.js` over two committed
   fixtures captured from the live upstream: `fixtures/openMeteoSingleObject.js` (object,
   `temperature_2m: 31.1`, `wind_direction_10m: 173`) and
   `fixtures/openMeteoMultiArray.js` (array, `31.1` / `27.8`, `location_id: 1` on the
   second element). Both fixtures carry the provenance header required by Phase 3's
   `__tests__/testQuality.test.js`. Assertions cover identical internal contract (key sets,
   per-block keys, types; a derived `[object]` twin is deep-equal), leaf values, that a
   time-series array is never indexed into a scalar, and that a shape mismatch cannot emit
   `_meta`-only points.

## Captured command output (not summarised)

The block below is the raw output of the commands, including the test names.

```
$ npx jest backend/utils/__tests__/openMeteo.test.js --ci
PASS backend/utils/__tests__/openMeteo.test.js
  internal contract — one array of per-location records, whatever the query
    ✓ an object response normalises to one record, an array response to one per location (2 ms)
    ✓ object and array shapes produce the identical internal contract (5 ms)
    ✓ _extractPoint is pure mapping — blocks stay blocks, metadata stays scalar (2 ms)
    ✓ a malformed element cannot be silently turned into a hollow point
  both public paths use that contract
    ✓ single: fetchWeather and mini map the object response to real readings (5 ms)
    ✓ batch: the `%2C` query answers an array, and every point keeps its own leaves (1 ms)
    ✓ a multi query answered with the wrong (object) shape cannot emit _meta-only points

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
Snapshots:   0 total
Time:        0.528 s, estimated 1 s
Ran all test suites matching /backend\/utils\/__tests__\/openMeteo.test.js/i.

$ npx jest __tests__/pagesWeather.test.js --ci
PASS __tests__/pagesWeather.test.js
  GET /api/v1/weather
    ✓ returns the normalised bundle and a 15-minute cache, like the Node handler (12 ms)
    ✓ requires numeric lat/lng and says so (5 ms)
    ✓ mini=1 asks upstream for current conditions only (1 ms)
    ✓ an upstream failure is a 502, not a 500 — it is Open-Meteo that is down (1 ms)
  POST /api/v1/weather/batch
    ✓ answers every point in one upstream call (4 ms)
    ✓ the same query language works over GET, as the Node handler allows (2 ms)
    ✓ rejects an empty or malformed point list with the Node wording (1 ms)
    ✓ refuses a body over 256 KiB before parsing it (2 ms)
    ✓ returns the current conditions for every point, not just their ids (2 ms)
    ✓ one upstream call for N points, and the cache does not swallow the first (2 ms)
    ✓ an unsupported method is a 405 that names what is allowed
  the edge routes are the Node routes
    ✓ single point: same status, same cache header, same payload on both runtimes (5 ms)
    ✓ batch: same count, same point payloads, same cache header on both runtimes (3 ms)

Test Suites: 1 passed, 1 total
Tests:       13 passed, 13 total
Snapshots:   0 total
Time:        0.729 s, estimated 1 s
Ran all test suites matching /__tests__\/pagesWeather.test.js/i.

$ grep -nE "^export " backend/utils/openMeteo.js
215:export function clearCache() { cache.clear(); }
266:export function _normalisePoint(raw) {
309:export function _extractPoint(record) {
351:export async function fetchWeather(lat, lng, opts = {}) {
360:export async function fetchCurrentWeather(lat, lng, opts = {}) {
380:export async function fetchCurrentWeatherBatch(coords, opts = {}) {
479:export { CURRENT_VARS_ALL as CURRENT_VARS, CURRENT_VARS_MINI, HOURLY_VARS, DAILY_VARS, PRESSURE_LEVELS };

$ git diff --stat
 __tests__/pagesWeather.test.js |   9 ++-
 backend/utils/openMeteo.js     | 169 +++++++++++++++++++++++++++--------------
 docs/ops/owner-actions.md      |   2 +
 functions/api/v1/weather.ts    |   7 +-
 4 files changed, 123 insertions(+), 64 deletions(-)
```

## Actions closed

None closed by this phase. Action 21 gains the **Phase 0 shape audit 2026-10-27** row; the
change log gains the dated entry. Phase 0's exit criteria are met: table complete, every
divergent access fixed, comments match code, object + array shape tests pass. The `_meta`
with no data block remains a defect (it is stopped at the cache boundary in Phase 2) — no
test was widened to accept it.

## Verification matrix (this phase)

```bash
npx jest backend/utils/__tests__/openMeteo.test.js   # 7 passed
npx jest __tests__/pagesWeather.test.js             # 13 passed, unchanged assertions
```
