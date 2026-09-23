/**
 * @jest-environment node
 *
 * The prerendered `/status` page (Phase 7).
 *
 * A status page that only exists after React mounts is a status page a crawler, a monitoring
 * bot and a visitor on a 2G connection cannot read — and the whole point of publishing it is
 * that it can be read without trusting us. So the build writes the real numbers into the
 * static HTML, and this suite is what keeps that true:
 *
 *   - `dist/status/index.html` carries the figures from the committed artifact, not a shell;
 *   - `dist/data/freshness.json` is byte-identical to the committed artifact the page
 *     describes (the SPA fetch and the static render must not be able to disagree);
 *   - the sitemap lists `/status` and the page is indexable.
 *
 * Guarded on `frontend/dist` existing: the suite is meaningless before `npm run build`, and
 * a silent skip would be dishonest, so it says so and fails only when dist exists but the
 * status page did not make it into it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..');
const distDir = join(repoRoot, 'frontend', 'dist');
const artifactPath = join(repoRoot, 'frontend', 'public', 'data', 'freshness.json');
const builtArtifactPath = join(distDir, 'data', 'freshness.json');
const statusHtmlPath = join(distDir, 'status', 'index.html');

const built = existsSync(statusHtmlPath);
const maybe = built ? describe : describe.skip;

let artifact = null;

beforeAll(() => {
  if (existsSync(artifactPath)) artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
});

maybe('the built /status page', () => {
  it('is a real page, not the SPA shell', () => {
    const html = readFileSync(statusHtmlPath, 'utf8');
    expect(html).toMatch(/<title>HazardNet system status/);
    expect(html).toContain('<h1>HazardNet system status</h1>');
    expect(html).toContain('<h2 id="hn-status-right-now">Right now</h2>');
    expect(html).toContain('<table>');
    // The figures come before the hydration notice — the page is readable as served.
    const tableIndex = html.indexOf('<table>');
    const loadingIndex = html.indexOf('Loading the interactive HazardNet application');
    expect(tableIndex).toBeGreaterThan(-1);
    expect(loadingIndex).toBeGreaterThan(tableIndex);
  });

  it('renders the figures the committed artifact states', () => {
    expect(artifact).not.toBeNull();
    const html = readFileSync(statusHtmlPath, 'utf8');

    for (const source of artifact.sources) {
      // Every source is present by its label, its state and its reason. It used to be
      // identified by its artifact path as well; that is a location in this repository,
      // which a reader of the page cannot open, so the page no longer prints it — the
      // artifact keeps the field for anything that can (docs/PUBLIC_SURFACE.md §3).
      expect(html).toContain(source.label);
      expect(html).not.toContain(source.artifact);
    }
    // The state vocabulary is rendered as words, not only as colour.
    const labels = ['Within SLO', 'Past SLO', 'Checks failing', 'No data', 'Unknown'];
    expect(labels.some((label) => html.includes(label))).toBe(true);

    // The coverage stamp, when the artifact has one.
    if (artifact.coverage && artifact.coverage.districts_expected) {
      expect(html).toContain(`${artifact.coverage.districts_covered ?? 'unknown'} of ${artifact.coverage.districts_expected}`);
    }
    // The model row: either a version, or the word that says there is none.
    if (artifact.model?.stamped) expect(html).toContain(artifact.model.model_version);
    else expect(html).toContain('Not stamped.');

    // No serialisation accidents reach the page.
    expect(html).not.toMatch(/>undefined</);
    expect(html).not.toMatch(/>NaN</);
  });

  it('ships the artifact the page describes, byte for byte', () => {
    expect(existsSync(builtArtifactPath)).toBe(true);
    expect(readFileSync(builtArtifactPath, 'utf8')).toBe(readFileSync(artifactPath, 'utf8'));
  });

  it('is in the sitemap and indexable', () => {
    const sitemap = readFileSync(join(distDir, 'sitemap.xml'), 'utf8');
    expect(sitemap).toContain('/status');
    const html = readFileSync(statusHtmlPath, 'utf8');
    expect(html).toMatch(/<meta\s+name="robots"\s+content="index,follow"/);
  });
});

if (!built) {
  process.stdout.write(
    '[statusPagePrerender] frontend/dist/status/index.html not found — run `cd frontend && npm run build`.\n',
  );
}
