/**
 * @jest-environment node
 *
 * One district-name table, everywhere.
 *
 * Before 2026-11-09 the repository held seven copies of the spelling-variant table
 * that maps how a district is *written* onto who it *is*:
 *
 *   packages/core/src/forecasts.ts              legacy → current
 *   frontend/src/lib/forecasts.ts               legacy → current (+ a dead `'chapainawabganj '`)
 *   frontend/src/lib/storedPrediction.ts        legacy → current
 *   backend/utils/storedPrediction.js           legacy → current
 *   backend/utils/forecastSnapshotServe.js      legacy → current (the only copy with Cox's Bazar)
 *   frontend/src/lib/eventsClient.ts            current → legacy   (the reverse!)
 *   frontend/src/lib/webmcp.ts                  six entries, inline in a tool handler
 *
 * They had already drifted in ways that change what a reader sees: a district could
 * resolve on the API and not in the map overlay, `Cox's Bazar` (the spelling the
 * advisory CSV uses) resolved in one module out of seven, and the events catalogue
 * ran the renames backwards because the static table is keyed by pre-rename slugs.
 * Nothing caught it, because each copy was self-consistent.
 *
 * This suite is the gate. It is a *source* check on purpose: importing the modules
 * would exercise whichever copy is live and pass. What has to be asserted is that no
 * second table exists — the same technique `advisoryTierBands.test.js` uses for the
 * severity bands, and for the same reason.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { readFileSync as read } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DISTRICT_ALIASES,
  canonicalKey,
  districtKey,
  districtSlug,
  lookupDistrict,
  sameDistrict,
} from '../packages/core/src/index';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Directories that hold source but never a second district table. */
const SCAN_ROOTS = ['backend', 'frontend/src', 'packages', 'serverless', 'functions', 'scripts', 'apps/mobile/src'];

/** The one module allowed to declare the table. */
const OWNER = 'packages/core/src/districtRegistry.js';

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry) && !/\.test\.|\.spec\./.test(entry)) out.push(full);
  }
  return out;
}

const SOURCES = SCAN_ROOTS.flatMap((root) => walk(join(ROOT, root)));

/**
 * The fingerprint of a district alias table: three or more of the historic renames
 * appearing as `from: 'to'` pairs in one file. A comment mentioning "Chittagong" does
 * not match; a table entry does.
 */
const PROBE_ALIASES = ['chittagong', 'jessore', 'comilla', 'barisal', 'bogura', 'nawabganj'];

function declaresAliasTable(text) {
  const hits = PROBE_ALIASES.filter((alias) =>
    new RegExp(`['"\`]?${alias}['"\`]?\\s*:\\s*['"\`]`, 'i').test(text)
  );
  return hits.length >= 3;
}

describe('district identity — one table', () => {
  test('no module outside the owner declares a spelling-variant table', () => {
    const offenders = SOURCES
      .filter((file) => relative(ROOT, file).replace(/\\/g, '/') !== OWNER)
      .filter((file) => declaresAliasTable(read(file, 'utf8')))
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  test('the owner is where the callers think it is', () => {
    const owner = read(join(ROOT, OWNER), 'utf8');
    expect(owner).toContain('export const DISTRICT_ALIASES');
    expect(owner).toContain('export function districtKey');
  });
});

describe('district identity — behaviour', () => {
  test('every alias resolves to a district in the registry', () => {
    for (const [alias, canonical] of Object.entries(DISTRICT_ALIASES)) {
      // Every target must be a real district: an alias pointing nowhere is worse than
      // no alias, because it makes the district look covered.
      expect(lookupDistrict(canonical)).not.toBeNull();
      expect(districtKey(alias)).toBe(districtKey(canonical));
    }
  });

  test('case, spacing, punctuation and apostrophes cannot split one district in two', () => {
    const spellings = [
      "Cox's Bazar", 'Cox’s Bazar', "COX'S BAZAR", 'coxs bazar', 'CoxsBazar', ' cox’s-bazar ',
    ];
    for (const spelling of spellings) expect(districtKey(spelling)).toBe('coxsbazar');

    expect(sameDistrict('Jessore', 'Jashore')).toBe(true);
    expect(sameDistrict('Chittagong', 'Chattogram')).toBe(true);
    expect(sameDistrict('Barisal', 'Barishal')).toBe(true);
    expect(sameDistrict('Comilla', 'Cumilla')).toBe(true);
  });

  test('distinct districts stay distinct', () => {
    expect(sameDistrict('Dhaka', 'Khulna')).toBe(false);
    expect(sameDistrict('Rangpur', 'Rangamati')).toBe(false);
    expect(sameDistrict('', '')).toBe(false);
    expect(sameDistrict(null, 'Dhaka')).toBe(false);
  });

  test('the legacy-slug direction is explicit, not guessed', () => {
    // The static editorial table predates the renames, so it needs the old slug.
    expect(districtSlug('Jashore')).toBe('jessore');
    expect(districtSlug('Barishal')).toBe('barisal');
    // …and everything else is already the slug.
    expect(districtSlug('Chattogram')).toBe('chattogram');
    expect(districtSlug("Cox's Bazar")).toBe('coxsbazar');
  });

  test('non-string input cannot throw', () => {
    // The old `canonicalKey` in `forecasts.ts` called `name.toLowerCase()` directly and
    // threw on null; the registry's version returned ''. Two functions with one name and
    // two failure modes. There is one now.
    expect(districtKey(null)).toBe('');
    expect(districtKey(undefined)).toBe('');
    expect(districtKey(60)).toBe('60');
    expect(canonicalKey('Jessore')).toBe('jashore');
  });
});
