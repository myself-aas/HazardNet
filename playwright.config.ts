import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config (QA-02). The smoke suite runs against a built app:
 *   npm run build && npx vite preview --port 4173 &
 *   npx playwright test
 * or against the dev server with E2E_BASE_URL=http://localhost:3000.
 */
export default defineConfig({
  testDir: './e2e',
  // E2E QUARANTINE (2026-09-13): the suite never completed in CI (20-min
  // timeouts since 2026-09-12, no green baseline). Bounds below guarantee the
  // job always completes (~6 min worst-case) instead of hanging; restore
  // retries: 2 / timeout: 60_000 when the suite is healthy again. See the
  // production-readiness reaudit ("E2E quarantine" note) for lift criteria.
  timeout: 30_000,
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
});
