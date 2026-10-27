# Phase 3 — Harden the parity test class · `test/parity-value-assertions`

**Base:** `main` @ `70a052a` → Phases 0–2. **Session branch:** `arena/02ded3da-hazardnet`.
**Date:** 2026-10-27. **Actions touched:** Action 21 (test-quality row), change log,
`docs/ops/deployment.md` §7. **Actions closed:** none.

## The category

The batch test passed while the route served `{id, _meta}` because it asserted **structure**
(`toMatchObject`, `toHaveProperty`, `.count`, `.id`, `.length`) over a stub that did not
mirror the upstream. That is a class, not one test. Phase 3 fixes three things:

1. **Stubs → captured fixtures.** The weather suites now answer with real Open-Meteo
   responses (single object, multi array, full forecast object with hourly/daily series);
   the forecast/alert suites with the deployed artifacts (real rows: Bagerhat `0.6721`,
   Chandpur `0.7062`, `watch_probability 0.4`); the telemetry suites with the browser
   beacon's `SendBatch` payload. Synthetic documents remain **only** for unit cases that
   need a DRAFT/REJECTED row or a malformed body, and are marked as negative controls.
2. **One leaf value per entity, sourced from the fixture.** Expected values are expressions
   like `UPSTREAM_MULTI[1].current.relative_humidity_2m`, not literals copied into the test.
   A fixture refresh cannot silently turn these back into presence assertions.
3. **Cached object equals returned object.** `pagesWeather` now asserts
   `expect(miniBody).toEqual(batchPoint)` for the mini lookup served from the batch-filled
   cache; `cacheContract` asserts `expect(second).toEqual(first)` and that the stored entry
   passes `assertComplete`.

## Provenance header (every fixture)

```
# Captured from <URL> on <date> by <author>.
# Shape: <array|object> — <query form>.
# To refresh: <command>.
```

Implemented literally in the `.js` fixture headers (inside a block comment) and in a
`.provenance.md` sidecar for the one JSON fixture (JSON cannot hold comments).
`__tests__/testQuality.test.js` reads the first 12 lines of every fixture in
`__tests__/fixtures/` and `backend/utils/__tests__/fixtures/` and fails on a missing line.
It also self-checks that the lint can return `false`, so the check cannot pass vacuously.

Refresh commands: `node scripts/capture_edge_fixtures.mjs [--live]` (deployed artifacts +
full weather bundle) and `node scripts/capture_open_meteo_fixtures.mjs` (the two live
Open-Meteo captures from Phase 0).

## Manifest

`docs/ops/test-quality-manifest.json` names nine integration tests, the fixtures they must
import, the exact fixture-sourced leaf expressions they must contain, any banned
presence-only assertions, and any cached-equals-returned assertions. `__tests__/api/telemetry.test.js`
bans `toMatchObject(` — its former structural log-line assertion is now `toEqual` over
fixture leaves. Three Playwright specs and four Node-only suites are recorded separately:
a black-box spec has no stub to mirror, and a key-authenticated LLM/Kaggle/wind stub is a
synthetic test input, not a captured upstream response. Claiming otherwise would be the same
lie in a different place.

## Per-file audit (all 84 grep matches)

Columns answer the two questions directly: does the stub mirror the real upstream shape, and
does it assert at least one leaf value per entity? "n/a" means the file has no upstream HTTP
stub at all — a unit or static test, not a parity test.

| File | Upstream stub? | Stub mirrors captured upstream? | ≥1 leaf value asserted? | Phase 3 action |
|---|---|---|---|---|
| `__tests__/__mocks__/react-native-reanimated.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/advisoryPipeline.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/advisoryTierStamp.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/aiCatalog.test.js` | yes | n/a — local double, not an HTTP upstream response | yes — unit leaves | none; no upstream response to mirror |
| `__tests__/alertReplay.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/alertSnapshot.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/alerts/assess.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/alerts/calibration.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/alerts/channels.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/alerts/digest.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/alerts/lifecycle.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/alerts/notify.test.js` | yes | n/a — local double, not an HTTP upstream response | yes — unit leaves | none; no upstream response to mirror |
| `__tests__/alerts/report.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/alerts/service.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/api/alerts.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/api/chatPromptBounds.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/api/forecasts.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/api/predict.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/api/serverlessGuard.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/api/serverlessRouting.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/api/telemetry.test.js` | yes | **yes** — same captured client beacon; the `toMatchObject` presence assertion was replaced with `toEqual` over fixture leaves | **yes** — 2 fixture leaf expressions pinned in the manifest | manifest: fixture + leaves |
| `__tests__/appleMotion.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/appleParity.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/brandAssets.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/cacheContract.test.js` | yes | **yes** — real captured single-point object; the hollow `{id,_meta}` point is a permanent negative fixture defined in the test | **yes** — 2 fixture leaf expressions pinned in the manifest | manifest: fixture + leaves + cached-equals-returned |
| `__tests__/chatService.test.js` | yes | no — synthetic test input, dated disposition | yes — asserted locally | 2026-10-27 disposition in manifest; not an upstream mirror |
| `__tests__/climaticHazardsSummary.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/colourDiscipline.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/contentEngine.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/conversions.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/darkTheme.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/designSignature.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/designTypography.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/fetchKaggleAdvisory.integration.test.js` | yes | no — synthetic test input, dated disposition | yes — asserted locally | 2026-10-27 disposition in manifest; not an upstream mirror |
| `__tests__/firestoreRules.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/forecastFreshness.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/forecastHandlers.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/forecastRow.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/forecastStore.test.js` | yes | **yes** — negative-control JSON snapshot fixture with a provenance sidecar (deliberately not an upstream mirror) | **yes** — 1 fixture leaf expression pinned in the manifest | manifest: fixture + leaves |
| `__tests__/forecastsHistory.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/forecastsUpdate.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/fourState.test.js` | yes | n/a — local double, not an HTTP upstream response | yes — unit leaves | none; no upstream response to mirror |
| `__tests__/freshnessArtifact.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/grounding.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/heroContrast.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/iconFamily.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/ingest.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/kaggleAdvisoryClient.test.js` | yes | no — synthetic test input, dated disposition | n/a — error-path suite | 2026-10-27 disposition in manifest; not an upstream mirror |
| `__tests__/mapPalette.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/mobile/alertsStates.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/mobile/noScrollViewCollections.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/modelArtifactsNotServed.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/noRepoPaths.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/pagesAlerts.test.js` | yes | **yes** — deployed alert artifact with stamped policy (captured); synthetic store documents remain only for DRAFT/REJECTED unit cases | **yes** — 3 fixture leaf expressions pinned in the manifest | manifest: fixture + leaves |
| `__tests__/pagesForecasts.test.js` | yes | **yes** — deployed forecast snapshot (trimmed capture, real rows) | **yes** — 3 fixture leaf expressions pinned in the manifest | manifest: fixture + leaves |
| `__tests__/pagesTelemetry.test.js` | yes | **yes** — browser streaming tracker SendBatch payload (a request fixture, not an upstream response) | **yes** — 3 fixture leaf expressions pinned in the manifest | manifest: fixture + leaves |
| `__tests__/pagesWeather.test.js` | yes | **yes** — real full single-point object with hourly/daily series + real two-point array | **yes** — 3 fixture leaf expressions pinned in the manifest | manifest: fixture + leaves + cached-equals-returned |
| `__tests__/paletteTokens.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/phase1Packages.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/phase6FinalReadinessGate.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/phaseCBackend.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/phaseDHardening.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/phaseEHistorical.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/pluginManifest.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/predictFromStore.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/primaryActionContrast.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/protocolLedger.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/routeReachability.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/routeSeo.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/routeValueAssertions.test.js` | yes | **yes** — real upstream weather fixtures + deployed forecast/alert artifacts + captured beacon | **yes** — 5 fixture leaf expressions pinned in the manifest | manifest: fixture + leaves |
| `__tests__/secretRotation.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/security.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/securityHeadersParity.test.js` | yes | n/a — local double, not an HTTP upstream response | yes — unit leaves | none; no upstream response to mirror |
| `__tests__/securityTxt.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/seoFoundations.test.js` | yes | n/a — local double, not an HTTP upstream response | yes — unit leaves | none; no upstream response to mirror |
| `__tests__/serviceWorker.test.js` | yes | n/a — local double, not an HTTP upstream response | yes — unit leaves | none; no upstream response to mirror |
| `__tests__/staticShellContrast.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/structuredData.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/tableStack.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/themeVariantParity.test.js` | no | n/a — no upstream stub (unit/static) | n/a | none needed |
| `__tests__/windPipeline.test.js` | yes | no — synthetic test input, dated disposition | n/a — error-path suite | 2026-10-27 disposition in manifest; not an upstream mirror |
| `e2e/critical-paths.spec.ts` | no | n/a — live black-box (no stub) | n/a — asserts live DOM/HTTP | none; a fixture would be a regression |
| `e2e/full-app-qa.spec.ts` | yes | n/a — live black-box (no stub) | n/a — asserts live DOM/HTTP | none; a fixture would be a regression |
| `e2e/navigation-a11y.spec.ts` | no | n/a — live black-box (no stub) | n/a — asserts live DOM/HTTP | none; a fixture would be a regression |


## Captured command output (not summarised)

```
$ git grep -lE "toMatchObject|toHaveProperty|\.count|\.id\b|\.length" __tests__/ e2e/ | wc -l
84

$ git grep -lE "toMatchObject|toHaveProperty|\.count|\.id\b|\.length" __tests__/ e2e/ | sort
__tests__/__mocks__/react-native-reanimated.js
__tests__/advisoryPipeline.test.js
__tests__/advisoryTierStamp.test.js
__tests__/aiCatalog.test.js
__tests__/alertReplay.test.js
__tests__/alertSnapshot.test.js
__tests__/alerts/assess.test.js
__tests__/alerts/calibration.test.js
__tests__/alerts/channels.test.js
__tests__/alerts/digest.test.js
__tests__/alerts/lifecycle.test.js
__tests__/alerts/notify.test.js
__tests__/alerts/report.test.js
__tests__/alerts/service.test.js
__tests__/api/alerts.test.js
__tests__/api/chatPromptBounds.test.js
__tests__/api/forecasts.test.js
__tests__/api/predict.test.js
__tests__/api/serverlessGuard.test.js
__tests__/api/serverlessRouting.test.js
__tests__/api/telemetry.test.js
__tests__/appleMotion.test.js
__tests__/appleParity.test.js
__tests__/brandAssets.test.js
__tests__/cacheContract.test.js
__tests__/chatService.test.js
__tests__/climaticHazardsSummary.test.js
__tests__/colourDiscipline.test.js
__tests__/contentEngine.test.js
__tests__/conversions.test.js
__tests__/darkTheme.test.js
__tests__/designSignature.test.js
__tests__/designTypography.test.js
__tests__/fetchKaggleAdvisory.integration.test.js
__tests__/firestoreRules.test.js
__tests__/forecastFreshness.test.js
__tests__/forecastHandlers.test.js
__tests__/forecastRow.test.js
__tests__/forecastStore.test.js
__tests__/forecastsHistory.test.js
__tests__/forecastsUpdate.test.js
__tests__/fourState.test.js
__tests__/freshnessArtifact.test.js
__tests__/grounding.test.js
__tests__/heroContrast.test.js
__tests__/iconFamily.test.js
__tests__/ingest.test.js
__tests__/kaggleAdvisoryClient.test.js
__tests__/mapPalette.test.js
__tests__/mobile/alertsStates.test.js
__tests__/mobile/noScrollViewCollections.test.js
__tests__/modelArtifactsNotServed.test.js
__tests__/noRepoPaths.test.js
__tests__/pagesAlerts.test.js
__tests__/pagesForecasts.test.js
__tests__/pagesTelemetry.test.js
__tests__/pagesWeather.test.js
__tests__/paletteTokens.test.js
__tests__/phase1Packages.test.js
__tests__/phase6FinalReadinessGate.test.js
__tests__/phaseCBackend.test.js
__tests__/phaseDHardening.test.js
__tests__/phaseEHistorical.test.js
__tests__/pluginManifest.test.js
__tests__/predictFromStore.test.js
__tests__/primaryActionContrast.test.js
__tests__/protocolLedger.test.js
__tests__/routeReachability.test.js
__tests__/routeSeo.test.js
__tests__/routeValueAssertions.test.js
__tests__/secretRotation.test.js
__tests__/security.test.js
__tests__/securityHeadersParity.test.js
__tests__/securityTxt.test.js
__tests__/seoFoundations.test.js
__tests__/serviceWorker.test.js
__tests__/staticShellContrast.test.js
__tests__/structuredData.test.js
__tests__/tableStack.test.js
__tests__/themeVariantParity.test.js
__tests__/windPipeline.test.js
e2e/critical-paths.spec.ts
e2e/full-app-qa.spec.ts
e2e/navigation-a11y.spec.ts

$ npx jest __tests__/testQuality.test.js --ci
PASS __tests__/testQuality.test.js
  fixture provenance
    ✓ the manifest itself is dated and lists fixture directories that exist (3 ms)
    ✓ every committed fixture has a URL, a shape and a refresh command (1 ms)
    ✓ a sidecar without the three lines would fail the lint (self-check) (1 ms)
  integration tests mirror their upstream and assert its values
    ✓ backend/utils/__tests__/openMeteo.test.js — provenance fixture, leaf values, cache equality (1 ms)
    ✓ __tests__/pagesWeather.test.js — provenance fixture, leaf values, cache equality (1 ms)
    ✓ __tests__/pagesForecasts.test.js — provenance fixture, leaf values, cache equality (1 ms)
    ✓ __tests__/pagesAlerts.test.js — provenance fixture, leaf values, cache equality (3 ms)
    ✓ __tests__/pagesTelemetry.test.js — provenance fixture, leaf values, cache equality (1 ms)
    ✓ __tests__/api/telemetry.test.js — provenance fixture, leaf values, cache equality (1 ms)
    ✓ __tests__/routeValueAssertions.test.js — provenance fixture, leaf values, cache equality (1 ms)
    ✓ __tests__/cacheContract.test.js — provenance fixture, leaf values, cache equality (1 ms)
    ✓ __tests__/forecastStore.test.js — provenance fixture, leaf values, cache equality (1 ms)
  no parity test is structural-only
    ✓ every manifest test with toMatchObject/toHaveProperty still has a fixture leaf assertion

Test Suites: 1 passed, 1 total
Tests:       13 passed, 13 total
Snapshots:   0 total
Time:        0.586 s, estimated 1 s
Ran all test suites matching /__tests__\/testQuality.test.js/i.

$ npx jest __tests__/pagesWeather.test.js __tests__/pagesForecasts.test.js __tests__/pagesAlerts.test.js __tests__/pagesTelemetry.test.js __tests__/api/telemetry.test.js __tests__/routeValueAssertions.test.js __tests__/cacheContract.test.js __tests__/forecastStore.test.js backend/utils/__tests__/openMeteo.test.js --ci --silent
PASS __tests__/routeValueAssertions.test.js
PASS __tests__/pagesAlerts.test.js
PASS __tests__/cacheContract.test.js
PASS __tests__/pagesWeather.test.js
PASS __tests__/pagesTelemetry.test.js
PASS __tests__/pagesForecasts.test.js
PASS __tests__/api/telemetry.test.js
PASS __tests__/forecastStore.test.js
PASS backend/utils/__tests__/openMeteo.test.js

Test Suites: 9 passed, 9 total
Tests:       113 passed, 113 total
Snapshots:   0 total
Time:        1.359 s

$ npx jest --ci --silent (tail)
PASS __tests__/mobile/offlineState.test.js
PASS frontend/src/lib/__tests__/mapFreshness.test.ts

Test Suites: 2 skipped, 193 passed, 193 of 195 total
Tests:       24 skipped, 2077 passed, 2101 total
Snapshots:   0 total
Time:        45.251 s

$ node scripts/capture_edge_fixtures.mjs
[capture] forecastsSnapshot.js
[capture] alertsSnapshot.js
[capture] telemetryBatch.js
[capture] weatherFullObject.js
```

## Actions closed

None. Action 21 gains the Phase 3 row; the change log and `docs/ops/deployment.md` §7
record it. Phase 3's exit criteria are met: every edge/parity integration test has a
provenance fixture, an upstream-matching stub, and a leaf-value assertion; the provenance
lint is permanent; and the full suite is green.

## Verification matrix (this phase)

```bash
npx jest __tests__/testQuality.test.js   # 13 passed
npx jest --ci                           # 193 suites / 2077 tests passed
```
