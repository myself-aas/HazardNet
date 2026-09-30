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
 *
 * Phase 7 (UX-09): default `testMatch` must discover the forecast UX and
 * navigation a11y specs as well as the whole-app QA sweep. CI invokes
 * `npx playwright test` with no `-c`.
 *
 * Every spec in `e2e/` is in the default `testMatch`. The three that used to sit
 * outside it (`smoke`, `critical-paths`, `mobile-responsive`) were real suites
 * that never ran anywhere — the worst state a test can be in, because a reader
 * assumes coverage that does not exist. If a spec must be excluded, exclude it
 * with a reason in the file's header comment, not by omission from this regex.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /(?:full-app-qa|forecast-ux|navigation-a11y|smoke|critical-paths|mobile-responsive)\.spec\.ts/,
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
