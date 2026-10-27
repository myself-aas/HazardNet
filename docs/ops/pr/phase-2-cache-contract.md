# Phase 2 — Cache write discipline · `fix/cache-verify-then-write`

**Base:** `main` @ `70a052a` → Phase 0 → Phase 1. **Session branch:** `arena/02ded3da-hazardnet`.
**Date:** 2026-10-27. **Actions touched:** Action 21 (cache discipline row), § Cost constraints
(no new dependency), change log, `docs/ops/deployment.md` §7.
**Actions closed:** none. `PUSH_TO_API` stays `false`.

## The mechanism, in one sentence

A write not preceded by a value assertion is what turned a single bad upstream response into
15 minutes of hollow 200s. `backend/utils/cacheContract.js` now makes that impossible for
**every read-through cache** in `functions/`, `serverless/` and `backend/`: `set()` runs the
cache's assertion before storing and returns `{ok:false, missing:[…]}` on failure; `get()`
runs the same assertion on the way out, deletes a bad entry and reports a miss so the caller
re-fetches.

`assertComplete(point)` requires numeric `latitude`/`longitude`, at least one data block
(`current`/`hourly`/`daily`) and at least one finite numeric reading inside those blocks.
A point carrying only `_meta` fails with named fields: `latitude`, `longitude`,
`one data block (current/hourly/daily)`. No test was widened to accept it.

## The failing fixture is permanent

`__tests__/cacheContract.test.js` seeds **the exact 2026-10-27 payload**
`{ id: 'dhaka', _meta: { source: 'open-meteo', current_vars: 0 } }` into the real
`openMeteo` module cache through the named `seedCacheEntry()` seam, then asserts:

1. the post-read guard rejects it (and logs `read guard rejected`),
2. a re-fetch happens (`fetch` called once),
3. the pre-write guard accepts the fresh point and the cached object now carries
   `current.temperature_2m === 31.1` and `wind_direction_10m === 173`,
4. a second read returns **the same complete object** with no second upstream call.

The mirror image is tested too: a fresh upstream response whose `current` block has only
`time` is refused at the write, throws a 502 with `missing a numeric reading`, and leaves the
cache entry absent. Equivalent failing-fixture tests cover the markdown cache (empty string
seeded → miss) and the advisory cache (`undefined` seeded → miss).

## Every write site

From `git grep -nE "cache(\.put|\.set|\.write)|CACHE\.put|KV\.put|expires" functions/
serverless/ backend/` plus the other in-memory `Map.set` writes in those trees. Six are
read-through caches and now have **both guards**; ten are not caches and carry a dated reason
in `docs/ops/cache-write-register.json`. A static test fails if a new matched write line
appears without a register entry whose snippet is present in that line.

| # | Write site | Pre-write guard | Post-read guard | Failing-fixture test | Status |
|---|---|---|---|---|---|
| 1 | `backend/utils/openMeteo.js` — `cache.set(cacheKey(coord.lat, coord.lng)` | `assertComplete` before `set()` | same assertion in `get()`; failure deletes + re-fetches | `__tests__/cacheContract.test.js` | GUARDED |
| 2 | `backend/utils/openMeteo.js` — `cache.set(key, { ts: Date.now(), data })` | `assertComplete` before `set()` | same assertion in `get()`; failure deletes + re-fetches | `__tests__/cacheContract.test.js` | GUARDED |
| 3 | `backend/middleware/markdownNegotiation.js` — `cache.set(mdPath, { ts: Date.now(), data: raw })` | `assertMarkdownContent` before `set()` | same assertion in `get()`; failure deletes + re-fetches | `__tests__/cacheContract.test.js` | GUARDED |
| 4 | `backend/middleware/markdownNegotiation.js` — `cache.set(mdPath, { ts: Date.now(), data: null })` | `assertMarkdownContent` before `set()` | same assertion in `get()`; failure deletes + re-fetches | `__tests__/cacheContract.test.js` | GUARDED |
| 5 | `backend/utils/ai_fallback_engine.js` — `advisoryCache.set(cacheKey, { timestamp: Date.now(), data: res` | `assertAdvisory` before `set()` | same assertion in `get()`; failure deletes + re-fetches | `__tests__/cacheContract.test.js` | GUARDED |
| 6 | `backend/utils/ai_fallback_engine.js` — `advisoryCache.set(cacheKey, { timestamp: Date.now(), data: heu` | `assertAdvisory` before `set()` | same assertion in `get()`; failure deletes + re-fetches | `__tests__/cacheContract.test.js` | GUARDED |
| 7 | `backend/middleware/serverlessGuard.js` — `hits.set(key, state)` | n/a — Rate-limit counter, not a value cache. The entry IS the count; zero is… | n/a | dated disposition 2026-10-27 | DISPOSITIONED |
| 8 | `backend/routes/push.js` — `subscriptions.set(subscription.endpoint` | n/a — In-memory subscription store (a write-through store, not a cache). Its… | n/a | dated disposition 2026-10-27 | DISPOSITIONED |
| 9 | `backend/alerts/store.js` — `memoryDocs.set(docData.id, docData)` | n/a — Durable store's in-memory fallback. Documents are validated by the ale… | n/a | dated disposition 2026-10-27 | DISPOSITIONED |
| 10 | `backend/forecastStore.js` — `districtMap.set(row.district_id, row)` | n/a — Request-local deduplication Map inside a single query, discarded when … | n/a | dated disposition 2026-10-27 | DISPOSITIONED |
| 11 | `backend/forecastPersistence.js` — `transaction.set(collection.doc(), row)` | n/a — Firestore batch write, not an in-memory cache. The ingest pipeline val… | n/a | dated disposition 2026-10-27 | DISPOSITIONED |
| 12 | `backend/metrics.js` — `forecastAgeHours.set(value)` | n/a — Prometheus gauge `.set`, not a cache write. Process metrics have no is… | n/a | dated disposition 2026-10-27 | DISPOSITIONED |
| 13 | `backend/security/httpHeaders.js` — `target.set(name, value)` | n/a — Headers object mutation while building the canonical policy. Not a cac… | n/a | dated disposition 2026-10-27 | DISPOSITIONED |
| 14 | `backend/server.js` — `const expires = now + 86400` | n/a — HTTP Message Signature `expires` timestamp. Matched by the grep's `exp… | n/a | dated disposition 2026-10-27 | DISPOSITIONED |
| 15 | `backend/server.js` — `expires=${expires}`;` | n/a — The signature input string embeds the `expires` value from the line ab… | n/a | dated disposition 2026-10-27 | DISPOSITIONED |
| 16 | `serverless/dispatch.js` — `new Map(Object.entries(routes))` | n/a — Immutable route table built once at module load. No writes after const… | n/a | dated disposition 2026-10-27 | DISPOSITIONED |


## Notes on the two non-weather caches

- **Markdown documents.** `null` is an explicit negative hit ("this file does not exist"),
  not a hollow value; `assertMarkdownContent` accepts it on both read and write. An empty
  string, a partially-read file or a non-string is refused and re-read.
- **Generated advisories.** A provider can return `undefined`, a string or an empty object.
  `assertAdvisory` requires an object with at least one scalar leaf. The guard's failure is
  logged with the named missing field; the caller still receives whatever the provider
  returned, but that response is **not** cached for the next ten minutes.

## Free tier / no new dependencies

`zod` is already in `package.json`, but importing it into `openMeteo.js` would put a schema
library into the Pages Functions bundle serving every weather request. The four checks in
`cacheContract.js` are hand-written, dependency-free and platform-neutral; no new service,
binding, plan or npm package. § Cost constraints records the decision. `PUSH_TO_API` stays
`false`.

## Captured command output (not summarised)

```
$ git grep -nE "cache(\.put|\.set|\.write)|CACHE\.put|KV\.put|expires" functions/ serverless/ backend/
backend/middleware/markdownNegotiation.js:149:          const guard = cache.set(mdPath, { ts: Date.now(), data: raw });
backend/middleware/markdownNegotiation.js:157:          cache.set(mdPath, { ts: Date.now(), data: null });
backend/server.js:166:  const expires = now + 86400; // 24 hours
backend/server.js:170:  const sigInput = `sig1=("@authority";req);alg="ed25519";keyid="${BOT_KEY_THUMBPRINT}";tag="http-message-signatures-directory";created=${now};expires=${expires}`;
backend/utils/openMeteo.js:456:        const guard = cache.set(cacheKey(coord.lat, coord.lng), { ts: Date.now(), data: point });
backend/utils/openMeteo.js:510:  const guard = cache.set(key, { ts: Date.now(), data });

$ npx jest __tests__/cacheContract.test.js --ci
PASS __tests__/cacheContract.test.js
  assertComplete — a _meta without a data block is a defect
    ✓ names the missing fields on the exact hollow payload (3 ms)
    ✓ accepts a real point and rejects one whose current block has no readings (1 ms)
  openMeteo cache — the poisoned-cache regression
    ✓ read guard rejects a hollow {id,_meta}, re-fetch writes a complete point, second read is complete (5 ms)
    ✓ the same guard holds for the batch path (2 ms)
    ✓ a fresh hollow upstream response is refused at the write and returned as a 502 (1 ms)
  the other two read-through caches
    ✓ markdown: empty document is refused on write and treated as a miss on read
    ✓ advisory: an empty generation is refused and a seeded one is a miss (1 ms)
  static invariant — every write site is guarded or dated in the register
    ✓ register snippets exist, and no unregistered write line exists (18 ms)
  static invariant — no unguarded cache write in the three read-through caches
    ✓ each cache is created by createVerifiedCache and each write checks its guard (1 ms)

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
Snapshots:   0 total
Time:        0.513 s, estimated 1 s
Ran all test suites matching /__tests__\/cacheContract.test.js/i.

$ npx jest backend/utils/__tests__/openMeteo.test.js __tests__/pagesWeather.test.js __tests__/routeReachability.test.js __tests__/routeValueAssertions.test.js --ci --silent
PASS __tests__/routeValueAssertions.test.js
PASS __tests__/routeReachability.test.js
PASS __tests__/pagesWeather.test.js
PASS backend/utils/__tests__/openMeteo.test.js

Test Suites: 4 passed, 4 total
Tests:       36 passed, 36 total
Snapshots:   0 total
Time:        0.792 s, estimated 1 s

$ npx jest --ci --silent (tail)
PASS frontend/src/lib/__tests__/phase8Contracts.test.ts
PASS __tests__/predict.test.js

Test Suites: 2 skipped, 192 passed, 192 of 194 total
Tests:       24 skipped, 2062 passed, 2086 total
Snapshots:   0 total
Time:        44.706 s, estimated 46 s

$ git diff --stat
 backend/middleware/markdownNegotiation.js | 35 +++++++++++++------
 backend/utils/ai_fallback_engine.js       | 38 +++++++++++++++-----
 backend/utils/openMeteo.js                | 58 ++++++++++++++++++++++++++-----
 docs/ops/deployment.md                    |  8 +++++
 docs/ops/owner-actions.md                 | 11 ++++++
 5 files changed, 121 insertions(+), 29 deletions(-)
```

## Actions closed

None. Action 21 gains the cache discipline row, § Cost constraints gains the "no new
dependency" note, and `docs/ops/deployment.md` §7 documents the guard. Phase 2's exit
criteria are met: every cache write has a pre-write guard, every read a post-read guard, the
hollow-point fixture is permanent, and the full suite is green.

## Verification matrix (this phase)

```bash
npx jest __tests__/cacheContract.test.js   # 9 passed
npx jest --ci                             # 192 suites / 2062 tests passed
```
