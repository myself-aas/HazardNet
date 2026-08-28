module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  // Allow babel-jest to transform @supabase's ESM-only packages; everything
  // else in node_modules stays untransformed (fast).
  // Small dependency set, many ESM-only packages (@supabase, react-markdown's
  // unified/remark ecosystem): transform everything instead of maintaining a
  // per-package exception list that breaks on every new ESM dependency.
  transformIgnorePatterns: [],
  // Playwright specs live in e2e/ and run via `npx playwright test` — jest
  // must not pick them up (they import @playwright/test, which is not
  // jest-compatible).
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  // Coverage gate (QA-01). Floor set at the measured 2026-08-28 baseline
  // (~32% statements) minus a small margin — ratchet upward as tests land.
  // Scope mirrors `npm test` (see collectCoverageFrom below).
  coverageThreshold: {
    global: {
      statements: 30,
      branches: 33,
      functions: 28,
      lines: 30,
    },
  },
  collectCoverageFrom: [
    'backend/**/*.js',
    'api/**/*.js',
    'frontend/src/utils/**/*.ts',
  ],
};


