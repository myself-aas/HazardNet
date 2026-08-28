import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config (QA-02). The smoke suite runs against a built app:
 *   npm run build && npx vite preview --port 4173 &
 *   npx playwright test
 * or against the dev server with E2E_BASE_URL=http://localhost:3000.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
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
