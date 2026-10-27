/**
 * @jest-environment node
 *
 * Phase 3 — provenance lint for the parity test class.
 *
 * The batch test passed while the route served hollow data because it asserted structure
 * (`toMatchObject`, `.count`, `.id`, `.length`) over a stub that did not mirror the upstream.
 * Two things now prevent that class of test from coming back:
 *
 *   1. Every committed fixture carries a three-line provenance header — what URL it came
 *      from, what shape it is, and the command that refreshes it. A fixture without one
 *      cannot be committed (this test fails on it).
 *   2. Every integration test in `docs/ops/test-quality-manifest.json` must import at least
 *      one provenance fixture, assert at least one **leaf value per entity** sourced from
 *      that fixture, and — where it reads a cache — assert the cached object equals the
 *      returned object. The manifest names the exact fixture expressions, so a "fix" that
 *      deletes a leaf assertion while keeping a keyword fails here.
 *
 * JSON fixtures cannot hold comments, so their provenance lives in a
 * `<name>.provenance.md` sidecar with the same three lines.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'docs', 'ops', 'test-quality-manifest.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

const REQUIRED_LINES = ['# Captured from', '# Shape:', '# To refresh:'];

function hasProvenance(text) {
  const head = text.split('\n').slice(0, 12).join('\n');
  return REQUIRED_LINES.every((line) => head.includes(line));
}

function fixtureFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => /\.(js|cjs|mjs|json)$/.test(name));
}

describe('fixture provenance', () => {
  test('the manifest itself is dated and lists fixture directories that exist', () => {
    expect(manifest.schema).toBe('hazardnet-test-quality-manifest/v1');
    expect(manifest.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const dir of manifest.fixtureDirs) {
      expect(fs.existsSync(path.join(ROOT, dir))).toBe(true);
    }
    expect(manifest.integrationTests.length).toBeGreaterThan(5);
  });

  test('every committed fixture has a URL, a shape and a refresh command', () => {
    const missing = [];
    for (const dir of manifest.fixtureDirs) {
      const absolute = path.join(ROOT, dir);
      for (const name of fixtureFiles(absolute)) {
        const file = path.join(absolute, name);
        if (name.endsWith('.json')) {
          const sidecar = file.replace(/\.json$/, '.provenance.md');
          if (!fs.existsSync(sidecar) || !hasProvenance(fs.readFileSync(sidecar, 'utf8'))) {
            missing.push(`${dir}/${name} (missing or incomplete ${path.basename(sidecar)})`);
          }
        } else if (!hasProvenance(fs.readFileSync(file, 'utf8'))) {
          missing.push(`${dir}/${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test('a sidecar without the three lines would fail the lint (self-check)', () => {
    // Guard against a lint that passes vacuously: the check must be able to say "no".
    expect(hasProvenance('module.exports = { a: 1 };')).toBe(false);
    expect(hasProvenance('# Captured from https://x on 2026-10-27 by y.\n# Shape: object.\n# To refresh: make.\nmodule.exports = {};')).toBe(true);
  });
});

describe('integration tests mirror their upstream and assert its values', () => {
  for (const entry of manifest.integrationTests) {
    test(`${entry.file} — provenance fixture, leaf values, cache equality`, () => {
      const file = path.join(ROOT, entry.file);
      expect(fs.existsSync(file)).toBe(true);
      const source = fs.readFileSync(file, 'utf8');

      // At least one provenance fixture is actually imported, not merely mentioned.
      for (const fixture of entry.fixtures) {
        expect(fs.existsSync(path.join(ROOT, fixture))).toBe(true);
        expect(source).toMatch(/require\(['"][^'"]*fixtures\//);
      }

      // One leaf value per entity, read from the fixture at assertion time.
      expect(entry.leafAssertions.length).toBeGreaterThan(0);
      for (const leaf of entry.leafAssertions) {
        expect(source).toContain(leaf);
      }

      // A structural assertion over a stub is not enough: at least one value assertion.
      expect(source).toMatch(/\.to(Be|Equal|StrictEqual)\(/);

      // Presence-only checks named in the manifest are gone.
      for (const banned of entry.bannedAssertions || []) {
        expect(source).not.toContain(banned);
      }

      // If the test reads a cache, the cached object must equal the returned object.
      for (const assertion of entry.cachedEqualsReturned || []) {
        expect(source).toContain(assertion);
      }
    });
  }
});

describe('no parity test is structural-only', () => {
  test('every manifest test with toMatchObject/toHaveProperty still has a fixture leaf assertion', () => {
    const offenders = [];
    for (const entry of manifest.integrationTests) {
      const source = fs.readFileSync(path.join(ROOT, entry.file), 'utf8');
      if (!/toMatchObject|toHaveProperty/.test(source)) continue;
      const hasFixtureLeaf = entry.leafAssertions.some((leaf) => source.includes(leaf));
      if (!hasFixtureLeaf) offenders.push(entry.file);
    }
    expect(offenders).toEqual([]);
  });
});
