# Stored forecasts and durable ingestion — ADR 0009 / 0014 implementation

## Request contract

Both Express and Vercel now expose `POST /api/predict` as a **read**:

```json
{ "districtId": "dhaka", "horizon": "7_days" }
```

`district_id` may instead be a stored numeric district ID. Names/slugs are matched
with the same GAUL/current-name aliases used by the frontend. The horizon defaults
to `7_days`; only `7_days` and `15_days` are accepted. Unsupported tensor/raster
payloads return 400; missing/invalid district input returns 422; an uncovered
unit returns 404. Store/server failures return a safe 500 response, not a guessed
forecast. Successful responses are `no-store` and include producer dates.

`inference.served_from` is `stored-forecast`; inference latency and unrecorded model
version, per-class probabilities and satellite drivers are null. The existing
snapshot-backed read fallback remains available (cloud reads have a 2.5-second deadline), so “stored” does not guarantee
a current cloud row. Use the prediction/target dates to assess freshness.

Dashboard prediction panels and `/upload` now show stored results. `/upload` is a
district/horizon lookup, not a simulated raster processor. No file is uploaded or
run through a model. Offline queued tensor/raster tasks are discarded; district
lookups are only cleared from the queue after a successful response.

## Durable writes: deployment prerequisite

`backend/forecastPersistence.js` uses a **dedicated, named Firebase Admin app** for
forecast writes only. Existing client SDK reads and unrelated services remain
unchanged. In particular, conversion endpoints have not gained Admin access or
new authentication requirements. Firestore client write-deny rules stay intact.

Configure either:

- Application Default Credentials/workload identity for the hosting environment; or
- `FIREBASE_SERVICE_ACCOUNT_JSON` in the backend platform secret store.

Never put a private key in a `VITE_*` variable or commit it. Give the writer access
to Firestore in the configured Firebase project. It uses the project and database
ID in `firebase-applet-config.json`, matching the existing read client. The database
ID env fallback applies only when the config omits it. `firebase-admin` is now a
runtime dependency. Missing or invalid credentials fail ingestion; they do not
turn it into memory-only success.

A replacement executes its query, deletes and inserts in **one transaction**.
Append is also committed before acknowledgement. Replacement deletes plus inserts,
or append inserts, must total at most 500 operations; larger requests fail rather
than partially committing. A typical 128-row replacement of 128 old rows uses 256
operations. Clean up historical duplicates separately if they make a replacement
exceed that bound. Multi-request chunk uploads are not one transaction across
requests: each successful request acknowledges only its committed rows.

The local fallback is updated only after commit resolves. Commit/credential failure
rejects the store call; HTTP ingest endpoints return non-success with safe errors.
A transport timeout can still leave commit status unknown; reconcile persisted rows
before retrying non-idempotent append requests. No exactly-once delivery is claimed.

## Research embargo

The owner-classified division formula, its computed score, ranking and score-based
color encoding are removed from `NationalOverview.tsx`. Division cards are now
alphabetical summaries of counts and mean district severity. The two separately
approved presentation aggregations in ADR 0012 remain labelled.

The service-worker app cache version is bumped to discard old bundles when the new worker activates; already-offline clients must reconnect to receive the update.

The embargo gate blocks the formula phrase across public surfaces and blocks its
score/index identifiers in the reviewed component. Regression tests assert the
blocking classification. This is a guard against known patterns, not proof that
arbitrary renamed mathematical expressions could never bypass a text scanner.

## Validation and remaining operations

- Jest covers both prediction HTTP adapters, missing/invalid/uncovered inputs,
  safe error mapping, envelope fidelity, UI provenance/missing fields, persistence
  rejection, no pre-commit fallback mutation and a simulated store recreation.
- Writer tests exercise transaction ordering and operation bounds with a fake DB.
- Full build, TypeScript and lint checks are run locally; exact results appear in
  `docs/codebase/TESTING.md`.
- **Not verified:** a live cloud or emulator transaction using deployment credentials,
  deployed endpoint behavior, or browser end-to-end tests. Before deployment sign-off,
  ingest a fixture in staging, recreate the process, query it back, and revoke writer
  permission to confirm ingestion fails without changing the fallback.
- Alert engine persistence still uses the original client SDK; its separate
  permissions/schema concern is not silently solved by this forecast-only change.

Final local result: 98 Jest suites / 1,074 tests passed; build and TypeScript passed.
ESLint reported no errors (311 warnings). Claims, embargo, environment, bundle and
public-path checks passed. Conversion route code was left unchanged.
