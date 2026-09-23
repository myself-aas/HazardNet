# HazardNet Mobile — Phase 0 Status

**Last updated:** 2026-09-23
**Branch:** `arena/01a0cf2b-hazardnet`

## What exists here now

A functional Expo React Native root component that renders a branded placeholder
screen using only core React Native primitives + canonical NASA HDS tokens
from `@hazardnet/design-system`.

```
apps/mobile/
├── App.tsx                     ← renders; uses SafeAreaView/ScrollView/Text/View
├── app.json                    ← Expo config (SDK 51, bundle id live.hazardnet.mobile,
│                                 iOS location/camera/reminders descriptions,
│                                 Android permissions, tablet support)
├── eas.json                    ← EAS Build config
├── ci-signing.gradle           ← Android signing helper for CI
├── assets/                     ← App icons, splash (unchanged)
├── PHASE0_STATUS.md            ← this file
└── src/
    ├── assets/translations/    ← i18n resource bundle location (Phase 8)
    ├── components/             ← legacy Expressive* stubs (see note)
    ├── design-system/          ← Phase 2 native primitives (Box, Text, Card, etc.)
    ├── hooks/                  ← Custom hooks (Phase 2+)
    ├── lib/                    ← Platform integrations and helpers (Phase 2+)
    ├── navigation/             ← React Navigation config (Phase 2)
    ├── screens/                ← Feature screens (Today, Alerts, Map, Saved, More)
    ├── state/                  ← Zustand stores (Phase 2)
    └── theme/                  ← Light/dark/OLED theme providers (Phase 2)
```

## Known gaps (deferred to later phases)

1. **`tsconfig.json` and `babel.config.js`** — Phase 2 adds a mobile-specific
   TypeScript config (extending the root) and ensures Reanimated/gesture-handler
   Babel plugins are loaded. Workspace-level tsc will then cover `apps/mobile`.
2. **Navigation shell** — Phase 2 wires React Navigation with the 5-tab IA
   (Today/Alerts/Map/Saved/More), native stacks per tab, deep links.
3. **Native primitives** — Phase 2 builds `Box/Text/Button/Card/Chip/Sheet` on
   top of `HDS_NASA_TOKENS`. The placeholder App.tsx uses inline StyleSheets
   so it does not depend on those primitives being finished.
4. **TanStack Query, Zustand, MMKV** — Phase 2 (shell) / Phase 4 (offline cache).
5. **Map, push notifications, camera** — Phases 5, 6, 7 respectively.

## Legacy files note

The three components in `src/components/`
(`ExpressiveBentoCard.tsx`, `ExpressiveBottomSheet.tsx`,
`ExpressiveFloatingControlBar.tsx`) return plain JS-object descriptors instead of
React elements. They were authored against an abandoned design direction (M3
expressive/bento) and are NOT used by the new App.tsx. They remain in place to
avoid breaking any external imports (e.g., `apps/windows`). Phase 2 does not
repair them; it replaces them with HDS-compliant primitives. If nothing imports
them by the end of Phase 2, they can be deleted.

## Running

Phase 0 has not run `npm install` in this sandbox. To run locally (on your
machine, outside this sandbox):

```bash
npm install           # workspace install from repo root
npm run start --workspace @hazardnet/mobile
# then scan QR with Expo Go (iOS/Android), or:
npm run ios --workspace @hazardnet/mobile
npm run android --workspace @hazardnet/mobile
```

After Phase 2's TypeScript + Babel config lands, `npm run lint` and `npx tsc`
will cover this package; until then, edits to App.tsx must be verified by
running the app.

## What is committed

- Canonical NASA HDS tokens (`HDS_NASA_TOKENS`) added to
  `packages/design-system/src/tokens.ts` as additive exports.
- 4-step alert policy taxonomy (`ALERT_LEVELS`, `alertLevelForScore()`) added
  to the same file.
- Data-state enum (`DataState`) for the 12 freshness/offline states from
  the redesign plan §7.
- Placeholder `App.tsx` that renders without errors and communicates the
  product's purpose, the severity system, emergency numbers, and the roadmap.
- Directory scaffold for all Phase 2+ work.
- Architecture decision record:
  `docs/architecture/decisions/ADR-001-phase0-foundations.md`
- Execution ledger: `docs/phase0/PHASE0_LEDGER.md`
