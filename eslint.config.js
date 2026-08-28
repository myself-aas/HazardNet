// HazardNet ESLint flat config (FE-04).
// Baseline: type-aware correctness rules for TS/TSX + React hooks rules.
// Formatting is Prettier's job — no stylistic rules here. Existing violations
// are not the bar for new code: tighten to --max-warnings 0 in CI once the
// legacy count is burned down.
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

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
      'rag_pipeline/**',
      'kaggle_notebooks/**',
      'app/**',
      'docs/**',
      'Models/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    // Backend/serverless stay CommonJS-compatible in tooling terms but are
    // ESM sources; only apply the TS rules where they apply.
    files: ['backend/**/*.js', 'api/**/*.js', 'scripts/**/*.js', 'scripts/**/*.mjs'],
    rules: {
      'no-console': 'off',
    },
  }
);
