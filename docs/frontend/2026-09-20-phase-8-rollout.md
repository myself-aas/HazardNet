# Phase 8 — Controlled rollout (2026-09-20)

**Spec:** `docs/frontend/2026-09-20-taste-driven-ui-ux-plan.md` §5 Phase 8, §8.3–8.4, §11.  
**Branch:** `arena/01a0bfa7-hazardnet`  
**Rule:** Reference slice (`/upload`) first. Never roll back stored-only inference or the research embargo to recover an old visual.

## What this slice ships

| Item | Evidence |
|---|---|
| Release gate | `npm run check:ux-release` → `scripts/check-ux-release.mjs` |
| Source contracts | `frontend/src/lib/__tests__/phase8Contracts.test.ts` |
| Integrity pins | `/` vs `/live`, `RunVisual` hero (no Unsplash/Pexels), `StoredForecastPanel` + no `type="file"` on lookup, `fetchStoredPrediction`, BrandPanel `64` and `<100ms` |
| Existing gates chained | `check:embargo`, `check-claims`, `check:phase7` (viewport, shipped SW HTML skip, Playwright discovery) |

This is an **engineering** rollout control. It does not deploy production, does not invent field CWV, and does not sign off AT.

## Preview (lab)

Vite preview does not provide Express APIs. Browser-facing code must keep relative `/api` URLs.

```bash
npm run check:ux-release
npx tsc --noEmit -p frontend/tsconfig.json
./node_modules/.bin/jest --config jest.config.cjs --runInBand \
  frontend/src/lib/__tests__/phase7Contracts.test.ts \
  frontend/src/lib/__tests__/phase8Contracts.test.ts \
  frontend/src/lib/__tests__/i18n.test.ts \
  frontend/src/pages/__tests__/UploadPage.test.tsx \
  frontend/src/components/auth/__tests__/BrandPanel.test.tsx
npm --prefix frontend run preview -- --host 0.0.0.0 --port 4173
```

`check:bundle` / `check:paths` / `check:design` remain the verify-job gates and need `frontend/dist`.

## Owner sign-off (not this environment)

- [ ] Preview walkthrough of `/`, `/upload`, `/live`, `/alerts` at 360 and 1280.
- [ ] Keyboard: skip link → language → lookup district/horizon → load.
- [ ] Source/date check on a stored row (idle ≠ unavailable; 404 = no coverage).
- [ ] Bengali critical copy — native speaker before any *new* safety string.
- [ ] Bundle diff vs last production (no >10% JS gzip without approval).
- [ ] NVDA / TalkBack on `/`, `/upload`, `/alerts`.
- [ ] Field p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 (privacy-reviewed).
- [ ] Physical-device 400% pinch-zoom.
- [ ] No private or embargoed values in review artifacts.

## Stop / rollback

| Stop | Action |
|---|---|
| Invented forecast, “live” from HTTP 200, official-warning implication | Revert the visual slice; keep stored-only HTTP. |
| Embargoed formula in public assets | `check:embargo` red; do not ship. |
| Raster-upload UI restored on `/upload` | `check:ux-release` red. |
| `/` merged into `/live` | `check:ux-release` red. |

Do **not** restore raster-upload simulation, fake probabilities, or withdrawn research UI to make an old screenshot match.
