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
 *
 * The 2026-09-19 landing-page redesign added three more properties, each of which is as easy
 * to undo by accident as the four above, so they are pinned here rather than in a review
 * comment: the Bengali editorial block mirrors the English structure (and cannot introduce a
 * number the English copy does not carry); the page makes no claim the repository cannot
 * support (the four checked here were all in circulation in one draft or another); and the
 * two live panels carry no hard-coded figure.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { namesRepoFile } from '../scripts/lib/public-text.mjs';

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
    (prerender.match(/const ALLOWED_LINK_HOSTS = new Set\(\[([\s\S]*?)\]\)/)[1].match(/'[^']+'/g) ?? []).map((entry) =>
      entry.replace(/'/g, ''),
    ),
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

  test('each in-repo row reads its review date from the route it points at', () => {
    // The date column is a reference (`@review-date:/model-performance`), not a date anyone
    // typed. `/model-performance`'s `updated` is derived — the content engine sets it to the
    // newest hindcast report's build date — so a typed cell goes stale the first time that
    // workflow runs. It did, on 2026-09-19, and the previous version of this test caught it
    // after the fact; a reference cannot drift at all.
    const dates = new Map(allRoutes.map((r) => [r.path, r.updated ?? null]));
    const mismatches = [];
    for (const [product, , date, where] of table.rows) {
      // Only in-repo routes carry a review date the build can be held to; external
      // "where it lives" strings are citations, not part of this contract.
      if (!where.startsWith('/')) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) mismatches.push(`${product}: undated row with no reference`);
        continue;
      }
      if (date !== `@review-date:${where}`) {
        mismatches.push(`${product}: date cell is "${date}", not a reference to ${where}`);
        continue;
      }
      if (!dates.has(where)) mismatches.push(`${product}: ${where} is not a route this build publishes`);
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(dates.get(where) ?? '')) {
        mismatches.push(`${product}: ${where} carries no review date, so the reference resolves to nothing`);
      }
    }
    expect(mismatches.join('; ')).toBe('');
  });

  test('both renderers understand the reference', () => {
    // The static HTML and the hydrated app are composed by two different programs. A reference
    // only one of them resolves would publish two different dates for the same page — the exact
    // class of split this suite exists to prevent.
    expect(read('scripts/prerender.mjs')).toMatch(/@review-date/);
    expect(read('src/hooks/usePageSeo.ts')).toMatch(/@review-date/);
  });
});

/* ───────────────────────── the bilingual front door (2026-09-19) ───────────────────────── */

/** Bengali digits → ASCII, so the two copies can be compared as numbers rather than glyphs. */
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const toAsciiDigits = (text) => text.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

/** Every numeric token in a body of copy, with separators removed (2,931 → 2931). */
function numbersIn(text) {
  const found = new Set();
  for (const match of toAsciiDigits(text).matchAll(/[0-9]+(?:[.,][0-9]+)*/g)) {
    found.add(match[0].replace(/[.,]/g, ''));
  }
  return found;
}

const routeText = (route) =>
  [
    route.h1 ?? '',
    route.standfirst ?? '',
    ...(route.sections ?? []).flatMap((section) => [
      section.h2 ?? '',
      ...(section.paragraphs ?? []),
      ...(section.bullets ?? []),
      ...(section.callout ? [section.callout.text] : []),
      ...(section.links ?? []).map((link) => `${link.label} ${link.href}`),
      ...(section.table ? [section.table.caption ?? '', ...section.table.columns, ...section.table.rows.flat()] : []),
    ]),
    ...(route.faqs ?? []).map((faq) => `${faq.question} ${faq.answer}`),
  ].join('\n');

describe('the Bengali front door', () => {
  const front = site.routes.find((r) => r.path === '/');
  const bn = front.i18n?.bn;

  test('the route carries a Bengali block, marked with its review status', () => {
    expect(bn).toBeDefined();
    // The marker is the audit trail, not a decoration: either the copy is a draft that has
    // not been read, or it names who read it and when. "Approved" with no date and no reader
    // is a claim nobody can check, so both are required.
    expect(['pending-native-speaker', 'approved-native-speaker']).toContain(bn.review);
    if (bn.review === 'approved-native-speaker') {
      expect(bn.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(bn.reviewedBy).toBeTruthy();
    }
  });

  test('the Bengali block mirrors the English structure', () => {
    expect(bn.h1).toBeTruthy();
    expect(bn.standfirst.length).toBeGreaterThan(80);
    expect(bn.sections).toHaveLength(front.sections.length);
    expect(bn.faqs).toHaveLength(front.faqs.length);
    // A translation may reword a page; it may not shorten or reorder one. Comparing the
    // link targets section by section is what makes that mechanical.
    front.sections.forEach((section, index) => {
      expect(bn.sections[index].h2).toBeTruthy();
      expect((bn.sections[index].links ?? []).map((l) => l.href)).toEqual((section.links ?? []).map((l) => l.href));
      expect(bn.sections[index].paragraphs ?? []).toHaveLength((section.paragraphs ?? []).length);
      expect(bn.sections[index].bullets ?? []).toHaveLength((section.bullets ?? []).length);
      if (section.table) {
        expect(bn.sections[index].table.rows).toHaveLength(section.table.rows.length);
        // review dates and route paths are facts, not copy: they must be identical
        expect(bn.sections[index].table.rows.map((r) => [r[2], r[3]])).toEqual(
          section.table.rows.map((r) => [r[2], r[3]]),
        );
      }
    });
  });

  test('the Bengali copy introduces no number the English copy does not carry', () => {
    // C3 applies in both languages: a figure that exists only in the translation is a figure
    // nothing was checked against. Bengali digits are normalised first, so this cannot be
    // evaded by writing the claim in the other script.
    const english = numbersIn(routeText(front));
    const bengali = numbersIn(routeText({ ...front, ...bn }));
    const unregistered = [...bengali].filter((n) => !english.has(n));
    expect(unregistered.join(', ')).toBe('');
  });

  test('the review obligation the marker records is written down somewhere durable', () => {
    const surface = readFileSync(join(repoRoot, 'docs/PUBLIC_SURFACE.md'), 'utf8');
    expect(surface).toMatch(/pending-native-speaker|native-speaker review|Action 6c/);
  });
});

/* ─────────── claims this repository cannot support (checked against the copy) ─────────── */

describe('claims the front door does not make', () => {
  const front = site.routes.find((r) => r.path === '/');
  const text = `${routeText(front)}\n${routeText({ ...front, ...front.i18n.bn })}`;
  const methodology = readJson('src/content/hazard-methodology.json');
  const methodologyText = JSON.stringify(methodology);

  test('no hazard class outside the model’s output vocabulary', () => {
    // `Models/labels.json` is the vocabulary: eight classes, and landslide is not one of them.
    // A front door that promises a ninth hazard promises something the pipeline cannot emit.
    expect(text).not.toMatch(/landslide/i);
    expect(text).not.toMatch(/ভূমিধস/);
  });

  test('no sensor named as a live input that the forecast path does not read', () => {
    // MODIS layers exist in the ETL for the archive path (scripts/etl/sources.py) and are not
    // inputs to the live tensor. hazard-methodology.json says exactly that; the front door
    // therefore does not name MODIS at all rather than naming it with a qualifier a reader
    // will skip.
    expect(text).not.toMatch(/MODIS/i);
    expect(methodologyText).toMatch(/not live inputs to the forecast/);
  });

  test('the training-archive figure is reported, never asserted as verified', () => {
    // 2,931 is a count of event–district observations in a third-party archive this repository
    // does not redistribute, and no deployment here loads it (`event_archive: null`).
    expect(text).toMatch(/2,931[\s\S]{0,240}reported rather than verified/);
    expect(text).not.toMatch(/trained on 2,931 (events|records)/i);
  });

  test('the publication gate is described as the code implements it', () => {
    // backend/alerts/assess.js publishes automatically at or below `max_auto_publish_level`
    // (WATCH in this deployment) and requires a named duty officer above it. "A human reviews
    // every warning" is the flattering version, and it is false.
    expect(text).toMatch(/at or below its configured ceiling/);
    expect(text).toMatch(/WATCH/);
    expect(text).not.toMatch(/every (alert|warning) is (reviewed|checked) by a human/i);
    expect(text).toMatch(/named duty officer/);
  });

  test('BMD and FFWC are named as adapters that exist, not as feeds this run reads', () => {
    // The bulletin parser and the hydrology adapter are real and tested, and no workflow
    // supplies them data, so nothing published derives from a bulletin. The source line has
    // to say both halves. It used to say the second half by naming the module; the naming
    // went with every other repository location on this surface (docs/PUBLIC_SURFACE.md §3),
    // and what remains is the claim a reader can act on: the code exists, and no data
    // reaches it in this deployment.
    const claims = methodology.hazards.flatMap((hazard) =>
      (hazard.sources ?? []).filter((source) => /BMD|FFWC/.test(source)),
    );
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) {
      expect(claim).not.toMatch(/ingested as text/);
      expect(claim).toMatch(/no (bulletin|FFWC record) is supplied/);
      expect(claim).toMatch(/(parser|adapter) exists and is tested/);
      expect(namesRepoFile(claim)).toBe(false);
    }
  });
});

/* ─────────────── the live panels carry no figure of their own (2026-09-19) ─────────────── */

describe('the front door’s live panels', () => {
  const strip = read('src/components/frontdoor/LiveStatusStrip.tsx');
  const visual = read('src/components/frontdoor/RunVisual.tsx');
  const page = read('src/pages/FrontDoor.tsx');

  test('both panels are wired into the page', () => {
    expect(page).toMatch(/<LiveStatusStrip/);
    expect(page).toMatch(/<RunVisual/);
    // The hero visual is not a photograph and not a map: the map is at /live (rule 1 above).
    expect(page).not.toMatch(/<img[^>]+src=/i);
    expect(visual).not.toMatch(/<img|<svg/i);
    expect(strip).not.toMatch(/<img|<svg/i);
  });

  test('neither panel contains a hard-coded figure with a unit attached', () => {
    // Every number these two components print arrives through props from an artifact. The
    // review that prompted them supplied a worked example — "2 active alerts · 61 districts
    // normal" — whose numbers exist nowhere in this repository; this is the check that keeps
    // that example from being pasted in as a placeholder and shipped.
    // Prose about the rule is not copy: both components explain, in their header comments, the
    // invented example they refuse to render, and that quotation has to stay in the source.
    // Only code is scanned. The stripper is deliberately crude — block comments and whole-line
    // `//` comments — because a literal in these files can contain `//` in a path.
    const codeOnly = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    const offenders = [];
    for (const [name, source] of [
      ['LiveStatusStrip', strip],
      ['RunVisual', visual],
    ]) {
      for (const match of codeOnly(source).matchAll(/(['"`])([^'"`]*\d[^'"`]*)\1/g)) {
        const literal = match[2];
        if (/\d+\s*(districts?|alerts?|rows?|units?|%|per cent)/i.test(literal)) offenders.push(`${name}: ${literal}`);
      }
    }
    expect(offenders.join('; ')).toBe('');
  });

  test('the strip is an announced region and the visual is labelled', () => {
    expect(strip).toMatch(/role="status"/);
    expect(strip).toMatch(/aria-live="polite"/);
    // A figure with a caption that supplies its accessible name — not an `aside`, which
    // would nest a complementary landmark inside the hero's banner.
    expect(visual).toMatch(/<figure/);
    expect(visual).toMatch(/aria-labelledby="front-door-run-visual-caption"/);
    expect(visual).toMatch(/<figcaption id="front-door-run-visual-caption">/);
    expect(visual).not.toMatch(/<aside/);
    // The coverage bar is decoration beside a textual value, so it is hidden from AT rather
    // than shipped as a nameless graphic (the `svg-img-alt` defect class from the same review).
    expect(visual).toMatch(/aria-hidden="true"/);
  });
});
