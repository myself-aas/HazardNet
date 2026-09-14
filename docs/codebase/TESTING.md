# Testing Patterns

> Updated 2026-09-14 after owner decisions and remediation. [ADR 0009](../adr/0009-firebase-model-and-deployment-contract.md) is canonical. [Audit results and limits](../audits/2026-09-14-firebase-remediation.md); [rollout checklist](../ops/firebase-model-rollout.md). Source review is not production certification.

## 1) Test Stack and Commands
Jest 29/Babel-Jest 30, Testing Library, Supertest, Node test runner + Firebase emulator, pytest, Playwright. Exact constraints: package manifests and Python requirements.
```sh
npm test -- --runInBand --coverage
npm --prefix frontend test
npm run test:rules                          # requires Java 21
python -m pytest scripts/tests model_service -q
npm run build
E2E_BASE_URL=http://localhost:4173 npm run test:e2e # start preview separately
```

## 2) Test Layout
Root `__tests__` API/unit suites; frontend colocated `__tests__`; `tests/firestore-rules.test.mjs` separate from Jest; Python scripts/model_service tests; `e2e/*.spec.ts` desktop/mobile Chromium. `jest.setup.ts` adds jest-dom/text encoder globals. Playwright has no automatic webServer; CI starts preview. Load scenarios live in `load-tests/` and `scripts/bench-predict.mjs`.

## 3) Test Scope Matrix
| Scope | Present/executed | Limits |
|---|---|---|
| Unit/API/component | 46 suites, 432 tests passed | Firebase largely mocked; not production certification |
| Python pipeline/model | 36 passed | Real artifact/HTTP contract tested with synthetic data, not scientific accuracy |
| Rules authorization | Implemented, local run blocked by missing Java | Required CI job; must pass before deploy |
| Browser E2E | Configured, not run locally | Chromium download failed; CI remains gated |
| Performance | Scenarios present | [TODO] Representative trained-model latency/load |

## 4) Mocking and Isolation Strategy
`forecastStore.test.js` resets store/mocks, now covers 1014 rows/weather passthrough and failed publication without deletion. `inference.test.js` mocks authenticated upstream responses and checks artifact/output rejection; Python executes actual weights. Rules suite uses isolated demo project, two users/admin/anonymous with cleanup. No live production data/credentials used in these tests.

## 5) Coverage and Quality Signals
Measured configured scope: 59.60% statements, 58.62% branches, 60.00% functions, 59.80% lines. Floors remain 32/35/30/31, not raised speculatively. Collection includes backend/API/frontend-utils, not all SPA UI. TS/build/bundle/RAG/env checks passed; lint 0 errors/276 warnings. Production audit: 0 critical/high without exceptions; 4 moderate findings remain.

[TODO] Rules emulator results, browser regression run, actual Vercel deploy, real Firebase Admin writes, representative TIFF outputs and provider delivery tests. Audit report records blocked commands and remaining risk. Tests superseding SQL-adapter/heuristic assertions now target current Firebase/model contracts; legacy SQL artifact tests remain historical checks.

## 6) Evidence
- `jest.config.cjs`, `jest.setup.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`
- `__tests__/inference.test.js`, `__tests__/forecastStore.test.js`, `__tests__/deploymentParity.test.js`
- `tests/firestore-rules.test.mjs`, `model_service/test_model.py`, `frontend/src/lib/__tests__/tensorUpload.test.ts`
