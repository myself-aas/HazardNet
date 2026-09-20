#!/usr/bin/env node
/**
 * UX Phase 8 — controlled-rollout gate.
 *
 * Plan: docs/frontend/2026-09-20-taste-driven-ui-ux-plan.md §5 Phase 8.
 * Reference slice first. Never roll back stored-only inference or the
 * research embargo to recover an old visual. Field CWV, NVDA/TalkBack,
 * native-speaker BN, and physical 400% zoom remain owner measurements.
 *
 * This script is clock-blind and does not invent LCP numbers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];

const runNode = (script, args = []) => {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], {
    stdio: 'inherit',
  });
  if ((result.status ?? 1) !== 0) {
    failures.push(`${script} failed`);
  }
};

runNode('scripts/check-severity-embargo.mjs');
runNode('scripts/check-claims.mjs', [
  '--claims',
  'docs/CLAIMS.md',
  '--src',
  'frontend/src',
  '--html',
  'frontend/index.html',
]);
runNode('scripts/check-phase7.mjs');
runNode('scripts/check-design-quality.mjs', ['--source-only']);

const app = read('frontend/src/App.tsx');
if (!/path="\/"\s+element=\{<FrontDoor/.test(app) || !/path="\/live"\s+element=\{<Dashboard/.test(app)) {
  failures.push('App.tsx lost the / FrontDoor vs /live Dashboard split');
}

const frontDoor = read('frontend/src/pages/FrontDoor.tsx');
if (!frontDoor.includes('RunVisual')) {
  failures.push('FrontDoor.tsx dropped RunVisual (PUBLIC_SURFACE rule 5)');
}
if (/unsplash|pexels/i.test(frontDoor)) {
  failures.push('FrontDoor.tsx introduced stock photography URLs');
}

const brand = read('frontend/src/components/auth/BrandPanel.tsx');
if (!/\bvalue:\s*64\b/.test(brand)) {
  failures.push('BrandPanel lost the pinned 64-district stat');
}
if (!(/'<100ms'/.test(brand) || (/prefix:\s*'<'/.test(brand) && /suffix:\s*'ms'/.test(brand)))) {
  failures.push("BrandPanel lost the pinned <100ms edge-inference stat");
}

const stored = read('frontend/src/lib/storedPrediction.ts');
if (!stored.includes('fetchStoredPrediction')) {
  failures.push('storedPrediction.ts no longer exports fetchStoredPrediction');
}
if (/raster upload|simulateRaster|fake probabil/i.test(stored)) {
  failures.push('storedPrediction.ts restored raster-upload simulation');
}

const upload = read('frontend/src/pages/UploadPage.tsx');
if (!upload.includes('StoredForecastPanel')) {
  failures.push('UploadPage.tsx no longer renders StoredForecastPanel');
}
if (/type=["']file["']/.test(upload)) {
  failures.push('UploadPage.tsx restored a file/raster upload control');
}
if (!/Load stored forecast|lookup\.submit/.test(upload)) {
  failures.push('UploadPage.tsx lost stored-forecast submit copy');
}

if (failures.length) {
  for (const failure of failures) console.error(`[check-ux-release] FAIL: ${failure}`);
  process.exit(1);
}

console.log('[check-ux-release] PASS: embargo, claims, Phase 7, design source, stored-only lookup, / vs /live, no FrontDoor photos.');
console.log('[check-ux-release] Owner still: NVDA/TalkBack, production CWV, native-speaker BN, physical 400% zoom, preview sign-off.');
