/**
 * Claims registry gate — TRD INT-CLAIM-01 (PRD REQ-006 / TASK-008).
 *
 * "A fixture site build containing an unregistered metric fails; a
 *  registered metric passes."
 */

import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseClaims, findViolations, collectCorpus } from '../scripts/check-claims.mjs';

const REGISTRY = `
# Claims
| value | scope | label | strategy | date | source |
|---|---|---|---|---|---|
| 95.66 | model-eval | Spatial LODO accuracy | spatial_lodo | 2026-09-17 | fixture |
| 34 | ui | severity band cutoff | ui | 2026-09-17 | fixture |
`;

function makeFixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), 'claims-fixture-'));
  const src = join(dir, 'src');
  mkdirSync(src);
  return { dir, src };
}

function runGate(files) {
  const { dir, src } = makeFixtureDir();
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(src, name), content);
    }
    const corpus = collectCorpus({ srcDirs: [src], htmlFiles: [], root: dir });
    return { corpus, violations: findViolations(corpus, parseClaims(REGISTRY)) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('INT-CLAIM-01 — claims registry CI gate', () => {
  test('parseClaims extracts registered values from the registry table', () => {
    const values = parseClaims(REGISTRY);
    expect(values.has('95.66')).toBe(true);
    expect(values.has('34')).toBe(true);
    expect(values.size).toBe(2);
  });

  test('unregistered metric in public copy FAILS the gate', () => {
    const { violations } = runGate({
      'Metrics.tsx': `export default () => (
  <div>
    <div className="card">98.4%</div>
    <div>Mean Absolute Error (MAE) 0.034</div>
    <div>Inference latency 42.8 ms</div>
  </div>
);`,
    });
    const tokens = violations.map((v) => v.token);
    expect(tokens).toContain('98.4');
    expect(tokens).toContain('0.034');
    expect(tokens).toContain('42.8');
    expect(violations.length).toBeGreaterThanOrEqual(3);
  });

  test('registered metric passes the gate', () => {
    const { violations } = runGate({
      'Honest.tsx': `export default () => (
  <div>
    <div>Spatial LODO accuracy: 95.66%</div>
    <div>Severity ≥ 34%</div>
  </div>
);`,
    });
    expect(violations).toEqual([]);
  });

  test('geometry/style literals and non-copy props are not public copy', () => {
    const { corpus, violations } = runGate({
      'Svg.tsx': `export const Icon = () => (
      <svg viewBox="0 0 100 100">
        <radialGradient id="g" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopOpacity="0.7" />
          <stop offset="100%" stopOpacity="0" />
        </radialGradient>
      </svg>
    );
    export const Box = () => <div className="w-[85%] max-w-[300px]" style={{ width: '92%' }}>No numbers here</div>;`,
    });
    // nothing in the corpus should carry a percentage at all
    expect(corpus.length).toBe(0);
    expect(violations).toEqual([]);
  });

  test('copy-carrying props ARE scanned (subtitle with fake severity)', () => {
    const { violations } = runGate({
      'Palette.tsx': `const items = [
      { subtitle: 'Inundated fields • 82% severity score', badge: 'Flash Flood' },
    ];`,
    });
    expect(violations.map((v) => v.token)).toContain('82');
  });

  test('helplines, dates and counts are not metric-shaped (no false positives)', () => {
    const { violations } = runGate({
      'Safe.tsx': `export default () => (
      <div>
        <div>Krishi Call Centre 16123</div>
        <div>Cyclone season: April–June, 2026</div>
        <div>Covers 64 districts since 2000</div>
      </div>
    );`,
    });
    expect(violations).toEqual([]);
  });
});
