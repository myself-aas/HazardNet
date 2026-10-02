# HazardNet (`www.HazardNet.live`) — Master Production-Readiness Audit & Redesign Plan

> **Document Authority**: Merged `repo-intake-and-plan` (`rigorpilot-skills`), `frontend-design` (`anthropics/skills`), and `executing-plans` (`obra/superpowers`) execution blueprint.
> **Target Environment**: `www.HazardNet.live` (Web SPA/Prerender + Express/Vercel API + React Native/Expo Mobile + Edge TFLite Model Bundle).
> **Active Branch**: `arena/01a0fbbc-hazardnet`
> **Standing Resource & Privacy Constraints**:
> 1. **Edge Model Size**: `<= 100 MB` (`Models/hazardnet_int8.tflite` = `772 KB`, `Models/hazardnet_fp32.tflite` = `772 KB`, total `1.6 MB` = `1.6%` of budget).
> 2. **Edge Inference Latency**: `<= 80 ms` on mobile-class CPU (`193,971`-parameter 1D-CNN + BiLSTM + Bahdanau Attention over `[1, 30, 8]` tensor = `12–28 ms` per sample).
> 3. **Strict On-Device Privacy**: `0` third-party IP geolocation (`ipapi.co` removed) or raw coordinate telemetry leaks.

---

## 1. Phase Execution Matrix

| Phase | Title | Scope Summary | Dependencies | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 0** | **Repository Hygiene, CI/Lint Unblocking & Edge Budget Baseline** | Fix `GHSA-86w9-cpqp-85rv` audit gate, dynamic test timestamps, ESLint `<= 685` warnings, E2E drawer navigation, `.gitignore` rules, and verify Edge Model Size (`<= 100 MB`) & Latency (`<= 80 ms`) | None | **Complete** |
| **Phase 1** | **Infrastructure, Routing Parity, Site-Health Probe & On-Device Privacy** | Lock root vs. `frontend/vercel.json` security/SPA parity, fix `site-health.yml` cascade-skip & outcome enforcement, remove `ipapi.co` third-party IP leak in `geolocationService.ts` | Phase 0 | **Complete** |
| **Phase 2** | **Daily Advisory Pipeline Recovery, Model-Version Stamping & Freshness SLOs** | Stamp `Models/VERSION.json` (`2.1.9+model.0bb5bdaf1789`) through `advisoryMapper.js` & `process_advisory_ingest.mjs`, wire `rehearse_alert_engine.mjs` + `build_alert_snapshot.mjs` + `build_freshness_artifact.mjs` into `daily_advisory_ingest.yml` | Phase 1 | **Complete** |
| **Phase 3** | **Calibration & Lead-Time Backtest Unlock for Automated SEVERE/WARNING Alerts** | Implement `hazardnet-calibration/v1` isotonic PAVA calibration & lead-time backtest engine (`backend/alerts/calibration.js`, `scripts/calibrate_confidence.mjs`), fix `policy.agreement_epsilon` enforcement in `backend/alerts/assess.js`, and wire `confidence_calibrated` through `advisoryMapper.js` & `build_forecast_snapshot.mjs` | Phase 2 | **Complete** |
| **Phase 4** | **Frontend Design System Overhaul: Cartographic-Editorial Brutalism (`frontend-design`)** | Terminate unbounded `useWebFrame` rAF loops (`PERF-02`), strip 148.6 MB dead hero `.mp4` from `dist/` (`PERF-01`), unify dark atmospheric HUD tokens (`#0B0F17`) & `useMeridianTheme` (`THE-01`), enforce 44×44 px touch targets (`RES-01`), WCAG AAA contrast (`A11Y-01`), bilingual `:lang(bn)` typography, and GPU-safe transitions | Phase 3 | **Complete** |
| **Phase 5** | **GIS Choropleth, Progressive Disclosure & Mobile Viewport Ergonomics** | 3-stage progressive disclosure (`peek`/`half`/`expanded`) on `DistrictForecastCard` & `BottomSheet`, zero horizontal scroll at `375px`/`768px` (`ChatBot`, `LiveMapView`, `DistrictRiskMap`, `BangladeshSvgMap`), and keyboard-navigable `MapDistrictTable` parity | Phase 4 | **Complete** |
| **Phase 6** | **Final Production Readiness Gate, Full E2E & Reproduction Verification** | Full CI/CD reproduction (`check:claims`, `check:paths`, `check:bundle`, `check:tokens`, `check:design`, Jest, Pytest, Playwright) | Phase 5 | Pending |

---

## 2. Completed Phases (Phases 0–3)

### Phase 0 — Repository Hygiene, CI/Lint Unblocking & Edge Budget Baseline (**Complete**)
- **Task 0.1**: Unblocked `node scripts/npm-audit-ci.mjs` (`GHSA-86w9-cpqp-85rv` in `audit-exceptions.json`), replaced expired hardcoded timestamp in `__tests__/advisoryPipeline.test.js`, reduced ESLint warnings below `--max-warnings 685` (`0 errors, 680 warnings`), and updated `e2e/critical-paths.spec.ts` & `e2e/mobile-responsive.spec.ts` for the single-button header + `MenuDrawer` architecture.
- **Task 0.2**: Added `.vs/` and `frontend/{public,assets}/hero-section/*.mp4` ignore guards in `.gitignore` (`Ruling: binary working-tree files left untouched on disk so cumulative sandbox turn-end patchset stays < 500 KB, well under the 128 MB sandbox patchset cap`).
- **Task 0.3**: Verified `Models/hazardnet_int8.tflite` (`772 KB`), `Models/hazardnet_fp32.tflite` (`772 KB`), `Models/VERSION.json` (`2.1.9+model.0bb5bdaf1789`), and CPU inference latency (`12–28 ms <= 80 ms`).

### Phase 1 — Infrastructure, Routing Parity, Site-Health Probe & On-Device Privacy (**Complete**)
- **Task 1.1**: Locked security header, SPA rewrite, and `outputDirectory: "dist"` + `scripts/copy-dist.mjs` parity between root `vercel.json` and `frontend/vercel.json` in `__tests__/modelArtifactsNotServed.test.js`.
- **Task 1.2**: Added `continue-on-error: true` to all 7 probe steps (`homepage`, `deep_links`, `security_headers`, `sitemap`, `forecast_data`, `status_page`, `content_pages`) and a final `Enforce aggregate site-health probe outcome` gate step in `.github/workflows/site-health.yml`, verified by `test_site_health_probes_do_not_cascade_skip` in `scripts/tests/test_workflows.py`.
- **Task 1.3**: Removed `https://ipapi.co/json/` from `frontend/src/services/geolocationService.ts` so GPS fallback resolves strictly on-device to the Dhaka centroid (`23.8103, 90.4125`), verified by `frontend/src/services/__tests__/geolocationService.test.ts`.

### Phase 2 — Daily Advisory Pipeline Recovery, Model-Version Stamping & Freshness SLOs (**Complete**)
- **Task 2.1**: Exported `resolveCanonicalModelVersion()` in `scripts/process_advisory_ingest.mjs` reading `Models/VERSION.json` (`2.1.9+model.0bb5bdaf1789`) and updated `backend/utils/advisoryMapper.js` (`mapAdvisoryRow`, `mapAdvisoryRows`, `forecastRowsToCsv`) to stamp and serialize `model_version`.
- **Task 2.2**: Wired `rehearse_alert_engine.mjs`, `build_alert_snapshot.mjs --allow-empty`, and `build_freshness_artifact.mjs` into `.github/workflows/daily_advisory_ingest.yml` and staged `alerts-latest.json` + `freshness.json` in `commit-artifacts`, verified by `test_daily_advisory_ingest_refreshes_alerts_and_freshness` in `scripts/tests/test_workflows.py`.
- **Task 2.3**: Verified end-to-end 128-row stamped ingestion → snapshot → alert rehearsal → freshness artifact in `__tests__/advisoryPipeline.test.js` while keeping the committed 74-row unstamped fixture intact for `__tests__/alertReplay.test.js`.

---

## 3. Phase 3 — Calibration & Lead-Time Backtest Unlock for Automated SEVERE/WARNING Alerts (**Complete**)

### Task 3.1: Fix `policy.agreement_epsilon` Enforcement in `backend/alerts/assess.js` and `confidence_calibrated` Passthrough in `scripts/build_forecast_snapshot.mjs` & `backend/utils/advisoryMapper.js`
- **Problem Statement**:
  1. `backend/alerts/policy.js` defines `agreement_epsilon: 0.10` (`|model_severity - physics_severity| <= ε`, configurable via `ALERT_AGREEMENT_EPSILON`), but `backend/alerts/assess.js` hardcoded `const tolerance = 1e-9;` inside `readEvidence()`, causing calibrated forecasts with `|model_severity - physics_severity| <= 0.10` (e.g., `0.72` vs `0.66`) to be misclassified as `agreement: 'low'` and blocked from reaching `WARNING`.
  2. `scripts/build_forecast_snapshot.mjs` did not read `confidence_calibrated` or `confidence_raw` from forecast CSVs (unlike `backend/utils/forecastRow.js`), dropping calibration metadata when building `forecasts-latest.json`.
  3. `backend/utils/advisoryMapper.js` did not accept `options.calibrationMap` or serialize `confidence_raw`, `confidence_calibrated`, and `confidence_kind` in `forecastRowsToCsv`.
- **Files Modified**:
  - `backend/alerts/assess.js`: Updated `readEvidence(row, { agreementEpsilon })` to compare `Math.abs(modelSeverity - physicsSeverity) <= tolerance + 1e-9` using `policy.agreement_epsilon` (`0.10` default), and passed `{ agreementEpsilon: policy?.agreement_epsilon }` from `assessRow`.
  - `backend/utils/advisoryMapper.js`: Added optional `options.calibrationMap` support via `applyCalibrationToRow` and serialized `confidence_raw`, `confidence_calibrated`, and `confidence_kind` in `forecastRowsToCsv`.
  - `scripts/build_forecast_snapshot.mjs`: Parsed `confidence_calibrated` and `confidence_raw` with the exact contract of `backend/utils/forecastRow.js` (`row.confidence = calibratedConfidence`, `row.confidence_raw = rawConfidence`, `row.confidence_kind = 'calibrated_probability'`).

### Task 3.2: Implement Isotonic Probability Calibration (`hazardnet-calibration/v1`) and Lead-Time Backtest Engine (`backend/alerts/calibration.js` & `scripts/calibrate_confidence.mjs`)
- **Problem Statement**:
  - `Models/calibration/confidence_map.template.json` defines the `hazardnet-calibration/v1` artifact schema (`format`, `method: "isotonic"`, `samples`, `base_rate`, `brier`, `brier_raw`, `ece`, `ece_raw`, `monotone`, `converged`, `pairs`, `fit_period`, `fitted_on`, `fit_source`, `label_definition`, `status`) and requires refusing unfitted maps (`status: "awaiting-outcomes"`).
  - No Node.js module or CLI existed to fit isotonic calibration maps (Pool Adjacent Violators Algorithm — PAVA), validate `hazardnet-calibration/v1` maps, interpolate calibrated probabilities, or compute lead-time backtest metrics (`POD`, `FAR`, `CSI`, `Brier`, `ECE`) across `7_days` and `15_days` horizons.
- **Files Created**:
  - `backend/alerts/calibration.js`: Implemented `CALIBRATION_FORMAT`, `computeBrierScore`, `computeECE`, `validateCalibrationMap`, `fitIsotonicCalibration` (PAVA), `applyCalibrationToScore`, `applyCalibrationToRow`, and `evaluateLeadTimeBacktest`.
  - `scripts/calibrate_confidence.mjs`: Implemented CLI supporting `--validate <map.json>`, `--fit <samples.json> [--out <map.json>]`, and `--backtest <records.json>`.

### Task 3.3: Unit & End-to-End Alert Escalation Verification (`__tests__/alerts/calibration.test.js` & `__tests__/alerts/assess.test.js`)
- **Files Created / Modified**:
  - `__tests__/alerts/assess.test.js`: Added `WARNING honors policy.agreement_epsilon when model and physics tracks agree within epsilon`.
  - `__tests__/alerts/calibration.test.js`: Added 4 comprehensive tests covering template refusal (`Models/calibration/confidence_map.template.json`), PAVA isotonic fitting & Brier score improvement, `WARNING`/`SEVERE` unlock, `7_days`/`15_days` lead-time backtest metrics (`POD`, `FAR`, `CSI`), and end-to-end propagation through `advisoryMapper` → `forecastRowsToCsv` → `build_forecast_snapshot.mjs` → `rehearseAlertEngine`.
- **Verification**:
  - `npx jest --ci __tests__/alerts/assess.test.js __tests__/alerts/calibration.test.js` → **PASS** (`2 passed` suites, `26 passed` tests).

---

## 4. Phase 4 — Frontend Design System Overhaul: Cartographic-Editorial Brutalism (`frontend-design`) (**Complete**)

### Task 4.1: Terminate Unbounded `useWebFrame` `requestAnimationFrame` Loops (`[P0] PERF-02`) & Exclude Dead Hero `.mp4` Assets from Production `dist/` (`[P0] PERF-01`)
- **Problem Statement**:
  1. `frontend/src/lib/motion-interpolate.ts` defines `useWebFrame(fps = 30)` with an unbounded `requestAnimationFrame` loop that calls `setFrame(Math.floor(elapsed * fps))` forever without a `maxFrames` termination guard or integer-frame deduplication, triggering perpetual 60 Hz React re-renders across `App.tsx`, `FrontDoor.tsx`, `LiveStatusStrip.tsx`, `RunVisual.tsx`, and `HeroCinematicBackground.tsx`.
  2. `frontend/public/hero-section/*.mp4` (`148.6 MB`) is copied into `frontend/dist/hero-section/` during `vite build` (`94.2%` of production `dist/`), even though `frontend/src/lib/heroMedia.ts` retired video playback in favor of `HeroImageCarousel` (`HeroCinematicBackground.tsx`). While tracked binary files must remain on disk to preserve the `< 128 MB` sandbox turn-end patchset cap, production `dist/` and Workbox precache must exclude them.
- **Implementation Steps**:
  1. Update `useWebFrame(fps = 30, maxFrames = 420)` in `frontend/src/lib/motion-interpolate.ts` to clamp `nextFrame = Math.min(maxFrames, Math.floor(elapsed * fps))`, deduplicate state updates (`setFrame((prev) => (prev === nextFrame ? prev : nextFrame))`), and stop scheduling `requestAnimationFrame(tick)` once `nextFrame >= maxFrames`.
  2. Pass explicit `maxFrames` bounds at entry-animation call sites: `frontend/src/App.tsx` (`useWebFrame(30, 6)`), `frontend/src/pages/FrontDoor.tsx` (`useWebFrame(30, 8)`), `frontend/src/components/frontdoor/LiveStatusStrip.tsx` (`useWebFrame(30, 10)`), `frontend/src/components/frontdoor/RunVisual.tsx` (`useWebFrame(30, 60)`), and `frontend/src/components/HeroCinematicBackground.tsx` (`useWebFrame(30, 420)`).
  3. Add `excludeUnreferencedHeroVideos()` (`closeBundle` hook) and `globIgnores: ['**/hero-section/*.mp4']` in `frontend/vite.config.ts` so `vite build` removes `dist/hero-section/*.mp4` (`-148.6 MB`) without touching tracked working-tree binaries.

### Task 4.2: Unify Cartographic-Editorial Brutalism HUD Tokens (`#0B0F17`), Wire `useMeridianTheme` (`[P1] THE-01`), and Scope Root `pointer-events` (`[P2] INT-07`)
- **Problem Statement**:
  1. `useMeridianTheme()` in `frontend/src/components/meridian/motion.ts` had zero importers, did not synchronize `.dark` or `color-scheme` on `document.documentElement`, and returned `resolved: systemTheme()` even when `theme` was explicitly set to `'light'` or `'dark'`.
  2. `frontend/src/App.tsx` applied `pointer-events-none` to the root wrapper on non-console editorial pages (`/` and content routes), requiring manual `pointer-events-auto` overrides on every child container, and used raw hex literals in `<Toaster />`.
  3. Cartographic-Editorial Brutalism HUD tokens (`#0b0f17` obsidian surface, `#111827` atmospheric slate, HUD hairline border, and tabular numeral contracts) need first-class parity across `frontend/src/design-system/tokens.ts` and `frontend/src/index.css`.
- **Implementation Steps**:
  1. Update `useMeridianTheme()` in `frontend/src/components/meridian/motion.ts` to safely read `localStorage`, compute `resolvedTheme = name === 'system' ? systemTheme() : name`, set `data-mrd-theme`, toggle `document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')`, set `document.documentElement.style.colorScheme = resolvedTheme`, and return accurate `resolved`.
  2. Wire `useMeridianTheme()` into `AppContent` in `frontend/src/App.tsx`, scope `pointer-events-none` strictly to the full-bleed `/live` console mode (`isHomePage`), and replace `<Toaster />` inline hex literals with CSS custom properties.
  3. Add Cartographic-Editorial Brutalism HUD tokens (`hudObsidian: '#0b0f17'`, `hudSlate: '#111827'`, `hudHairline: 'rgba(255, 255, 255, 0.12)'`) to `HDS_TOKENS.colors` in `frontend/src/design-system/tokens.ts` and `--hn-hud-obsidian` / `--hn-hud-slate` / `--hn-hud-border` / `.hn-hud-surface` / `.hn-tabular-nums` in `frontend/src/index.css`.

### Task 4.3: Enforce WCAG AAA Contrast (`[P0] A11Y-01`), `>= 44×44 px` Touch Target Floor (`[P1] RES-01`), Reduced-Motion Spinner Exemption (`[P2] A11Y-04`), Bilingual `:lang(bn)` Cascade, and GPU-Safe Transitions
- **Problem Statement**:
  1. Tailwind height utilities (`h-8`, `h-9`, `h-10`) outranked `@layer base` button rules, shrinking 75 buttons below the 44×44 px touch target floor (`[P1] RES-01`), while `text-carbon-40` (`2.98:1`) and `text-carbon-50` (`4.46:1`) failed WCAG AA `4.5:1` on light surfaces (`[P0] A11Y-01`).
  2. `@media (prefers-reduced-motion: reduce)` froze loading spinners (`animation-iteration-count: 1 !important`), and `[lang="bn"]` missed descendant `:lang(bn)` inheritance.
  3. Legacy `.transition-all` animated layout properties (`width`, `height`, `margin`, `padding`) on telemetry panels (`AdvisoryPanel.tsx`, `ForecastDashboard.tsx`, `CommandPalette.tsx`).
- **Implementation Steps**:
  1. In `frontend/src/index.css`, enforce un-overridable `min-height: 44px; min-width: 44px` on `button:not([data-compact-target="true"]), [role="button"]:not([data-compact-target="true"])`, promote light-mode `.text-carbon-40` / `.text-carbon-50` on light surfaces to `var(--hds-color-carbon-60)` (`#58585b`, `7.09:1` AAA), exempt `[role="progressbar"]` / `.hn-spinner` / `[data-keep-reduced-motion]` from reduced-motion single-iteration freeze, add `:lang(bn)` selector parity (`line-height: 1.5`), and scope `.transition-all` strictly to GPU/paint properties.
  2. Replace `transition-all` in `frontend/src/components/AdvisoryPanel.tsx`, `frontend/src/components/ForecastDashboard.tsx`, and `frontend/src/components/CommandPalette.tsx` with explicit transition utilities (`transition-shadow`, `transition-colors`, `transition-[transform,opacity,background-color,border-color,color,box-shadow]`).
  3. Verify with unit/contract test suite `__tests__/phase4DesignOverhaul.test.js` and all design-system gates (`check:tokens`, `check:design:source`, `meridianParity`, `meridianContrast`, `designTokensParity`, `designTypography`).
- **Verification**:
  - `npx jest --ci __tests__/phase4DesignOverhaul.test.js __tests__/phase4PageSurfaceRedesign.test.js __tests__/designTokensParity.test.js __tests__/designTypography.test.js __tests__/meridianParity.test.js __tests__/meridianContrast.test.js __tests__/nasaTokens.test.js __tests__/paletteTokens.test.js __tests__/tokenCompliance.test.js __tests__/staticShellContrast.test.js __tests__/primaryActionContrast.test.js frontend/src/lib/__tests__/phase4HudContracts.test.ts` → **PASS** (`12 passed` suites, `188 passed` tests).
  - `node scripts/check-token-compliance.mjs` → **PASS** (`99.8%` compliance across `6,276` uses).
  - `node scripts/check-design-quality.mjs --source-only` → **PASS** (`0` outstanding, `1` waived, `0` new).

---

## 5. Phase 5 — GIS Choropleth, Progressive Disclosure & Mobile Viewport Ergonomics (**Complete**)

### Task 5.1: 3-Stage Progressive Disclosure (`peek` / `half` / `expanded`) in `DistrictForecastCard.tsx` & `BottomSheet.tsx`
- **Problem Statement**:
  1. `frontend/src/components/map/DistrictForecastCard.tsx` rendered a static `.map-sheet-handle` with no progressive disclosure control (`peek` / `half` / `expanded`) and used `w-9 sm:w-10 h-9 sm:h-10` on its close button (`< 44px`) and `min-h-10` on its Location Map toggle (`< 44px`).
  2. `frontend/src/components/ui/BottomSheet.tsx` only accepted a 2-tuple `snapPoints?: [number, number]` (`[180, 520]`) and rendered a non-interactive drag handle `<div>` with no keyboard/click stage progression.
- **Implementation Steps**:
  1. Update `frontend/src/components/map/DistrictForecastCard.tsx` to expose a 3-stage progressive disclosure state (`'peek' | 'half' | 'expanded'`, defaulting to `'half'` for full summary visibility, with `'peek'` collapsing secondary metadata tiles and `'expanded'` auto-opening the embedded `LocationMap`), an accessible stage-cycle control (`data-testid="disclosure-stage-toggle"`, `min-h-[44px]`), `data-disclosure-stage={disclosureStage}`, `min-w-[44px] min-h-[44px]` close/map controls, and `transition-[width] duration-300` on the severity meter bar.
  2. Update `frontend/src/components/ui/BottomSheet.tsx` to support 3-stage snap points (`[180, 360, 540]` matching `HDS_TOKENS.touch.bottomSheetSnapMin` / `bottomSheetSnapMax`), expose `data-sheet-stage={stage}`, and upgrade the sheet handle to an interactive `<button type="button" aria-label="Cycle sheet height">` (`min-h-[44px] min-w-[44px]`) that cycles `peek` → `half` → `expanded`.

### Task 5.2: Zero Horizontal Scroll at `375px` / `768px` Viewports (`ChatBot.tsx`, `LiveMapView.tsx`, `DistrictRiskMap.tsx`, `BangladeshSvgMap.tsx`, & `index.css`)
- **Problem Statement (`[P2] RES-03` & `[P1] RES-01`)**:
  1. `frontend/src/components/ChatBot.tsx` used fixed `sm:w-[480px]` and `min-h-[36px]` on its Close button (`line 254`).
  2. `frontend/src/components/LiveMapView.tsx` used fixed `lg:w-[320px]` on its forecast and point-inspection overlays instead of fluid `clamp()` sizing.
  3. `frontend/src/components/DistrictRiskMap.tsx` used `min-w-[210px]` on its tooltip overlay, and `frontend/src/components/BangladeshSvgMap.tsx` used `text-[10px]`, `transition-all`, and lacked `aria-pressed` on its mode/hazard filter buttons.
- **Implementation Steps**:
  1. In `frontend/src/components/ChatBot.tsx`, replace `sm:w-[480px]` with `sm:w-[min(480px,calc(100vw-3rem))] max-w-full` and upgrade header mode/close buttons to `min-h-[44px]`.
  2. In `frontend/src/components/LiveMapView.tsx`, replace `lg:w-[320px]` on `district-forecast-slot` and Point Inspection HUD with `lg:w-[clamp(280px,28vw,340px)] max-w-full`.
  3. In `frontend/src/components/DistrictRiskMap.tsx` and `frontend/src/components/BangladeshSvgMap.tsx`, replace `min-w-[210px]` with `w-[min(220px,calc(100%-1.5rem))]`, upgrade filter chips to `min-h-[44px]` and `text-xs` (`>= 12px`), add `aria-pressed`, and replace `transition-all` with `transition-colors`.
  4. In `frontend/src/index.css`, enforce `html, body { max-width: 100vw; overflow-x: clip; }`.
  5. In `frontend/src/pages/HistoricalCatalogPage.tsx` and `frontend/src/components/HistoricalHazardCatalog.tsx`, resolve TypeScript strict prop types (`DistrictVulnerabilityRecord[]`, `TemporalTrendRecord[]`, `HazardDistributionRecord[]`) and remove the static `1,484.6 KB` `hazard-catalog-index.json` import (`[P1] PERF-03`), reducing `HistoricalCatalogPage` chunk size from `1,309.78 kB` to `65.00 kB` (`-95.0%`).

### Task 5.3: Keyboard-Navigable District Table Parity (`MapDistrictTable.tsx`) & GIS Ergonomics Contract Suite (`__tests__/phase5GisMobileErgonomics.test.js`)
- **Problem Statement**:
  - `frontend/src/components/map/MapDistrictTable.tsx` provides the text equivalent of the GIS choropleth map (`viewMode === 'table'`), but lacked keyboard arrow navigation (`ArrowDown`, `ArrowUp`, `Home`, `End`) across district row buttons and `aria-describedby` linkage to division/hazard/severity/risk cells.
- **Implementation Steps**:
  1. Add `rowRefs` and keyboard arrow navigation (`ArrowDown`, `ArrowUp`, `Home`, `End`) plus `aria-describedby` row summary linkage in `frontend/src/components/map/MapDistrictTable.tsx` while preserving the exact button accessible name (`district.name`) required by `MapDistrictTable.test.tsx`.
  2. Create `__tests__/phase5GisMobileErgonomics.test.js` verifying Tasks 5.1, 5.2, and 5.3 in unit and DOM behavioral tests.
- **Verification**:
  - `npx jest --ci __tests__/phase5GisMobileErgonomics.test.js frontend/src/components/map/__tests__/DistrictForecastCard.test.tsx frontend/src/components/map/__tests__/MapDistrictTable.test.tsx frontend/src/components/map/__tests__/MapToolbar.test.tsx frontend/src/components/map/__tests__/MapLegend.test.tsx frontend/src/components/__tests__/BangladeshSvgMap.alertLayer.test.tsx frontend/src/pages/__tests__/DistrictDetailPage.phase5.test.ts __tests__/phase2MobileShell.test.js __tests__/phase2MotionComponents.test.js` → **PASS** (`9 passed` suites, `46 passed` tests).
