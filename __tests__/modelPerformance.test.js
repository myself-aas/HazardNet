/**
 * @jest-environment node
 *
 * The public validation surface (Phase 9 §8.1): `frontend/public/data/model-performance.json`,
 * the `/model-performance` route composed from it, and the honesty rules that have to survive
 * both.
 *
 * Why a dedicated suite: this page is the first place the repository publishes its own measured
 * performance. Everything the phase report refuses to claim — forecast skill, CNN skill, a
 * single accuracy percentage, a false-alarm ratio with a denominator that does not exist — has
 * to be refused by the *build*, not by the reviewer's memory of the phase report. So the tests
 * below assert the refusals as properties of the artifacts:
 *
 *   - the builder reproduces the committed file byte for byte from the committed reports, and a
 *     report that overstates what the harness did fails the build instead of reaching the page;
 *   - no forbidden metric key can appear anywhere in the published document;
 *   - `null` scores stay `null` (a POD that cannot be computed is never rendered as 0.000);
 *   - the page content never states an accuracy figure, and the tables it publishes match the
 *     artifact the reports produced;
 *   - the built HTML (when `frontend/dist` exists) serves the same numbers, so the crawler sees
 *     the page the visitor does.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SCHEMA,
  assertHonestReport,
  assertNoHeadlineAccuracy,
  buildDocument,
} from '../scripts/build_model_performance.mjs';

const repoRoot = join(__dirname, '..');
const artifactPath = join(repoRoot, 'frontend/public/data/model-performance.json');
const reportsDir = join(repoRoot, 'data/hindcast/reports');

const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
const routes = JSON.parse(readFileSync(join(repoRoot, 'frontend/src/content/generated-routes.json'), 'utf8')).routes;
const route = routes.find((entry) => entry.path === '/model-performance');
const pageFile = join(repoRoot, 'frontend/dist/model-performance/index.html');
const built = existsSync(pageFile);
const reportFiles = [
  'amphan-2020.json',
  'yaas-2021.json',
  'mocha-2023.json',
  'eastern-flood-2024.json',
  'northeast-flood-2025.json',
];

const report = (name) => JSON.parse(readFileSync(join(reportsDir, name), 'utf8'));

describe('the committed validation artifact', () => {
  it('is the file the committed reports produce', () => {
    const rebuilt = buildDocument({ reportsDir, driversDir: 'data/hindcast/drivers', rootDir: repoRoot });
    expect(JSON.parse(JSON.stringify(rebuilt))).toEqual(artifact);
  });

  it('declares its schema, its provenance and its inputs', () => {
    expect(artifact.schema).toBe(SCHEMA);
    expect(artifact.generated_by).toBe('scripts/build_model_performance.mjs');
    expect(artifact.hindcast_version).toBe('1.0.0');
    expect(artifact.built_from.map((entry) => entry.path).sort()).toEqual(
      reportFiles.map((name) => `data/hindcast/reports/${name}`).sort(),
    );
    for (const entry of artifact.built_from) expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('carries one episode per committed report, oldest onset first', () => {
    // Oldest onset first — the 2023 episode (added under §8 item 9.7) sorts between the two
    // south-western cyclones and the 2024 flood.
    expect(artifact.episodes.map((episode) => episode.id)).toEqual([
      'amphan-2020',
      'yaas-2021',
      'mocha-2023',
      'eastern-flood-2024',
      'northeast-flood-2025',
    ]);
  });

  it('states the limits that make the numbers readable', () => {
    expect(artifact.method.is_forecast).toBe(false);
    expect(artifact.method.cnn_evaluated).toBe(false);
    expect(artifact.method.driver_series_dir).toBe('data/hindcast/drivers/');
    expect(artifact.method.product).toMatch(/reanalysis/i);
    // The runner's absolute path is in the report and must not be published.
    expect(JSON.stringify(artifact)).not.toMatch(/\/home\/runner|\/Users\//);
    // §7 verbatim: the caveats travel with the numbers.
    expect(artifact.not_published.length).toBeGreaterThanOrEqual(8);
    expect(artifact.not_published.join(' ')).toMatch(/ceiling on detection/i);
    expect(artifact.how_to_read.length).toBeGreaterThanOrEqual(4);
  });

  it('publishes no headline accuracy metric anywhere', () => {
    expect(() => assertNoHeadlineAccuracy(artifact)).not.toThrow();
    const serialized = JSON.stringify(artifact);
    for (const forbidden of ['"accuracy"', '"f1"', '"precision"', '"recall"', '"brier"', '"log_loss"']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('keeps the uncomputable scores null instead of zero', () => {
    const amphan = artifact.episodes.find((episode) => episode.id === 'amphan-2020');
    expect(amphan.scores.pod).toBeNull();
    expect(amphan.scores.far).toBe(1);
    // …and the reason it cannot be computed is carried, not inferred from the null.
    expect(artifact.method.absence_means_no_event).toBe(false);
    expect(artifact.method.absence_means_no_event_reason).toMatch(/UNKNOWN, not negatives/);
  });

  it('counts the same totals the episodes add up to', () => {
    const sum = (key) => artifact.episodes.reduce((total, episode) => total + episode[key], 0);
    const detection = artifact.episodes.reduce((total, episode) => total + episode.detection.named_districts, 0);
    expect(artifact.totals.named_districts).toBe(detection);
    expect(artifact.totals.episodes).toBe(artifact.episodes.length);
    expect(sum('alarmed_without_a_recorded_impact')).toBe(artifact.totals.alarmed_without_a_recorded_impact);
    // The three detection numbers are genuinely different — this is the page's central claim.
    expect(artifact.totals.flagged_any_class).toBeGreaterThan(artifact.totals.flagged_the_episode_class);
    expect(artifact.totals.flagged_the_episode_class).toBeLessThan(artifact.totals.episode_class_over_threshold);
  });
});

describe('the builder refuses to publish an overstatement', () => {
  const honest = () => JSON.parse(JSON.stringify(report('amphan-2020.json')));
  const withFixture = (fixture, run) => {
    const tmp = mkdtempSync(join(tmpdir(), 'hn-mp-'));
    try {
      writeFileSync(join(tmp, 'amphan-2020.json'), JSON.stringify(fixture));
      return run(tmp);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  };

  it('rejects a report that claims the CNN was evaluated', () => {
    const fixture = honest();
    fixture.what_was_hindcast.cnn_evaluated = true;
    expect(() => assertHonestReport(fixture, '/tmp/amphan-2020.json')).toThrow(/cnn_evaluated must be false/);
    withFixture(fixture, (tmp) => {
      expect(() => buildDocument({ reportsDir: tmp, rootDir: repoRoot })).toThrow(/cnn_evaluated must be false/);
    });
  });

  it('rejects a report whose drivers claim to be forecast fields', () => {
    const fixture = honest();
    fixture.what_was_hindcast.drivers.is_forecast = true;
    withFixture(fixture, (tmp) => {
      expect(() => buildDocument({ reportsDir: tmp, rootDir: repoRoot })).toThrow(/is_forecast must be false/);
    });
  });

  it('rejects a report with no caveats', () => {
    const fixture = honest();
    fixture.caveats = [];
    withFixture(fixture, (tmp) => {
      expect(() => buildDocument({ reportsDir: tmp, rootDir: repoRoot })).toThrow(/no caveats/);
    });
  });

  it('rejects a truth set with no citations', () => {
    const fixture = honest();
    fixture.citations = [];
    withFixture(fixture, (tmp) => {
      expect(() => buildDocument({ reportsDir: tmp, rootDir: repoRoot })).toThrow(/no citations/);
    });
  });

  it('rejects an unknown report schema', () => {
    const fixture = honest();
    fixture.schema = 'hazardnet-hindcast-report/v2';
    expect(() => assertHonestReport(fixture, '/tmp/amphan-2020.json')).toThrow(/schema/);
  });

  it('reports "no reports" rather than publishing an empty page', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'hn-mp-'));
    try {
      expect(() => buildDocument({ reportsDir: tmp, rootDir: repoRoot })).toThrow(/nothing to publish/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('the generated /model-performance route', () => {
  it('exists, is indexable and joins the sitemap', () => {
    expect(route).toBeTruthy();
    expect(route.robots).toBe('index,follow');
    expect(route.sitemap).toEqual({ changefreq: 'monthly', priority: 0.7 });
    expect(route.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('publishes the four episodes as tables, with the artifact values', () => {
    const tables = route.sections.filter((section) => section.table).map((section) => section.table);
    expect(tables.length).toBeGreaterThanOrEqual(4);
    const detection = tables[0];
    expect(detection.rows).toHaveLength(artifact.episodes.length);
    expect(detection.rows.map((row) => row[0])).toEqual([
      'Cyclone Amphan',
      'Cyclone Yaas',
      'Cyclone Mocha',
      'Eastern flash floods',
      'Northeast and coastal monsoon floods',
    ]);
    // …and the full titles are still on the page, in the episode list above the tables.
    const episodeList = route.sections.find((section) => section.h2 === 'The four episodes');
    for (const episode of artifact.episodes) {
      expect(episodeList.bullets.some((bullet) => bullet.includes(episode.title))).toBe(true);
    }
    expect(detection.rows.map((row) => row[5])).toEqual(
      artifact.episodes.map((episode) => String(episode.detection.flagged_any_class)),
    );
    // Every table row is the same width as its header.
    for (const table of tables) {
      for (const row of table.rows) expect(row).toHaveLength(table.columns.length);
    }
  });

  it('renders an uncomputable score as a dash, never as 0.000', () => {
    const scores = route.sections.find((section) => section.table?.columns.includes('POD')).table;
    const podColumn = scores.columns.indexOf('POD');
    const farColumn = scores.columns.indexOf('FAR');
    const csiColumn = scores.columns.indexOf('CSI');
    const amphanRow = scores.rows.find((row) => row[0].startsWith('Cyclone Amphan'));
    // POD has no denominator for this episode, so the cell is a dash — the report's own wording.
    expect(amphanRow[podColumn]).toBe('—');
    // FAR and CSI *are* computable here (28 alarms, no named outcome), and 0.000 is their real
    // value rather than a missing one. The distinction is the whole point of the dash.
    expect(amphanRow[farColumn]).toBe('1.000');
    expect(amphanRow[csiColumn]).toBe('0.000');
  });

  it('claims no accuracy figure in its own copy', () => {
    const copy = JSON.stringify({ title: route.title, standfirst: route.standfirst, sections: route.sections, faqs: route.faqs });
    expect(copy).not.toMatch(/accuracy of|accurate to|\b\d+(\.\d+)?%/);
    expect(route.faqs.map((faq) => faq.question).join(' ')).toMatch(/accuracy number/i);
  });

  it('describes the validation runs as a dataset this deployment actually has', () => {
    expect(route.structuredData.dataset.kind).toBe('hindcast-validation');
    expect(route.structuredData.dataset.temporalCoverage).toBe('2020-05-20/2025-06-01');
  });
});

const maybe = built ? describe : describe.skip;
maybe('the built page', () => {
  const html = built ? readFileSync(pageFile, 'utf8') : '';

  it('is prerendered with the episode table, not the SPA shell', () => {
    expect(html).toContain('What the model did on four historical episodes');
    expect(html).toContain('Cyclone Amphan');
    expect(html).toContain('Northeast and coastal monsoon floods');
    expect(html).toContain('<table>');
    expect(html).toContain('Hindcast validation');
  });

  it('serves the numbers from the artifact in the static HTML', () => {
    const eastern = artifact.episodes.find((episode) => episode.id === 'eastern-flood-2024');
    expect(html).toContain(`>${eastern.detection.flagged_any_class}<`);
    expect(html).toContain('0.846');
  });

  it('carries the limits in the static text, not only after hydration', () => {
    expect(html).toMatch(/ceiling on detection/);
    expect(html).toMatch(/not evaluated/);
  });

  it('publishes the Dataset node with its download', () => {
    expect(html).toContain('#hindcast-validation');
    expect(html).toContain('/data/model-performance.json');
  });
});
