// HazardNet ESLint flat config (FE-04).
// Baseline: type-aware correctness rules for TS/TSX + React hooks rules.
// Formatting is Prettier's job — no stylistic rules here. Existing violations
// are not the bar for new code: tighten to --max-warnings 0 in CI once the
// legacy count is burned down.
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'frontend/dist/**',
      'node_modules/**',
      'frontend/node_modules/**',
      '**/*.cjs',
      'references/**',
      'skills/**',
      '.agents/**', // vendored agent skill packs (same class as skills/**)
      'rag_pipeline/**',
      'kaggle_notebooks/**',
      'app/**',
      'docs/**',
      'Models/**',
      'audit_temp/**',
      'load-tests/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Burn-down severities apply to TS/TSX and the backend JS sources alike.
    files: ['**/*.{ts,tsx,js}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['frontend/src/**/*.ts', 'frontend/src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Browser globals for frontend sources (service worker uses webworker-ish
    // globals like `self`/`caches` — covered by browser set + explicit extras).
    files: ['frontend/src/**/*.ts', 'frontend/src/**/*.tsx'],
    languageOptions: { globals: { ...globals.browser, process: 'readonly' } },
  },
  {
    // Service workers: web worker runtime (self, caches, clients).
    files: ['frontend/public/**/*.js', 'frontend/src/serviceWorker.ts'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    // Frontend build/prerender scripts are Node ESM (`.mjs`) — the TS/JS globals block
    // above matches `**/*.{ts,tsx,js}` only, so without this they lint against no globals
    // at all and `process`/`console`/`URL`/`fetch` are reported as undefined (19 errors
    // on a clean checkout, 2026-09-18).
    files: ['frontend/scripts/**/*.mjs', '**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  {
    // Jest globals for test files.
    files: ['**/__tests__/**/*.{ts,tsx,js}', '**/*.test.{ts,tsx,js}'],
    languageOptions: { globals: { ...globals.jest, ...globals.node, process: 'readonly' } },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Backend/serverless/build scripts: Node runtime globals (ESM sources).
    files: ['backend/**/*.js', 'api/**/*.js', 'utils/**/*.js', 'scripts/**/*.js', 'scripts/**/*.mjs', '*.config.js', '*.config.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  }
);
