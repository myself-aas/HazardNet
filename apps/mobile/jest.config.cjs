/**
 * Jest configuration for React Native component tests (Phase 3b).
 *
 * Run from repo root: npx jest --config apps/mobile/jest.config.cjs
 */

const path = require('path');

module.exports = {
  rootDir: path.resolve(__dirname),
  preset: 'react-native',
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.cjs',
    '@testing-library/react-native/extend-expect',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@react-native-async-storage/async-storage|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-gesture-handler|react-native-reanimated|@shopify/flash-list|@tanstack/.*))',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.expo/', '/.turbo/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Use Node/Jest's normal upward node_modules resolution so each dependency can resolve its
  // own compatible `pretty-format` version. Global module paths here shadowed Jest 29's nested
  // version with React Native's v26 copy and crashed before any native tests could run.
  moduleDirectories: ['node_modules'],
  moduleNameMapper: {
    // Keep renderer, testing library and app components on Expo's pinned React 18.2 instance.
    // The web workspace uses React 18.3.1, so relying on workspace hoisting causes invalid hooks.
    '^react$': '<rootDir>/node_modules/react',
    '^react-test-renderer$': '<rootDir>/node_modules/react-test-renderer',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@hazardnet/core$': '<rootDir>/../../packages/core/src/index.ts',
    '^@hazardnet/core/(.*)$': '<rootDir>/../../packages/core/src/$1',
    '^@hazardnet/api$': '<rootDir>/../../packages/api/src/index.ts',
    '^@hazardnet/api/(.*)$': '<rootDir>/../../packages/api/src/$1',
    '^@hazardnet/analytics$': '<rootDir>/../../packages/analytics/src/index.ts',
    '^@hazardnet/design-system$': '<rootDir>/../../packages/design-system/src/index.ts',
    '^@hazardnet/design-system/(.*)$': '<rootDir>/../../packages/design-system/src/$1',
  },
  transform: {
    // `configFile` is resolved against the *current working directory*, not `rootDir`, so
    // the documented invocation from the repo root (`npx jest --config
    // apps/mobile/jest.config.cjs`) picked up the root Babel config and died inside
    // `@react-native/js-polyfills/error-guard.js` with "Missing semicolon" — the RN preset
    // never applied. An absolute path makes the run cwd-independent, which is what a CI
    // job needs.
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { configFile: path.resolve(__dirname, 'babel.config.cjs') }],
    '\\.md$': '<rootDir>/jest.fileTransform.cjs',
  },
};
