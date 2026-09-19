import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config (QA-02). The smoke suite runs against a built app:
 *   npm run build && npx vite preview --port 4173 &
 *   npx playwright test
 * or against the dev server with E2E_BASE_URL=http://localhost:3000.
 *
 * The 2026-09-13 quarantine bounds (timeout: 30s, retries: 0) are gone. They
 * were a containment measure for a suite that never finished; the actual cause
 * was a production crash on every built page (see the `leafletGlobalShim`
 * plugin in frontend/vite.config.ts). With the suite green and completing in
 * ~1 minute, the normal bounds are back: retries absorb CI runner variance
 * instead of masking real failures behind a hard timeout.
 */
export default defineConfig({
  testDir: './e2e',
  // CI invokes `npx playwright test` with no `-c`, which is why the whole-app QA
  // suite is matched here and not only in `playwright.qa.config.ts` (that file exists
  // to override the Chromium and base URL in a sandbox where `npx playwright install`
  // has no working browser download). The QA spec reads `E2E_BASE_URL` — the variable
  // the CI job already exports.
  testMatch: /full-app-qa\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: true,
  workers: 4,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
});
