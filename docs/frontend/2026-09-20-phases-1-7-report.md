# HazardNet UI/UX Phases 0–7 — implementation report

**Date:** 2026-09-20  
**Plan:** `docs/frontend/2026-09-20-taste-driven-ui-ux-plan.md` (owner confirmed).  
**Branch:** `arena/01a0bfa7-hazardnet`  
**Shipped commits (this branch):** `33e7e18` (Phase 6 leftovers + Phase 7 start), `4d97f2f` (Phase 7 remaining).  
**Phase 8:** `docs/frontend/2026-09-20-phase-8-rollout.md` (`npm run check:ux-release`).

This report covers **Phases 0–7**. It does not claim WCAG certification, field Core Web Vitals, or native-speaker Bengali review.

**Integrity held throughout:** NASA HDS tokens; stored-forecast HTTP (ADR 0009/0014); `/` editorial vs `/live` console; alert publication/review unchanged; BrandPanel `'<100ms'` / `64`; National Overview composite index left as ADR 0012 presentation-aggregation; **zero new photographs**.

---

## Phase 0 — Baseline, inventory, task validation

| Planned | Outcome |
|---|---|
| Route / state matrix | `docs/frontend/2026-09-20-route-state-matrix.md` — idle / loading / ready / uncovered / error per family. **Not** a screenshot audit. |
| Lookup fixtures | `frontend/src/lib/__tests__/fixtures/storedForecast.ts` (labelled test data). |
| Capture 360–1440, EN/BN, 200% zoom | **Not captured** in this environment. Review widths remain the plan’s list. |
| Value-source register | UX-11: “Compound Vulnerability” withheld on the district trend (Phase 5). Composite labels on National Overview stay under ADR 0012. |

**Exit:** P0/P1 issues in the plan §2.2 have owners and test strategies. Rendered-style screenshots remain an owner/lab action.

---

## Phase 1 — Forecast lookup (reference slice)

**Acceptance:** Idle is not “unavailable”; 404 is no coverage; rapid district changes cannot flash another district’s forecast.

| Contract | Implementation |
|---|---|
| Discriminated view state | `frontend/src/lib/forecastView.ts` — idle / loading / ready / uncovered / error. |
| Typed HTTP | `storedPrediction.ts` — 404 uncovered, 429 rate-limited, offline, server, invalid-data. AbortSignal. No retry on 404/invalid. |
| Query | `usePrediction.ts` keyed by district/horizon, not translated label. |
| Landmark | Working-tree `UploadPage` is a `<section>`, not a nested `<main>`. |
| Copy | `useI18n` lookup keys; submit is nasa-blue 44h. |
| Deep link | `?district=&horizon=` replace-state. |
| Tests | `UploadPage.test.tsx` (idle copy, axe EN/BN), `storedPrediction.test.ts`, `forecastView.test.ts`. |

**HEAD vs working tree:** Commit `4d97f2f` includes `UploadPage.test.tsx`. The restyled `UploadPage` / `forecastView.ts` / typed `storedPrediction` may still sit uncommitted in the working tree — Phase 8 must not ship a file-input raster restore in either copy.

---

## Phase 2 — HDS foundation and reference components

Lookup is the reference composition (16px body, 12px metadata floor, 0px surface radius, 2px control radius, 44×44 targets). Tokens stay in `index.css` / vendored `nasa-hds.css`. No second design system.

Spread to other surfaces happened in Phases 3–6 rather than a separate primitive library under `components/ui/`. `features/forecast/` was **not** extracted as a folder; `forecastView.ts` is the state module.

---

## Phase 3 — Navigation, shell, route transitions

| Contract | Implementation |
|---|---|
| Shared nav data | `frontend/src/lib/navigation.ts` + `navigation.test.ts`. |
| Landmarks | One app-level `<main>` for editorial; AuthLayout owns auth main; lookup is a section. Empty bottom-nav node removed in the restyled `App.tsx`. |
| Drawer | `role="dialog"`, Escape, 44×44 close — covered by `e2e/navigation-a11y.spec.ts`. |
| Skip link | First focusable; `#main-content`. |
| Playwright discovery | `playwright.config.ts` `testMatch` includes `forecast-ux` and `navigation-a11y` (UX-09). |

---

## Phase 4 — Console and map HUD

Live map HUD restyle (toolbar labels ≥12px, 44×44 closes, opaque chrome, no glass, low-bandwidth skips optional tiles) lives in the working-tree `LiveMapView.tsx` / `MapLegendUI.tsx` / `DistrictForecastCard.tsx`. `features/map/` was **not** extracted. National Overview composite index **not** restyled (embargo / ADR 0012).

---

## Phase 5 — District, alerts, evidence

Detail: `docs/frontend/2026-09-20-phase-5-implementation-report.md`.

- Fake 24h sparkline removed; Compound Vulnerability chart series withheld.
- HTML print is the primary export; PDF secondary.
- Alerts list-first; Refresh 44h; degraded banner 16px + 2px orange edge.
- Alert components restyled without changing `ALERT_UI.md` data behaviour.
- District inner-card radius/11px leftover completed in the Phase 6 leftover pass.

District page remains a large god-file; full §3 task order is only partial.

---

## Phase 6 — Front door, archive, editorial, account

Detail: `docs/frontend/2026-09-20-phase-6-implementation-report.md` and commit `33e7e18`.

- `/`: 12px eyebrows, 16/1.62 body, 44h CTAs (primary nasa-red-shade + white). `RunVisual` remains the hero. No photos.
- Auth: shimmer removed; 48h/16px inputs; submit nasa-red-shade + white; `autoFocus` only on `pointer: fine`.
- Archive / Privacy / Terms / 404: 0 radius, 16 body, 44h recovery links.
- Account/editorial inner cards (dashboard, profile, About, blogs, status): 0-radius `Card`, 48px inputs, 44px save (nasa-blue), 64–96 avatars. Save idle: “No unsaved changes.”
- BrandPanel stats **not** rewritten (`'<100ms'`, `64`).

---

## Phase 7 — Localisation, accessibility, performance hardening

Detail: `docs/frontend/2026-09-20-phase-7-start.md`, `docs/frontend/2026-09-20-phase-7-implementation-report.md`, `ACCESSIBILITY.md` §5.

| Item | Evidence |
|---|---|
| Dictionaries | `i18n.test.ts` fails on empty keys. Long-form `site-routes.json` stays EN by choice. |
| Intl dates | `formatDate` calendar-component parse; `monthYear` for member-since; district peak window uses ISO date strings. Ingestion timestamp stays London formatter. |
| Language toggle | 44×44, `data-testid="language-toggle"`. |
| Zoom | Viewport not locked. `html`/`body` `overflow-x: clip`. `.hn-badge` 12px. Playwright 200%/400% on `/`; 200% on `/upload` and `/alerts`. |
| SW | Shipped `frontend/public/serviceWorker.js` cache `hazardnet-offline-v3` skips HTML/navigations. |
| Lab gate | `npm run check:phase7` (+ bundle when `frontend/dist` exists). |

**Owner still:** NVDA/TalkBack; production p75 LCP/INP/CLS; native-speaker BN; physical 400% pinch-zoom.

---

## Verification recorded

| Check | Result |
|---|---|
| `npx tsc --noEmit -p frontend/tsconfig.json` | Clean after DistrictDetailPage `endIso` / `formatDate` fix |
| `node scripts/check-phase7.mjs` | PASS |
| Jest (Phase 6–7 slice) | 9 suites / 60 tests PASS (i18n, phase7 contracts, Upload, BrandPanel, profile, status, blogs, Phase 6 surface) |
| `check:embargo` | PASS (2 ADR 0012 composite labels classified) |
| `check-claims` | PASS |
| Field CWV / driven AT | **Not measured** |

---

## Gaps carried into Phase 8

1. Some Phase 1–5 restyle files may remain **uncommitted** beside this report — do not mix them into a visual rollback of stored-only inference.
2. `DistrictDetailPage.tsx` is still a god-file; simulated dispatch copy may remain.
3. `features/map/` extraction not done.
4. BrandPanel still advertises edge inference `<100ms` (invented metric; tests pin it).
5. Owner AT, field CWV, native-speaker BN, physical 400% zoom.
6. No new photographs unless the owner opts in on `/about` or `/use-cases` per plan §15.
