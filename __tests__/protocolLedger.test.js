/**
 * The protocol's maintain-phase contract (docs/agents/impeccable-protocol.md §2.12).
 *
 * `scripts/protocol.mjs` is the only thing that holds the router and the surface briefs to
 * each other. If it silently stopped parsing — a JSX shape it does not understand, a
 * front-matter key renamed — the check would report a clean ledger while claiming nothing,
 * which is worse than no check at all. These assertions pin the four promises the script
 * makes, and the one Review artifact that already exists.
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');

function protocolJson() {
  return JSON.parse(
    execFileSync(process.execPath, ['scripts/protocol.mjs', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    }),
  );
}

describe('Impeccable protocol — routes and surface briefs', () => {
  const report = protocolJson();

  test('every surface brief parses, with a recognised mode and at least one route', () => {
    expect(report.surfaces.length).toBeGreaterThanOrEqual(15);
    for (const surface of report.surfaces) {
      expect(['Persuade', 'Operate', 'Read', 'Experience']).toContain(surface.mode);
      expect(surface.routes.length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(ROOT, surface.brief))).toBe(true);
    }
  });

  test('the router is parsed: public routes, redirects and their components', () => {
    expect(report.counts.routes).toBeGreaterThan(50);
    expect(report.counts.publicRoutes + report.counts.redirects).toBe(report.counts.routes);
    // Redirects are `<Navigate>` elements and must not be reported as missing a brief.
    expect(report.redirects.every((r) => r.path && r.component)).toBe(true);
    // Every public route resolves to a component name, whatever file it lives in.
    expect(report.routes.every((r) => r.component)).toBe(true);
    // Routes that render a shared renderer living outside `pages/` are allowed not to
    // resolve to a page file; anything else failing to resolve means the parser lost a
    // component and the ledger is quietly under-reporting.
    const sharedRenderers = new Set([
      'ArticlePage',
      'GeneratedContentPage',
      'BlogStudioPage',
      'BlogEditorPage',
    ]);
    const unresolved = report.routes.filter((r) => !r.page);
    expect(unresolved.every((r) => sharedRenderers.has(r.component))).toBe(true);
    const withPage = report.routes.filter((r) => r.page).length;
    expect(withPage / report.routes.length).toBeGreaterThan(0.6);
  });

  test('no hard gaps: every public route is claimed and every brief route exists', () => {
    const errors = report.findings.filter((f) => f.severity === 'error');
    expect(errors).toEqual([]);
    expect(report.counts.claimed).toBe(report.counts.publicRoutes);
  });

  test('a wildcard brief does not claim every route in the ledger', () => {
    const notFound = report.surfaces.find((s) => s.surface === 'not-found');
    expect(notFound).toBeDefined();
    expect(notFound.routes).toContain('*');
    // `*` catches everything the router sends it; the count only reflects named routes.
    expect(notFound.claimedRoutes).toBeLessThan(report.counts.publicRoutes / 2);
  });

  test('the seeded Review snapshot for the front door is present and scored', () => {
    const frontDoor = report.surfaces.find((s) => s.surface === 'front-door');
    expect(frontDoor.critique).toBeTruthy();
    const snapshot = fs.readFileSync(
      path.join(ROOT, '.impeccable', 'critique', frontDoor.critique),
      'utf8',
    );
    // A degraded run must say so; the banner is the difference between a weaker critique
    // and a silent one.
    expect(snapshot).toMatch(/DEGRADED: single-context/);
    expect(snapshot).toMatch(/^---\n[\s\S]*?total_score: 32/m);
    expect(snapshot).toMatch(/max_score: 40/);
  });

  test('the check exits zero on a clean ledger', () => {
    expect(() =>
      execFileSync(process.execPath, ['scripts/protocol.mjs', '--check'], {
        cwd: ROOT,
        encoding: 'utf8',
      }),
    ).not.toThrow();
  });
});
