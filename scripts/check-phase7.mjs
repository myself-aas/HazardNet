// Phase 7 lab gate. Source contracts that do not need a production build:
// viewport zoom is not locked, the *shipped* service worker skips HTML, and
// Playwright still discovers the zoom / forecast UX specs.
//
// Bundle size remains `npm run check:bundle` (needs frontend/dist). Field CWV
// is an owner measurement on production — this script never invents LCP numbers.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const failures = [];

const html = read('frontend/index.html');
if (!/name="viewport"/.test(html) || !/width=device-width/.test(html)) {
  failures.push('index.html is missing a device-width viewport');
}
if (/user-scalable\s*=\s*no/i.test(html) || /maximum-scale\s*=\s*1/i.test(html)) {
  failures.push('index.html locks zoom (user-scalable=no or maximum-scale=1)');
}

const sw = read('frontend/public/serviceWorker.js');
if (!sw.includes("CACHE_NAME = 'hazardnet-offline-v3'")) {
  failures.push('shipped service worker CACHE_NAME is not hazardnet-offline-v3');
}
if (!/request\.mode === 'navigate'/.test(sw) || !/text\/html/.test(sw)) {
  failures.push('shipped service worker does not skip HTML/navigations');
}

const playwright = read('playwright.config.ts');
if (!/forecast-ux/.test(playwright) || !/navigation-a11y/.test(playwright)) {
  failures.push('playwright.config.ts dropped forecast-ux or navigation-a11y from testMatch');
}

if (failures.length) {
  for (const failure of failures) console.error(`[check-phase7] FAIL: ${failure}`);
  process.exit(1);
}

console.log('[check-phase7] PASS: viewport, shipped SW HTML skip, Playwright discovery.');

const distAssets = path.join(root, 'frontend/dist/assets');
if (fs.existsSync(distAssets)) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/check-bundle.mjs')], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
} else {
  console.log('[check-phase7] skip check:bundle — frontend/dist/assets not present (lab, not field CWV).');
}
