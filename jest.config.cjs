module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/frontend/src/$1',
    '^@hazardnet/design-system$': '<rootDir>/packages/design-system/src/index.ts',
    '^@hazardnet/design-system/(.*)$': '<rootDir>/packages/design-system/src/$1',
    '^@hazardnet/core$': '<rootDir>/packages/core/src/index.ts',
    '^@hazardnet/core/(.*)$': '<rootDir>/packages/core/src/$1',
    '^@hazardnet/api$': '<rootDir>/packages/api/src/index.ts',
    '^@hazardnet/api/(.*)$': '<rootDir>/packages/api/src/$1',
    '^@hazardnet/analytics$': '<rootDir>/packages/analytics/src/index.ts',
    '^@hazardnet/analytics/(.*)$': '<rootDir>/packages/analytics/src/$1',
    // Node/jsdom test environments cannot parse react-native's Flow-typed sources.
    // Tests that exercise mobile pure-JS exports (manifest checks, getAppState,
    // legacy Expressive* descriptor components) get a minimal RN stub. Component
    // rendering tests for mobile run under @testing-library/react-native via a
    // separate RN jest config that lands with Phase 2.
    '^react-native$': '<rootDir>/__tests__/__mocks__/react-native.js',
    '^expo-status-bar$': '<rootDir>/__tests__/__mocks__/react-native.js',
    // Pure-JS mocks for native modules that cannot load in jsdom/node.
    '^react-native-gesture-handler$': '<rootDir>/__tests__/__mocks__/react-native-gesture-handler.js',
    '^react-native-safe-area-context$': '<rootDir>/__tests__/__mocks__/react-native-safe-area-context.js',
    '^react-native-screens$': '<rootDir>/__tests__/__mocks__/react-native-screens.js',
    '^react-native-reanimated$': '<rootDir>/__tests__/__mocks__/react-native-reanimated.js',
    '^@react-navigation/native$': '<rootDir>/__tests__/__mocks__/react-navigation.js',
    '^@react-navigation/native-stack$': '<rootDir>/__tests__/__mocks__/react-navigation.js',
    '^@react-navigation/bottom-tabs$': '<rootDir>/__tests__/__mocks__/react-navigation.js',
    '^react-native-svg$': '<rootDir>/__tests__/__mocks__/react-native-svg.js',
    '^@shopify/flash-list$': '<rootDir>/__tests__/__mocks__/react-native-svg.js',
    '^expo-haptics$': '<rootDir>/__tests__/__mocks__/expo-modules.js',
    '^expo-status-bar$': '<rootDir>/__tests__/__mocks__/expo-modules.js',
    '^expo-system-ui$': '<rootDir>/__tests__/__mocks__/expo-modules.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/__tests__/__mocks__/async-storage.js',
    '^@react-native-community/netinfo$': '<rootDir>/__tests__/__mocks__/netinfo.js',
    '^expo-location$': '<rootDir>/__tests__/__mocks__/expo-location.js',
    // Stub markdown article assets so that root/node jsdom tests importing mobile/App don't break.
    '\\.md$': '<rootDir>/__tests__/__mocks__/empty-string.js',
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
  // apps/mobile has its own jest config with react-native preset.
  testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/__mocks__/', '/apps/mobile/'],
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
    'packages/core/src/**/*.ts',
    'packages/api/src/**/*.ts',
    'packages/analytics/src/**/*.ts',
  ],
};


