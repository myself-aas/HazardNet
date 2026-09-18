/**
 * @jest-environment node
 *
 * The public-surface contract (PR #29).
 *
 * The 2026-09-18 front-door split moved the GIS console from `/` to `/live` and gave `/` the
 * editorial page. Four properties of that split are easy to undo by accident, in ways no
 * rendering test would notice, and this suite pins all of them:
 *
 *   1. **`/` is not the console and `/live` is not an article.** The route table is the only
 *      place that decides this, so the assertions read `App.tsx` rather than a rendered
 *      tree — the regression is a one-line edit, and it should fail as loudly as the
 *      contract it breaks.
 *   2. **The full-bleed layout follows the console.** `isHomePage` drives the transparent
 *      masthead, the unpadded `<main>` and the suppressed footer; if it kept matching `/`,
 *      the front door would render as a map shell with no footer.
 *   3. **Every external citation is renderable.** `scripts/prerender.mjs` deliberately drops
 *      an external link whose host is not in `ALLOWED_LINK_HOSTS`. Adding a source to the
 *      copy without allow-listing its host therefore ships a static page *missing* a citation
 *      the hydrated app still shows — invisible in a browser and wrong in exactly the way
 *      this project cares about, so it is a test.
 *   4. **The dated knowledge-product ledger does not drift.** The front door lists each
 *      product with the review date that product's own route carries.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..');
const frontend = join(repoRoot, 'frontend');

const read = (relative) => readFileSync(join(frontend, relative), 'utf8');
const readJson = (relative) => JSON.parse(read(relative));

const site = readJson('src/content/site-routes.json');
const generated = readJson('src/content/generated-routes.json');
const allRoutes = [...site.routes, ...generated.routes];

describe('route table', () => {
  const app = read('src/App.tsx');

  test('`/` renders the editorial front door, not the console', () => {
    expect(app).toMatch(/<Route\s+path="\/"\s+element=\{<FrontDoor\s*\/>\}\s*\/>/);
    expect(app).not.toMatch(/<Route\s+path="\/"\s+element=\{<Dashboard/);
  });

  test('`/live` renders the console', () => {
    expect(app).toMatch(/<Route\s+path="\/live"\s+element=\{<Dashboard[^>]*isFullScreen=\{true\}/);
  });

  test('the legacy console deep links still resolve to the console', () => {
    for (const legacy of ['/home', '/home/overview', '/forecast/overview']) {
      expect(app).toMatch(new RegExp(`<Route\\s+path="${legacy}"\\s+element=\\{<Dashboard`));
    }
  });

  test('the full-bleed layout follows the console, not the root', () => {
    const match = app.match(/const isHomePage =([\s\S]*?);/);
    expect(match).not.toBeNull();
    const block = match[1];
    expect(block).toMatch(/location\.pathname === '\/live'/);
    expect(block).not.toMatch(/location\.pathname === '\/'/);
  });
});

describe('front-door copy', () => {
  const front = site.routes.find((r) => r.path === '/');
  const live = site.routes.find((r) => r.path === '/live');

  test('`/` is a real editorial page', () => {
    expect(front).toBeDefined();
    expect(front.h1).toBeTruthy();
    expect(front.standfirst.length).toBeGreaterThan(120);
    expect(front.sections.length).toBeGreaterThanOrEqual(5);
    expect(front.faqs.length).toBeGreaterThanOrEqual(1);
    expect(front.robots).toBe('index,follow');
    // The front door is a normal document: chrome, footer, no full-bleed shell.
    expect(front.appShell).toBe(false);
  });

  test('`/live` keeps the console copy and is indexable in its own right', () => {
    expect(live).toBeDefined();
    expect(live.appShell).toBe(true);
    expect(live.robots).toBe('index,follow');
    expect(live.sections.length).toBeGreaterThan(0);
    // A console that is not in the sitemap cannot be the canonical address for the map.
    expect(live.sitemap.priority).toBeGreaterThanOrEqual(0.8);
  });

  test('the authority boundary is stated on the front door', () => {
    const text = [
      front.standfirst,
      ...front.sections.flatMap((section) => [
        section.h2 ?? '',
        ...(section.paragraphs ?? []),
        ...(section.bullets ?? []),
        ...(section.links ?? []).map((link) => `${link.label} ${link.href}`),
      ]),
      ...front.faqs.map((faq) => `${faq.question} ${faq.answer}`),
    ].join('\n');

    // The three agencies the audit named, plus the emergency number: a reader who
    // reads only this page must still be told where the official record lives.
    for (const marker of [
      /Bangladesh Meteorological Department/,
      /Flood Forecasting and Warning Centre/,
      /Department of Disaster Management/,
      /999/,
    ]) {
      expect(text).toMatch(marker);
    }
    for (const host of ['bmd.gov.bd', 'ffwc.gov.bd', 'ddm.gov.bd']) {
      expect(text).toContain(host);
    }
  });
});

describe('citation links survive the prerenderer', () => {
  // `renderLinks` drops an external link whose host is not allow-listed, on purpose: the
  // static HTML is composed from copy that a maintainer could otherwise turn into an
  // arbitrary outbound link. The cost of that rule is this test — the allow-list and the
  // copy have to move together.
  const prerender = read('scripts/prerender.mjs');
  const allowed = new Set(
    (prerender.match(/const ALLOWED_LINK_HOSTS = new Set\(\[([\s\S]*?)\]\)/)[1].match(/'[^']+'/g) ?? []).map(
      (entry) => entry.replace(/'/g, '')
    )
  );

  test('the allow-list is parseable and non-trivial', () => {
    expect(allowed.size).toBeGreaterThan(10);
  });

  test('every external link in the public copy has an allow-listed host', () => {
    const missing = [];
    for (const r of allRoutes) {
      for (const section of r.sections ?? []) {
        for (const link of section.links ?? []) {
          if (!/^https?:\/\//i.test(link.href)) continue;
          const host = new URL(link.href).host;
          if (!allowed.has(host)) missing.push(`${r.path} → ${host} (${link.label})`);
        }
      }
    }
    // Joined rather than compared as an array: the failure message then names the hosts.
    expect(missing.join(', ')).toBe('');
  });
});

describe('knowledge-product ledger', () => {
  const front = site.routes.find((r) => r.path === '/');
  const table = (front.sections.find((section) => section.table) ?? {}).table;

  test('the ledger names a product, a date and a route', () => {
    expect(table).toBeDefined();
    expect(table.columns).toHaveLength(4);
    expect(table.rows.length).toBeGreaterThanOrEqual(5);
  });

  test('each row’s review date matches the route it points at', () => {
    const mismatches = [];
    for (const [product, , date, where] of table.rows) {
      // Only in-repo routes carry a review date the build can be held to; external
      // "where it lives" strings are citations, not part of this contract.
      if (!where.startsWith('/')) continue;
      const target = allRoutes.find((r) => r.path === where);
      if (!target) {
        mismatches.push(`${product}: ${where} is not a known route`);
        continue;
      }
      if (target.updated !== date) {
        mismatches.push(`${product}: ledger says ${date}, ${where} says ${target.updated ?? 'nothing'}`);
      }
    }
    expect(mismatches.join('; ')).toBe('');
  });
});
