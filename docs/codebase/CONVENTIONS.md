# Coding Conventions

> Updated 2026-09-14 after owner decisions and remediation. [ADR 0009](../adr/0009-firebase-model-and-deployment-contract.md) is canonical. [Audit results and limits](../audits/2026-09-14-firebase-remediation.md); [rollout checklist](../ops/firebase-model-rollout.md). Source review is not production certification.

## 1) Naming Rules
Observed: PascalCase React screens/types (`Dashboard.tsx`, `ForecastRow`); camelCase functions/modules (`parseBulkQuery`, `forecastServe.js`); `use*` hooks; uppercase env/constants (`VALID_HORIZONS`); mixed snake/kebab-case scripts. Evidence: `frontend/src/pages/`, `frontend/src/lib/forecasts.ts`, `backend/utils/forecastRow.js`, `scripts/`.

## 2) Formatting and Linting
Prettier: 120 columns, two spaces, single quotes, semicolons, trailing commas, LF (`.prettierrc`). ESLint recommended JS/TS + TSX Hooks; warnings for any/unused symbols with underscore exemptions; no universal import order. Backend console allowed. Strict frontend TS, ESNext/bundler resolution, skipLibCheck (`frontend/tsconfig.json`). Commands: `npm run lint`, `npm run lint:eslint`, `npm run format`. Current check: 0 lint errors, 276 warnings; not zero-warning compliance.

## 3) Import and Module Conventions
ESM manifests; backend explicit `.js`, frontend extensionless relatives/type-only imports and `@/` alias. Jest/Babel configs use CJS. Server-only `backend/admin.js` must not enter frontend bundles. No enforced barrel policy; `frontend/src/lib/firebase.ts` is a compatibility re-export.

## 4) Error and Logging Conventions
HTTP guards return JSON/status codes; API key timing-safe/fail-closed (`apiKeyAuth.js`). Invalid auth tokens become anonymous requests with lower rate allowance (`firebaseAuth.js`). Model inference failures never fabricate output; UI clears previous result before upload (`UploadPage.tsx`). Forecast/advisory fallback is separate from model classification.

Express logs JSON timestamp/level/requestId/method/path/status/duration and returns X-Request-Id; query string is now excluded (`requestId.js`). Other modules use console and `utils/logger.js`. [TODO] Central retention/redaction policy and all serverless internal-error envelopes remain incomplete. Never log connector config, subscription keys or service credentials.

## 5) Testing Conventions
Jest root and colocated frontend `*.test.*`; backend Node docblocks; Firestore mocked for units with reset hooks. Separate `tests/firestore-rules.test.mjs` uses Node runner and emulator. Python `test_*.py`; Playwright `e2e/*.spec.ts`. Coverage gates 32/35/30/31 statements/branches/functions/lines, scoped to backend/API/frontend-utils; frontend-only CI disables those global floors. No tests should reintroduce synthetic production prediction fallbacks.

## 6) Evidence
- `.prettierrc`, `eslint.config.js`, `frontend/tsconfig.json`, `jest.config.cjs`
- `backend/middleware/requestId.js`, `backend/utils/apiKeyAuth.js`, `backend/inference.js`
- `frontend/src/pages/UploadPage.tsx`, `tests/firestore-rules.test.mjs`, `model_service/test_model.py`
