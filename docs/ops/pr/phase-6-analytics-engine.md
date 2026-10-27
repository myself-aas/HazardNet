# Phase 6 — Owner binds Analytics Engine · `chore/action-12-close`

**Base:** `main` @ `70a052a` → Phases 0–5. **Session branch:** `arena/02ded3da-hazardnet`.
**Date:** 2026-10-27. **Actions touched:** Action 12 (rewritten `Do`/`Verify`, Phase 6 row,
status), change log, `docs/ENVIRONMENT_SECRETS.md`, `docs/ops/deployment.md` §7,
`docs/ops/route-register.json`, `docs/codebase/ARCHITECTURE.md`,
`docs/codebase/INTEGRATIONS.md`.
**Actions closed: none.** Action 12 stays **Open** with an explicit, named blocker — the
dashboard binding, the Production-scoped build flag, the redeploy and the live SQL query are
owner-side and cannot be performed from this sandbox. Closing it on a stub test would be
recording an intention as a result.
**Constraint honoured:** free tier only, no new dependencies (all new scripts use `node:`
built-ins), one shared validator for both runtimes, `PUSH_TO_API` stays `false`.

## Phase table

| Phase | Branch (notional) | What it fixed | Status |
|---|---|---|---|
| 0 | `fix/openmeteo-shape-audit` | Shared normaliser, object + array contract, comments matching code | `c673472` |
| 1 | `fix/latent-route-sweep` | Reachability invariant, dated dispositions, shared query parser | `39e2e26` |
| 2 | `fix/cache-verify-then-write` | Verify-then-write on all read-through caches | `fb52e3b` |
| 3 | `test/parity-value-assertions` | Provenance fixtures + value assertions for edge integration tests | `7dd2d35` |
| 4 | `chore/disposition-latent-routes` | historical/metrics deleted, kaggle scheduled (Action 24) | `3ebbaa4` |
| 5 | `ops/site-health-verify` | Probe record lands, is served, verified; 8 sibling runtime scenarios | `288c6b2` + `b98f4bf` |
| **6** | **`chore/action-12-close`** | **Owner binds Analytics Engine Production-only; both sinks stay fail-open 204; query can be proven** | **this commit** |

## What Phase 6 changed and why

| Finding | Fix |
|---|---|
| Bindings can be scoped to **Production or Preview** in the Pages dashboard. A mistaken Preview-scoped `ANALYTICS` would write unreleased-build traffic into the production dataset, and nothing in the code could stop it. | `functions/api/v1/telemetry.ts` now has `PRODUCTION_HOSTS = {www.hazardnet.live, hazardnet.live}`. Any other hostname (`*.pages.dev`, `localhost`) with a bound `ANALYTICS` takes the log sink and emits one warning. The check uses the request the Function already has — no new binding and no untrustworthy client-side build flag. |
| `writeDataPoint` was called with no guard. A quota/dataset/transient error would turn a valid telemetry beacon into a 500 — a monitoring sink failing the product. | Wrapped in `try/catch`: the error is named once per event in `console.warn`, the event goes to the same bounded log line, and the response is still **204**. `env` itself is optional (`context.env ?? {}`), so a context without bindings also fails open. |
| The old test **asserted the bug**: `a binding that throws …` expected `rejects.toThrow('quota exceeded')`. | That test now expects 204 + warning + log fallback. `__tests__/analyticsEngineBinding.test.js` adds the Preview and no-`env` cases. |
| Analytics Engine allows **16 KB of blobs per data point**. The validator capped 20 values at 256 chars each, but **keys were unbounded** — a single 9 KB key would blow the blob budget. | `backend/utils/telemetryBatch.js` (imported by both Node and edge) rejects properties whose `JSON.stringify` exceeds `PROPERTIES_JSON_MAX = 8_192`. 8 KiB leaves >7 KiB for the event name, session id and JSON escaping. Both Node and edge suites now carry the same case. |
| The owner's SQL query used `WHERE blob2 = '<session id>'`. That works, but `index1` is the *indexed* column the writer sets (`indexes: [sessionId]`). The Verify step also omitted the SQL API endpoint and the fact that the table only exists after the first write. | Action 12 now documents `POST /accounts/{account_id}/analytics_engine/sql`, `SHOW TABLES`, and `SELECT blob1, blob2, double1 FROM hazardnet_telemetry WHERE index1 = '<session id>'`. `scripts/verify_analytics_engine.mjs` derives that query from the writer's field order and the committed fixture, so the runbook cannot drift from the code. |
| `docs/codebase/ARCHITECTURE.md` and `INTEGRATIONS.md` claimed `serverless/v1/telemetry.js` **is deleted at HEAD** and that the beacon posts to a JSON 500. The file exists and the route is a Pages Function. | Both claims corrected with the current file list, and `INTEGRATIONS.md`'s "all ABSENT" existence list was re-measured (see captured output below). A doc that says the sink is gone sends the owner looking for a handler to write. |

## Cloudflare facts used (fetched 2026-10-27, not assumed)

| Source | Fact that changed the code or the runbook |
|---|---|
| [Pages Functions → Bindings → Analytics Engine](https://developers.cloudflare.com/pages/functions/bindings/#analytics-engine) | Dashboard path is **Workers & Pages → project → Settings → Bindings → Add → Analytics engine**; variable name + dataset; **"Redeploy your project for the binding to take effect."** Bindings can be set for production **and** preview environments. **"You cannot use an Analytics Engine binding locally."** |
| [SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/) | Endpoint `POST /accounts/{account_id}/analytics_engine/sql`, bearer token with *Account · Account Analytics · Read*; table columns `dataset`, `timestamp`, `_sample_interval`, `index1`, `blob1..20`, `double1..20`; **"A new table will automatically be created for each dataset once you start writing events"** — hence `SHOW TABLES` first. |
| [Limits](https://developers.cloudflare.com/analytics/analytics-engine/limits/) | 20 blobs / 20 doubles / **one index** per `writeDataPoint`; **16 KB** of blobs per data point; **96 bytes** per index; **250 writes per invocation**; **three months** retention. |
| [Pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/) | **Workers Free**: 100,000 data points written/day, 10,000 read queries/day. No paid plan is needed — the free-tier constraint in `docs/ops/owner-actions.md` holds. |

Verbatim from the bindings page: *"You can set bindings for both production and preview
environments"* and *"Redeploy your project for the binding to take effect."* Verbatim from the
SQL API page: *"`index1` | string | The index value that was logged with the event. The value
in this column is used as the key for sampling."*

## Captured command output

### 1. The writer ↔ SQL contract

```
$ node scripts/verify_analytics_engine.mjs
{
  "schema": "hazardnet-analytics-engine-verify/v1",
  "fixture": "__tests__/fixtures/telemetryBatch.js",
  "session": "session-abc-123",
  "data_points": 2,
  "first_data_point": {
    "blobs": [
      "page_view",
      "session-abc-123",
      "{\"route\":\"/\",\"lang\":\"en\"}"
    ],
    "doubles": [ 1767000000000 ],
    "indexes": [ "session-abc-123" ]
  },
  "query": "SELECT blob1, blob2, double1 FROM hazardnet_telemetry WHERE index1 = 'session-abc-123'",
  "why_index1": "indexes:[sessionId] is Analytics Engine's single indexed column; blob2 mirrors the session but is not indexed.",
  "limits": {
    "properties_json_max": 8192,
    "blobs_per_point": "16 KB total",
    "index_bytes": 96,
    "writes_per_invocation": 250,
    "batch_cap": 50,
    "free_tier": "100,000 data points/day, 10,000 read queries/day, three months retention"
  },
  "owner_steps": [
    "POST https://api.cloudflare.com/client/v4/accounts/{account_id}/analytics_engine/sql --data \"SHOW TABLES\"",
    "POST .../analytics_engine/sql --data \"SELECT blob1, blob2, double1 FROM hazardnet_telemetry WHERE index1 = 'session-abc-123'\""
  ],
  "problems": []
}
✅ 2 data point(s) fit the free-tier limits; Action 12's SQL query matches the writer
$ echo $?
0
```

### 2. Thin dual-binding suite (every test asserts a value, not a status)

```
$ npx jest __tests__/analyticsEngineBinding.test.js --ci --runInBand
PASS __tests__/analyticsEngineBinding.test.js
  Action 12 — bound and unbound telemetry sinks
    ✓ bound on a production host: 204 and one data point carrying the fixture leaves
    ✓ unbound on a production host: 204, no writes, the same leaves in the fail-open log
    ✓ a context with no env object at all still answers 204 (fail-open)
    ✓ the apex production host is allowed too
    ✓ a Preview host with a bound ANALYTICS never reaches the production dataset
    ✓ a binding that throws is caught: the event is logged and the beacon still gets 204
    ✓ properties that would exceed the 16 KB blob budget are refused with a named error
  Action 12 — owner runbook and code contract
    ✓ the Function keeps the production allowlist, the optional env and the catch
    ✓ Action 12 documents the real dashboard path, the redeploy, and a query that can work
    ✓ the codebase docs no longer claim the Node telemetry handler is deleted
    ✓ the deployment runbook names the Production-only binding and the SQL verification
    ✓ scripts/verify_analytics_engine.mjs derives the owner SQL from the writer shape

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
```

### 3. Both runtimes still agree

```
$ npx jest __tests__/analyticsEngineBinding.test.js __tests__/pagesTelemetry.test.js __tests__/api/telemetry.test.js __tests__/routeValueAssertions.test.js __tests__/routeReachability.test.js --ci --runInBand
PASS __tests__/analyticsEngineBinding.test.js
PASS __tests__/pagesTelemetry.test.js
PASS __tests__/routeValueAssertions.test.js
PASS __tests__/api/telemetry.test.js
PASS __tests__/routeReachability.test.js

Test Suites: 5 passed, 5 total
Tests:       62 passed, 62 total
```

### 4. Re-measuring the stale codebase claim

```
$ for f in serverless/v1/telemetry.js serverless/metrics.js scripts/setup_monitoring.sh scripts/fetch_live_wind.mjs scripts/security_audit.sh scripts/npm-audit-ci.mjs scripts/validate_env.mjs utils/logger.js; do test -e "$f" && echo "PRESENT $f" || echo "ABSENT  $f"; done
PRESENT serverless/v1/telemetry.js
ABSENT  serverless/metrics.js
ABSENT  scripts/setup_monitoring.sh
PRESENT scripts/fetch_live_wind.mjs
ABSENT  scripts/security_audit.sh
PRESENT scripts/npm-audit-ci.mjs
PRESENT scripts/validate_env.mjs
ABSENT  utils/logger.js
```

### 5. Full verification matrix

```
$ npx jest --ci --silent
Test Suites: 2 skipped, 195 passed, 195 of 197 total
Tests:       24 skipped, 2106 passed, 2130 total

$ npx tsc -p frontend/tsconfig.json --noEmit
$ echo $?
0
$ npx tsc -p functions/tsconfig.json --noEmit
$ echo $?
0
$ node scripts/build_freshness_artifact.mjs --check
[freshness] --check: artifact matches its inputs (stale overall).
$ echo $?
0
```

## Owner steps — exact, with expected output

Nothing below was run from this sandbox. Each line is a command for the account owner; the
expected output is what must be pasted into Action 12 before it can be closed.

```bash
# 1. Bind (dashboard, Production scope ONLY):
#    Workers & Pages → hazardnet → Settings → Bindings → Add → Analytics engine
#      Variable name: ANALYTICS     Dataset: hazardnet_telemetry
#    Workers & Pages → hazardnet → Settings → Variables and Secrets → Add
#      VITE_ANALYTICS_ENABLED = true   (Production only; NOT a secret)
#    Then trigger a Production redeploy — the binding is inactive until then.

# 2. A valid beacon must be acknowledged (204 proves the fail-open path, not the sink):
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'content-type: application/json' \
  --data '{"sessionId":"action12-probe-20261027","events":[{"event":"page_view","at":1767000000000,"properties":{"route":"/"}}]}' \
  https://www.hazardnet.live/api/v1/telemetry
# expected: 204

# 3. Read-only token: dashboard → API tokens → Create Custom Token
#      Account | Account Analytics | Read
#    Store it outside this repository. Never a Pages variable, never in a log.
export CF_ACCOUNT_ID=<32-char-account-id>
export CF_ANALYTICS_TOKEN=<token>
SQL=https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/analytics_engine/sql

curl -sS "$SQL" -H "Authorization: Bearer $CF_ANALYTICS_TOKEN" --data 'SHOW TABLES'
# expected: hazardnet_telemetry appears (created on the first successful write)

curl -sS "$SQL" -H "Authorization: Bearer $CF_ANALYTICS_TOKEN" --data \
  "SELECT blob1, blob2, double1 FROM hazardnet_telemetry WHERE index1 = 'action12-probe-20261027' FORMAT JSON"
# expected: one row — blob1 = "page_view", blob2 = "action12-probe-20261027",
#           double1 = 1767000000000

# 4. The Preview deployment must NOT write to the dataset. Repeat step 2 against a
#    *.pages.dev URL with a different session id, then query that id in step 3.
#    Expected: an empty result, plus one "[telemetry] ANALYTICS is bound on a
#    non-production host" warning in `wrangler pages deployment tail`.

# 5. No sink failures:
npx wrangler pages deployment tail --project-name=hazardnet
# expected: no "ANALYTICS.writeDataPoint failed" lines
```

**Why Action 12 is still Open:** step 1 is a dashboard action, step 3 needs a read-only
Cloudflare API token and account id, and step 4 needs a Preview deployment. This sandbox has
no Cloudflare credentials, cannot create a binding or a deployment, and Cloudflare's own docs
say an Analytics Engine binding **cannot be used locally** — so the bound path is proven only
against a stub here. Action 9 (scheduled probe record) and Action 24 (Kaggle R2 artifact)
also remain open; no phase in this sweep closes an action on unverified evidence.

## Done-criteria roll-up (all seven phases)

| Criterion | Where it is enforced |
|---|---|
| Normaliser JSDoc/code divergence extinct; every export has object + array fixtures | `backend/utils/openMeteo.js` + `backend/utils/__tests__/openMeteo.test.js` (Phase 0) |
| No unreachable-and-unexercised route; reachability invariant | `docs/ops/route-register.json` + `__tests__/routeReachability.test.js` (Phase 1), deletions in Phase 4 |
| All cache writes guarded; post-read guard; hollow-point fixture permanent | `backend/utils/cacheContract.js` + `__tests__/cacheContract.test.js` (Phase 2) |
| No parity test structural-only; provenance lint | `docs/ops/test-quality-manifest.json` + `__tests__/testQuality.test.js` (Phase 3) |
| Scheduled site-health run updates `latest.json` with `weather_api`, no Pages build | `site-health.yml` + `scripts/verify_site_health_record.mjs` + `scripts/copy-dist.mjs` (Phase 5); **owner must still observe one scheduled run** |
| Analytics Engine Production-only bound/queryable/fail-open 204 | `functions/api/v1/telemetry.ts` + `__tests__/analyticsEngineBinding.test.js` (Phase 6); **binding + SQL query owner-side, Action 12 Open** |
