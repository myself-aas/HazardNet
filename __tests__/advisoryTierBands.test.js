/**
 * One set of bands, three producers.
 *
 * Before 2026-10-06 the repository held four different severity-to-tier thresholds:
 *
 *   packages/core/src/alertPolicy.ts  0.40 / 0.55 / 0.65 / 0.80
 *   frontend/src/lib/forecasts.ts     0.34 / 0.67            (the client's fallback)
 *   components/StatusStrip.tsx        0.30 / 0.50 / 0.75     (a third fallback)
 *   backend/alerts/policy.js          0.65 / 0.55            (probability + severity routes)
 *
 * so the same district could be SEVERE to the model, WARNING to the alert engine and WATCH to
 * the reader. The manuscript's bands (0.40 / 0.70 / 0.85) are now the only ones, and this file
 * is what keeps them that way: it reads the constants out of the *source files* — not out of a
 * shared import, which would pass even if a producer stopped importing it — and fails when any
 * of the three drifts again.
 *
 * Run via both `node --test` and Jest, like `advisoryPipeline.test.js`.
 */

import assert from 'node:assert';
import * as nodeTest from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TIER_BANDS,
  AUTO_PUBLISH_CEILING,
  tierForSeverity,
  requiresReview,
  ADVISORY_POLICY,
} from '../scripts/lib/advisory-tier.mjs';

const describe = globalThis.describe ?? nodeTest.describe;
const test = globalThis.test ?? nodeTest.test;

// `process.cwd()` rather than `import.meta.url`: these __tests__ files run under Jest's CJS
// transform as well as `node --test`, and the repository's other Node-side suites do the same.
const ROOT = process.cwd();
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('advisory tier bands — the manuscript\u2019s numbers, everywhere', () => {
  test('the pipeline’s bands are the manuscript’s', () => {
    assert.deepStrictEqual(TIER_BANDS, { SEVERE: 0.85, WARNING: 0.7, WATCH: 0.4 });
  });

  test('packages/core SEVERITY_THRESHOLDS agree with the pipeline', () => {
    const src = read('packages/core/src/alertPolicy.ts');
    const block = src.match(/export const SEVERITY_THRESHOLDS = \{[\s\S]*?\} as const;/);
    assert.ok(block, 'SEVERITY_THRESHOLDS not found in alertPolicy.ts');
    const value = (key) => {
      const m = block[0].match(new RegExp(`${key}:\\s*([\\d.]+)`));
      assert.ok(m, `${key} not found in SEVERITY_THRESHOLDS`);
      return Number(m[1]);
    };
    assert.strictEqual(value('WATCH'), TIER_BANDS.WATCH);
    assert.strictEqual(value('WARNING'), TIER_BANDS.WARNING);
    assert.strictEqual(value('SEVERE'), TIER_BANDS.SEVERE);
    // One WATCH floor, not two: the second conjunct used to be 0.55, which made a district at
    // 0.45 WATCH to a reader and NO_ALERT to the engine.
    assert.strictEqual(value('WATCH_MIN_SEVERITY'), TIER_BANDS.WATCH);
  });

  test('the alert engine’s severity route uses the same band', () => {
    const src = read('backend/alerts/policy.js');
    const m = src.match(/watch_severity:\s*([\d.]+)\s*,/);
    assert.ok(m, 'watch_severity not found in backend/alerts/policy.js');
    assert.strictEqual(Number(m[1]), TIER_BANDS.WATCH);
  });

  test('the auto-publish ceiling is one value, and it is WATCH', () => {
    assert.strictEqual(AUTO_PUBLISH_CEILING, 'WATCH');
    assert.match(read('packages/core/src/alertPolicy.ts'), /AUTO_PUBLISH_CEILING = 'WATCH'/);
    assert.strictEqual(ADVISORY_POLICY.auto_publish_ceiling, AUTO_PUBLISH_CEILING);
  });

  test('the web client derives no higher than the ceiling, from the same band', () => {
    // `tierFromSeverity` reads SEVERITY_THRESHOLDS.WATCH and stops at WATCH by design; the
    // assertion is that it still imports the shared constant rather than a literal.
    const src = read('frontend/src/lib/forecasts.ts');
    assert.match(src, /import \{ SEVERITY_THRESHOLDS \} from '@hazardnet\/core'/);
    const body = src.match(/export function tierFromSeverity\([\s\S]*?\n\}/);
    assert.ok(body, 'tierFromSeverity not found');
    assert.match(body[0], /SEVERITY_THRESHOLDS\.WATCH/);
    // The safety property: a client may never derive a tier that requires a duty officer.
    assert.doesNotMatch(body[0], /SEVERITY_THRESHOLDS\.(WARNING|SEVERE)/);
    assert.doesNotMatch(body[0], /'WARNING'|'SEVERE'/);
  });
});

describe('tierForSeverity — the bands, at their edges', () => {
  test('cuts on inclusive lower bounds', () => {
    assert.strictEqual(tierForSeverity(0.85), 'SEVERE');
    assert.strictEqual(tierForSeverity(0.8499), 'WARNING');
    assert.strictEqual(tierForSeverity(0.7), 'WARNING');
    assert.strictEqual(tierForSeverity(0.6999), 'WATCH');
    assert.strictEqual(tierForSeverity(0.4), 'WATCH');
    assert.strictEqual(tierForSeverity(0.3999), 'NORMAL');
    assert.strictEqual(tierForSeverity(0), 'NORMAL');
  });

  test('an absent score has no tier, because NORMAL is a claim about the district', () => {
    for (const value of [null, undefined, NaN, '', 'nonsense', {}]) {
      assert.strictEqual(tierForSeverity(value), null);
    }
  });

  test('only above the ceiling needs a reviewer', () => {
    assert.strictEqual(requiresReview('WATCH'), false);
    assert.strictEqual(requiresReview('NORMAL'), false);
    assert.strictEqual(requiresReview('WARNING'), true);
    assert.strictEqual(requiresReview('SEVERE'), true);
  });
});
