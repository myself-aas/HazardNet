/**
 * Browser harness shared by the design review and the functional test run.
 *
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------
 * This sandbox has no Playwright browser download: only `registry.npmjs.org` is
 * reachable, so `cdn.playwright.dev` and `storage.googleapis.com` both fail and
 * `npx playwright install` cannot work. `@sparticuz/chromium` is published to npm
 * *with its binary inside the tarball*, and with its bundled Amazon Linux shared
 * libraries extracted onto `LD_LIBRARY_PATH` it runs a real headless Chromium
 * (`--version` → Chromium 153). So the reviews run on a browser rather than on a
 * description of a browser.
 *
 * One consequence worth knowing before reading a number in the reports: Chromium is
 * driven over CDP by `playwright-core` rather than being Playwright's own patched
 * build. Rendering, layout, contrast and computed styles are real Chromium, which is
 * what the design review measures. Timings are the exception — this container has
 * ~4 GB of RAM and no GPU — so Core Web Vitals are recorded as indicative only and
 * are not treated as acceptance criteria in the reports.
 *
 * The launch flags and the library path are read from the environment so the same
 * script runs unchanged where a normal Playwright install exists.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Where @sparticuz/chromium inflates its binary, or a real Playwright chromium. */
function resolveExecutable() {
  const candidates = [
    process.env.QA_CHROMIUM_PATH,
    '/tmp/chromium',
    '/tmp/al2023/chromium',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null; // let Playwright use its own bundled browser
}

export const EXECUTABLE_PATH = resolveExecutable();

/**
 * Flags that make a serverless Chromium behave inside a locked-down container.
 *
 * `--single-process` is deliberately absent. It is the flag every serverless
 * guide reaches for, and here it is what breaks the run: measured over 8 routes
 * including the two Leaflet pages, `--single-process --no-zygote` completed
 * 1/8 and had already died by the second page, while these flags completed 8/8
 * at ~1.3 s/page. A review harness that crashes on the map pages would have
 * reported "no data" for exactly the surfaces it most needs to see.
 */
export const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--hide-scrollbars',
  '--mute-audio',
  '--font-render-hinting=none',
];

export async function launchBrowser(playwrightChromium, overrides = {}) {
  return playwrightChromium.launch({
    executablePath: EXECUTABLE_PATH ?? undefined,
    args: LAUNCH_ARGS,
    ...overrides,
  });
}

/** Playwright is a devDependency of the repo; resolve it from the repo root. */
export function playwright() {
  return require('playwright-core');
}

/**
 * Console noise that is not a defect of the page under review.
 *
 * Each entry must name the reason it is excluded, because an unexplained filter is
 * how a real error gets ignored for a year.
 */
export const IGNORED_CONSOLE = [
  // The dev server has no Google Analytics / Vercel insights endpoint; the app
  // deliberately no-ops outside Vercel (see frontend/src/lib/vercelAnalytics.ts).
  /_vercel\/insights/,
  // React Router v6 future-flag notices, emitted by the library, not by this app.
  /React Router Future Flag/i,
  // Vite HMR websocket chatter when a page is closed mid-update.
  /\[vite\] connect/i,
];

export function isIgnored(text) {
  return IGNORED_CONSOLE.some((pattern) => pattern.test(text));
}

/** Network failures that are environmental rather than defects. */
export const IGNORED_REQUESTS = [
  /_vercel\/insights/,
  /favicon\.ico$/,
];

export function isIgnoredRequest(url) {
  return IGNORED_REQUESTS.some((pattern) => pattern.test(url));
}
