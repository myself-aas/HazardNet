# Coding Conventions

## Core Sections (Required)

### 1) Naming Rules

| Item | Rule | Example | Evidence |
|------|------|---------|----------|
| Files (Components) | PascalCase with `.tsx` extension | `DistrictDetailPanel.tsx`, `HeroVideoPlayer.tsx` | `frontend/src/components/DistrictDetailPanel.tsx` |
| Files (Utilities / Modules) | camelCase with `.js` or `.ts` extension | `forecastStore.js`, `advisoryMapper.js`, `forecastFreshness.js` | `backend/forecastStore.js`, `backend/utils/forecastFreshness.js` |
| Files (Scripts) | kebab-case or snake_case with `.mjs` or `.py` | `build_forecast_snapshot.mjs`, `check-bundle.mjs` | `scripts/build_forecast_snapshot.mjs`, `scripts/check-bundle.mjs` |
| Functions / methods | camelCase describing action | `refreshForecastAgeGauge()`, `getLatestForecasts()` | `backend/forecastStore.js:85`, `backend/utils/forecastFreshness.js:15` |
| Types / interfaces | PascalCase without `I` prefix | `ForecastRow`, `AdvisoryTier`, `AlertRecord` | `packages/core/src/forecasts.ts:10`, `frontend/src/types/index.ts` |
| Constants / Env Vars | UPPER_SNAKE_CASE | `BACKEND_API_KEY`, `FRONTEND_ORIGIN`, `DEFAULT_HORIZON` | `backend/server.js:38-47`, `backend/forecastStore.js:12` |

### 2) Formatting and Linting

- Formatter: Prettier 3.6.2 configured in `.prettierrc`:
  - `printWidth`: 120
  - `singleQuote`: true
  - `trailingComma`: "all"
  - `semi`: true
  - `tabWidth`: 2
  - `arrowParens`: "always"
  - `endOfLine`: "lf"
- Linter: ESLint 9 Flat Config configured in `eslint.config.js`:
  - Enforces `@eslint/js` recommended, `typescript-eslint` recommended, and `react-hooks/recommended`.
- Most relevant enforced rules:
  - `@typescript-eslint/no-unused-vars`: `['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]` (`eslint.config.js:36`)
  - `@typescript-eslint/no-explicit-any`: `'warn'` (`eslint.config.js:35`)
  - `no-console`: `['warn', { allow: ['warn', 'error', 'info'] }]` for client code, relaxed for CLI scripts (`eslint.config.js:37,66,100`)
  - `no-empty`: `['error', { allowEmptyCatch: true }]` (`eslint.config.js:38`)
  - Zero-error enforcement policy in CI (`.github/workflows/ci.yml:394`)
- Run commands:
  ```bash
  npm run lint           # Runs tsc -p frontend/tsconfig.json --noEmit
  npm run lint:eslint    # Runs eslint .
  npm run format         # Runs prettier --write on TS/TSX/JS sources
  ```

### 3) Import and Module Conventions

- Import grouping/order: External vendor libraries first, followed by monorepo packages (`@hazardnet/*`), internal aliased modules (`@/*`), and finally relative imports (`./`).
- Alias vs relative import policy:
  - Frontend code uses `@/*` for cross-directory imports inside `frontend/src/` (e.g. `import { useAuth } from '@/context/AuthContext'`).
  - Monorepo packages use explicit workspace package names: `@hazardnet/core`, `@hazardnet/design-system`, `@hazardnet/api`, `@hazardnet/analytics`.
  - Same-directory files use relative imports (`./foo`).
- Public exports/barrel policy:
  - Shared packages in `packages/*` define explicit root barrels (`src/index.ts`) and subpath exports in `package.json` (e.g. `@hazardnet/core/forecasts`, `@hazardnet/design-system/tokens`).

### 4) Error and Logging Conventions

- Error strategy by layer:
  - Backend API: Handlers wrap asynchronous logic in `try/catch` and return standardized JSON error objects: `{ error: 'Human readable message', code?: 'OPTIONAL_CODE' }` with appropriate HTTP status codes (400 for validation errors, 401/403 for authorization, 404 for missing resources, 500/503 for internal failures).
  - Schema Validation: Ingestion tools and API endpoints parse incoming payloads with Zod schemas (`safeParse`); on failure, they exit immediately with explicit field-level error messages.
  - Frontend Client: Network failures in TanStack Query trigger UI error boundaries or fallback to cached snapshot records (`forecasts-latest.json`).
- Logging style and required context fields:
  - Express server uses `requestId` middleware (`backend/middleware/requestId.js`) generating an `X-Request-Id` UUID header.
  - Error logs include the correlated `req.id` alongside timestamp, HTTP method, and path.
- Sensitive-data redaction rules:
  - Build checks enforce that repository filesystem paths (e.g. `/home/...`, `C:\...`, `node_modules/...`) never leak into rendered public HTML, JSON-LD, or client bundles (`scripts/check-public-paths.mjs`, `__tests__/noRepoPaths.test.js`).
  - Secrets scanning (`scripts/check-secrets.sh`) prevents accidental commit of API keys or credentials.

### 5) Testing Conventions

- Test file naming/location rule:
  - Backend and system tests: `__tests__/**/*.test.js` or `__tests__/**/*.test.ts`.
  - Frontend component tests: `frontend/src/**/__tests__/**/*.test.tsx`.
  - Mobile tests: `apps/mobile/__tests__/**/*.test.tsx`.
  - Playwright E2E specs: `e2e/**/*.spec.ts`.
  - Workflow & pipeline Python tests: `scripts/tests/test_*.py`.
- Mocking strategy norm:
  - Heavy native modules and mobile runtime libraries are stubbed via pure-JS mocks in `__tests__/__mocks__/` (e.g., `async-storage.js`, `netinfo.js`, `react-native.js`).
  - External network calls in unit tests are mocked using `jest.fn()` or `node-mocks-http` (`__tests__/api/forecasts.test.js`).
- Coverage expectation:
  - Global threshold defined in `jest.config.cjs:70-76`: statements 32%, branches 35%, functions 30%, lines 31%.
  - Scope: `backend/**/*.js`, `api/**/*.js`, `frontend/src/utils/**/*.ts`, and all `packages/*/src/**/*.ts`.

### 6) Evidence

- `eslint.config.js` (linting configuration)
- `.prettierrc` (formatting configuration)
- `jest.config.cjs` (test setup, module mappings, coverage thresholds)
- `scripts/check-public-paths.mjs` (path leakage guard)
- `backend/middleware/requestId.js` (request correlation logging)
- `packages/core/package.json` (subpath exports configuration)
