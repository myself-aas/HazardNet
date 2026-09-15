module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx|mjs)$': 'babel-jest',
  },
  // Allow babel-jest to transform ESM-only packages
  // Small dependency set, many ESM-only packages (react-markdown's

  // unified/remark ecosystem): transform everything instead of maintaining a
  // per-package exception list that breaks on every new ESM dependency.
  transformIgnorePatterns: [],
  // Playwright specs live in e2e/ and run via `npx playwright test` â€” jest
  // must not pick them up (they import @playwright/test, which is not
  // jest-compatible).
  testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/tests/firestore-rules.test.mjs'],
  // Cap worker parallelism: the API suites import the full Express app (heavy
  // babel transforms of ESM deps), and unbounded workers OOM small CI runners.
  maxWorkers: '50%',
  // Coverage gate (QA-01). Floor set at the measured 2026-08-28 baseline
  // (~32% statements) minus a small margin â€” ratchet upward as tests land.
  // Scope mirrors `npm test` (see collectCoverageFrom below).
  coverageThreshold: {
    global: {
      statements: 32,
      branches: 35,
      functions: 30,
      lines: 31,
    },
  },
  collectCoverageFrom: [
    'backend/**/*.js',
    'api/**/*.js',
    'frontend/src/utils/**/*.ts',
  ],
};


