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
  modulePaths: ['<rootDir>/node_modules', '<rootDir>/../../node_modules'],
  moduleDirectories: ['node_modules', path.resolve(__dirname, 'node_modules'), path.resolve(__dirname, '../../node_modules')],
  moduleNameMapper: {
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
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { configFile: './babel.config.cjs' }],
    '\\.md$': '<rootDir>/jest.fileTransform.cjs',
  },
};
