/**
 * Playwright config for the QA sweep (e2e/full-app-qa.spec.ts).
 *
 * WHY A SECOND CONFIG
 * -------------------
 * `playwright.config.ts` is the project's own suite and specifies no
 * `launchOptions`, so Playwright uses the browser from `npx playwright install`.
 * That is correct for CI and for contributors. It cannot work in a sandbox where
 * the only reachable host is `registry.npmjs.org` — `cdn.playwright.dev` is
 * blocked, so no Playwright browser can be downloaded — and the review therefore
 * runs on an npm-published Chromium instead.
 *
 * The override is opt-in: set `QA_CHROMIUM_PATH` and this config drives that
 * binary; leave it unset and this config behaves exactly like the base one, so
 * `npx playwright test -c playwright.qa.config.ts` is a valid command on a normal
 * machine too.
 *
 * Single worker: the sandbox has ~4 GB of RAM and this Chromium runs with
 * `--disable-gpu`. Parallel workers made launch flaky in a way that looked like
 * page failures, and a wrong failure is worse than a slow pass.
 */
import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';
import base from './playwright.config';

const chromiumPath = process.env.QA_CHROMIUM_PATH;

const overrides: PlaywrightTestConfig = {
  testDir: './e2e',
  testMatch: /full-app-qa\.spec\.ts/,
  // The base config's `retries: CI ? 2 : 0` hides flake from a reviewer who is
  // reading these results as an audit. Locally, a failure should be reported once.
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-qa' }]],
  outputDir: 'test-results-qa',
  use: {
    ...base.use,
    // Default to the preview server (`npm run preview` on :4173, the port the CI
    // E2E job uses), and let `QA_BASE_URL` / `E2E_BASE_URL` point it at a dev server
    // or anywhere else.
    baseURL: process.env.QA_BASE_URL || process.env.E2E_BASE_URL || 'http://localhost:4173',
    ...(chromiumPath
      ? {
          launchOptions: {
            executablePath: chromiumPath,
            args: [
              '--no-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu',
              '--hide-scrollbars',
              // NOTE: no `--single-process`. Measured on this sandbox, that flag
              // completed 1/8 routes (dying on the second page) where these
              // completed 8/8, and it fails precisely on the Leaflet map routes.
            ],
          },
        }
      : {}),
  },
};

// One browser project, not two: the responsive assertions in the suite set the
// viewport explicitly per test, so device emulation here would only duplicate runs.
overrides.projects = [{ name: 'chromium-qa', use: { ...overrides.use } }];

export default defineConfig(overrides);
