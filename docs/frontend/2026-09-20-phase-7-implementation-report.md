# Phase 7 close-out — localisation, AT, zoom, SW cache (2026-09-20)

This slice completes the remaining **engineering** work in Phase 7 of
`docs/frontend/2026-09-20-taste-driven-ui-ux-plan.md`. The Phase 7 start
(`docs/frontend/2026-09-20-phase-7-start.md`) already landed restyle leftovers,
Playwright discovery, dictionaries, and the TypeScript SW HTML skip.

## What this slice landed

| Item | Evidence |
|---|---|
| Shipped service worker skips HTML / navigations | `frontend/public/serviceWorker.js` (the file registered at `/serviceWorker.js`). Cache bumped to `hazardnet-offline-v3` so old HTML shells are dropped on activate. Source twin: `frontend/src/serviceWorker.ts`. |
| Intl dates on remaining critical surfaces | District peak-impact window uses `useI18n().formatDate` on calendar ISO dates. Account/profile “member since” and connector “Since …” use `formatDate` (`monthYear` where the UI is month+year). |
| `formatDate` month/year | Calendar-component parse, not `Date` local midnight (`i18n.test.ts`). |
| Language toggle 44×44 | `LanguageToggle` compact and switch variants; `data-testid="language-toggle"`. |
| Zoom not locked | Viewport unchanged (no `user-scalable=no`). `html { overflow-x: clip }` plus existing `body` clip. `.hn-badge` type floor 12px. |
| AT (automated) | Skip link + drawer already in `e2e/navigation-a11y.spec.ts`. Lookup keyboard reach. axe on idle lookup in EN and BN. |
| Zoom beyond `/` | Playwright 200% on `/upload` and `/alerts`; 200%/400% still on `/`. |
| Lab profiling | `npm run check:phase7` pins viewport + shipped SW + Playwright discovery; runs `check:bundle` only when `frontend/dist/assets` exists. **Does not invent field CWV.** |

## Explicitly not done (owner)

- Driven **NVDA / TalkBack** walkthrough of `/`, `/upload`, `/alerts`.
- Field **p75 LCP / INP / CLS** on production.
- Native-speaker review of *new* Bengali safety strings — **none added** this slice.
- Physical-device 400% pinch-zoom (Playwright uses CSS `zoom`).

## Integrity

HDS, stored-forecast lookup, `/` vs `/live`, alert engine, BrandPanel `'<100ms'` / `'64'`,
National Overview composite index, and zero new photographs are unchanged.
