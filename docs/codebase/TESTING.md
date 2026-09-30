# Testing Patterns

## Core Sections (Required)

### 1) Test Stack and Commands

- Primary test framework:
  - Jest `29.7.0` (with `ts-jest 29.4.12` and `babel-jest 30.4.1` for ESM transformation)
  - Playwright `1.62.1` for browser end-to-end testing
  - pytest for CI pipeline script verification (`scripts/tests/`)
- Assertion/mocking tools:
  - Jest built-in assertions (`expect`)
  - `@testing-library/react` (`^14.3.1`) & `@testing-library/jest-dom` (`^6.9.1`) for component DOM testing
  - `jest-axe` (`^9.0.0`) for automated accessibility (a11y) audits
  - `node-mocks-http` (`^1.11.0`) & `supertest` (`^7.2.2`) for Express route testing
  - Custom pure-JS native stubs in `__tests__/__mocks__/`
- Commands:

```bash
# Run all unit and integration tests across repository
npm test

# Run backend unit and integration tests with coverage
npx jest --ci --coverage --coverageDirectory=./coverage/backend --testPathIgnorePatterns='/node_modules/' '/e2e/' '/frontend/' '/apps/'

# Run frontend unit tests
npm --prefix frontend test

# Run Playwright E2E tests
npx playwright test

# Run pipeline Python tests
python -m pytest scripts/tests -q

# Run visual design / token verification
npm run check:design
```

### 2) Test Layout

- Test file placement pattern:
  - Root-level integration and backend tests: `__tests__/` (e.g. `__tests__/forecastStore.test.js`, `__tests__/alerts/lifecycle.test.js`).
  - Native module stubs: `__tests__/__mocks__/`.
  - Frontend component tests: `frontend/src/**/__tests__/*.test.tsx` (e.g. `frontend/src/components/__tests__/HeroVideoPlayer.test.tsx`).
  - Mobile tests: `apps/mobile/__tests__/*.test.tsx`.
  - Playwright E2E tests: `e2e/*.spec.ts`.
  - Pipeline verification tests: `scripts/tests/*.py`.
- Naming convention:
  - Unit/Integration tests: `*.test.js`, `*.test.ts`, `*.test.tsx`.
  - E2E tests: `*.spec.ts`.
  - Python tests: `test_*.py`.
- Setup files and where they run:
  - `jest.setup.ts`: Configures `@testing-library/jest-dom` matchers and mock polyfills before every Jest test suite runs.
  - `apps/mobile/jest.setup.cjs`: Specific React Native environment and timer mocks.

### 3) Test Scope Matrix

| Scope | Covered? | Typical target | Notes |
|-------|----------|----------------|-------|
| Unit | Yes | Core schemas (`@hazardnet/core`), utilities, token parsers, state machines | Fast in-memory tests executing with Babel/ts-jest transforms. |
| Integration | Yes | Express routes (`backend/routes/`), Firestore storage queries, rate limiters | Uses `supertest` and `node-mocks-http` to test API routes with simulated payloads. |
| E2E | Yes | Full browser user journeys (interactive map, district drawers, fallback checks) | Playwright tests run against built Vite production preview bundle (`e2e/`). |

### 4) Mocking and Isolation Strategy

- Main mocking approach:
  - Native Mobile Stubs: Node/jsdom cannot parse React Native Flow types or native libraries. `jest.config.cjs` maps `react-native`, `expo-*`, `react-native-reanimated`, and `@react-navigation/*` to stub implementations in `__tests__/__mocks__/`.
  - Network Mocking: External HTTP requests to Open-Meteo or Firestore in unit tests are intercepted with Jest mocks (`jest.mock(...)`) or simulated mock requests.
- Isolation guarantees:
  - `supertest` imports the Express application (`app`) without binding to an active TCP port, preventing `EADDRINUSE` collisions during parallel runs.
  - `jest.config.cjs` caps worker concurrency to `maxWorkers: '50%'` to prevent memory exhaustion when transforming large ESM dependencies.
- Common failure mode in tests:
  - ESM-CJS boundary conflicts: External dependencies that distribute pure ESM packages without CJS exports must be transformed by `babel-jest` (`transformIgnorePatterns: []`).

### 5) Coverage and Quality Signals

- Coverage tool + threshold:
  - Tool: Jest built-in Istanbul coverage reporter (`lcov`, `text`).
  - Thresholds configured in `jest.config.cjs:70-76`:
    - Statements: `32%`
    - Branches: `35%`
    - Functions: `30%`
    - Lines: `31%`
- Current reported coverage:
  - Backend and shared core meet the ~32% baseline in CI. Frontend coverage threshold is currently unblocked in CI (`--coverageThreshold='{}'`) until component testing suites fully land (`.github/workflows/ci.yml:109-114`).
- Known gaps/flaky areas:
  - CI Ignored Suites (`.github/workflows/ci.yml:65`): 9 test suites are explicitly ignored in CI backend test runs (`severityEmbargo`, `securityTxt`, `securityHeadersParity`, `nasaTokens`, `freshnessArtifact`, `contentEngine`, `claimsGate`, `alertSnapshot`, `alertReplay`) because the corresponding operational scripts in `scripts/` were not yet vendored on `main`.

### 6) Evidence

- `jest.config.cjs` (Jest configuration and coverage thresholds)
- `jest.setup.ts` (Jest environment setup)
- `playwright.config.ts` (Playwright E2E configuration)
- `.github/workflows/ci.yml:20-127` (CI test pipelines for backend and frontend)
- `__tests__/` (Unit and integration test suites)
- `e2e/` (End-to-end browser specifications)
