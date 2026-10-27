# Provenance — required by __tests__/testQuality.test.js; do not remove.

# Captured from backend/data/forecasts/ snapshot fallback used by `__tests__/forecastStore.test.js` on 2026-10-27 by hand from the store's documented schema.
# Shape: object — hazardnet-forecast-snapshot/v2, one synthetic row per horizon.
# To refresh: node scripts/build_climatic_hazards_summary.mjs --check, then rebuild the committed snapshot; edit this file if the store's fallback schema changes.

This is a **negative control**, not an upstream mirror: `forecastStore.test.js` needs a
fixture whose rows are deliberately different from the committed forecast snapshot, so a
fallback that accidentally reads production data fails the test. It is JSON, so its
provenance lives in this sidecar (`testQuality.test.js` accepts
`<fixture>.provenance.md` for `.json` fixtures). Its leaf value `severity_score: 0.41` is
asserted by that suite, and no upstream-matching claim is made for it.
