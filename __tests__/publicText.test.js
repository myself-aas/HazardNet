/**
 * The rule that keeps repository locations off visitor surfaces, and the guarantee that
 * its two implementations are one rule.
 *
 * `scripts/lib/public-text.mjs` applies it while the pages are being built;
 * `frontend/src/lib/publicText.ts` applies it while they are being rendered (the freshness
 * panel's detail rows, which come from an artifact fetched at runtime). Two copies of a
 * rule is how a rule stops being a rule, so the parity cases below are asserted against
 * both, and a change to one that is not made to the other fails here rather than shipping
 * a surface that names the tree on some pages and not others.
 */

import * as buildSide from '../scripts/lib/public-text.mjs';
import * as browserSide from '../frontend/src/lib/publicText';

const implementations = [
  ['scripts/lib/public-text.mjs', buildSide],
  ['frontend/src/lib/publicText.ts', browserSide],
];

/** Strings that name a location in this repository's tree. */
const REPO_LOCATIONS = [
  'backend/data/forecasts/manifest.json',
  'frontend/public/data/forecasts-latest.json',
  'scripts/build_freshness_artifact.mjs',
  'scripts/physics_severity.py',
  'scripts/tests/test_content_engine.py',
  'data/site-health/latest.json',
  'data/events/historical_hazard_records_with_HazardNet_severity.csv',
  'Models/VERSION.json',
  'Models/labels.json',
  'docs/ops/HAZARD_ARCHIVE_QUALITY.md',
  'src/data/bangladeshDistricts.ts',
  'frontend/src/styles/nasa-hds.css',
  '.github/workflows/hindcast.yml',
  'hindcast/reports/amphan-2020.json',
  '__tests__/publicSurface.test.js',
  'scripts/etl/adapters/bgd_climatic_hazards.py',
];

/** Strings that must not be treated as repository locations. */
const NOT_REPO_LOCATIONS = [
  '/data/hazard-archive.json', // a URL this site serves; a visitor can follow it
  '/data/model-performance.json',
  'https://www.hazardnet.live/data/freshness.json',
  '2,931 event-district observations',
  'the data/events pipeline', // prose about a directory, no file
  'Sentinel-1/2 + Landsat + ERA5-Land',
  'Open-Meteo forecast (rainfall intensity)',
  'models of the atmosphere', // lowercase prose, not the Models/ tree
  'blog_articles',
  'VITE_ADSENSE_CLIENT',
];

describe('the public-text rule', () => {
  it.each(implementations)('%s recognises a location in the repository tree', (_name, mod) => {
    for (const value of REPO_LOCATIONS) {
      expect(mod.namesRepoFile(value)).toBe(true);
    }
    // …including when it is embedded in a sentence or a command.
    expect(mod.namesRepoFile('run `node scripts/build_hazard_archive.mjs` first')).toBe(true);
    expect(
      mod.namesRepoFile('Validated in CI: its sha256 matches Models/VERSION.json, labels present'),
    ).toBe(true);
  });

  it.each(implementations)('%s leaves served URLs, numbers and prose alone', (_name, mod) => {
    for (const value of NOT_REPO_LOCATIONS) {
      expect(mod.namesRepoFile(value)).toBe(false);
    }
  });

  it.each(implementations)('%s deletes a parenthetical that names a file', (_name, mod) => {
    expect(
      mod.withoutRepoPaths(
        'Severity and class come from the independent physics cross-check (scripts/physics_severity.py) run on reanalysis drivers.',
      ),
    ).toBe(
      'Severity and class come from the independent physics cross-check run on reanalysis drivers.',
    );
    // The parenthetical goes with the space that separated it, and only it goes.
    expect(
      mod.withoutRepoPaths('A parser exists (scripts/etl/bulletins.py) and is tested.'),
    ).toBe('A parser exists and is tested.');
    // A parenthetical that does not name a file survives.
    expect(mod.withoutRepoPaths('Drivers: ERA5-Land (reanalysis), 0.1 degree.')).toBe(
      'Drivers: ERA5-Land (reanalysis), 0.1 degree.',
    );
    // A path with no parentheses is left alone: deleting it would take the grammar too.
    expect(mod.withoutRepoPaths('pinned by scripts/tests/test_physics_severity.py.')).toBe(
      'pinned by scripts/tests/test_physics_severity.py.',
    );
  });

  it.each(implementations)('%s drops record values that name the tree', (_name, mod) => {
    const record = {
      source: 'github-actions: scripts/auto_forecast.py (GEE + Open-Meteo + TFLite)',
      row_count: 74,
      prediction_date: '2026-09-16',
      csv_sha256: '3d18c281df9bc00f5f81edc93b2ce35dd1a114cf31b43beff5531ae36400870c',
      checks: ['skipped by the caller'],
    };
    expect(mod.publishableEntries(record, ['checks'])).toEqual([
      ['row count', '74'],
      ['prediction date', '2026-09-16'],
      ['csv sha256', '3d18c281df9bc00f5f81edc93b2ce35dd1a114cf31b43beff5531ae36400870c'],
    ]);
    expect(mod.publishableEntries(null)).toEqual([]);
  });

  it('is one rule, not two that currently agree', () => {
    expect(browserSide.TREE_ROOTS).toEqual([...buildSide.TREE_ROOTS]);
    expect(browserSide.FILE_EXTENSIONS).toBe(buildSide.FILE_EXTENSIONS);
    expect(browserSide.REPO_PATH_SOURCE).toBe(buildSide.REPO_PATH_SOURCE);
    expect(browserSide.REPO_PATH_PATTERN.source).toBe(buildSide.REPO_PATH.source);
    for (const value of [...REPO_LOCATIONS, ...NOT_REPO_LOCATIONS]) {
      expect(browserSide.namesRepoFile(value)).toBe(buildSide.namesRepoFile(value));
      expect(browserSide.withoutRepoPaths(value)).toBe(buildSide.withoutRepoPaths(value));
    }
  });
});
