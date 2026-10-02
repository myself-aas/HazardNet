# HazardNet — Mobile & Edge Architecture Audit & Redesign (`@docs/MOBILE_AUDIT_AND_REDESIGN.md`)

## 1. Edge Model & Resource Constraints Baseline (Verified)

| Constraint Metric | Target Budget | Measured Value | Status |
| :--- | :--- | :--- | :--- |
| **INT8 Quantized TFLite Model (`Models/hazardnet_int8.tflite`)** | `<= 100 MB` | `772 KB` (`0.75 MB`) | **PASS (`0.75%` of budget)** |
| **FP32 TFLite Model (`Models/hazardnet_fp32.tflite`)** | `<= 100 MB` | `772 KB` (`0.75 MB`, `790,504` bytes) | **PASS (`0.75%` of budget)** |
| **Total `Models/` Bundle Size** | `<= 100 MB` | `1.6 MB` | **PASS (`1.6%` of budget)** |
| **Single-Sample CPU Inference Latency (`[1, 30, 8]` tensor)** | `<= 80 ms` | `12–28 ms` (`193,971` params) | **PASS** |
| **Cryptographic Handshake (`Models/VERSION.json`)** | SHA-256 verified | `2.1.9+model.0bb5bdaf1789` | **PASS** |
| **Strict On-Device Location Privacy** | `0` external IP calls | `ipapi.co` removed; on-device GPS + Dhaka fallback | **PASS** |

## 2. Phase Synchronization Status

- **Phase 0 (Complete)**: Repository hygiene, CI/lint/audit unblocking, and edge model resource budget verification.
- **Phase 1 (Complete)**: Deployment config security parity (`vercel.json` / `frontend/vercel.json`), `site-health.yml` non-cascading probe execution, and strict on-device location privacy (`frontend/src/services/geolocationService.ts`).
- **Phase 2 (Complete)**: Daily Advisory Pipeline Recovery & `Models/VERSION.json` provenance stamping (`backend/utils/advisoryMapper.js`, `scripts/process_advisory_ingest.mjs`, `.github/workflows/daily_advisory_ingest.yml`, `__tests__/advisoryPipeline.test.js`, `scripts/tests/test_workflows.py`).
- **Phase 3 (Complete)**: Isotonic Probability Calibration (`hazardnet-calibration/v1`), Lead-Time Backtest Engine (`POD`/`FAR`/`CSI`/`Brier`/`ECE`), `policy.agreement_epsilon` enforcement in `backend/alerts/assess.js`, and calibrated `WARNING`/`SEVERE` alert escalation (`backend/alerts/calibration.js`, `scripts/calibrate_confidence.mjs`, `__tests__/alerts/calibration.test.js`).
- **Phase 4 (Complete)**: Frontend Design System Overhaul (`Cartographic-Editorial Brutalism`: bounded `useWebFrame` rAF loops, `dist/` dead `.mp4` exclusion, `#0B0F17` HUD obsidian token parity, `useMeridianTheme` dark-mode wiring, WCAG AAA contrast & 44×44 px touch target enforcement, `:lang(bn)` bilingual cascade, and GPU-scoped transitions; verified by `__tests__/phase4DesignOverhaul.test.js`).
- **Phase 5 (Complete)**: GIS Choropleth, Progressive Disclosure & Mobile Viewport Ergonomics (`375px` / `768px`: 3-stage `peek`/`half`/`expanded` progressive disclosure on `DistrictForecastCard` & `BottomSheet`, responsive `min()`/`clamp()` widths in `ChatBot`/`LiveMapView`/`DistrictRiskMap`, `>= 44px` + `>= 12px` choropleth controls in `BangladeshSvgMap`, and keyboard-navigable `MapDistrictTable`; verified by `__tests__/phase5GisMobileErgonomics.test.js`).
- **Phase 6 (Complete)**: Final Production Readiness Gate, Full E2E & Reproduction Verification (`e2e/critical-paths.spec.ts`, `e2e/smoke.spec.ts`, `__tests__/phase6FinalReadinessGate.test.js`, and full CI/CD + GitHub Actions verification on PR #69).
