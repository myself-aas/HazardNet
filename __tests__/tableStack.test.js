/**
 * Gate for criterion 1 of the mobile-conversion acceptance list
 * (docs/audits/2026-10-03-frontend-design-system-audit.md §5.5):
 *
 *   "No page renders a table as its primary content below 768px; every table
 *    has a card-stack alternative."
 *
 * Why this is a test and not a note. A table is the one component that cannot
 * be made mobile-portable at render time: at 390px it either scrolls sideways
 * (content off-screen, no affordance that it exists) or squeezes its columns
 * into 12px type (the floor this repo just raised). It is also the one pattern
 * with no React Native port at all - there is no `<table>` in the shell, so a
 * screen built around one has to be rewritten rather than restyled when Phase
 * 11 lands.
 *
 * The gate works as a ratchet, the way data/design/hex-baseline.json does for
 * colour literals: data/design/table-stack-baseline.json lists every `<table>`
 * in frontend/src and says which branch renders below md. Adding a table that
 * is not in the ledger, or removing a card stack, fails here with the file
 * name in the message.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'frontend/src');
const BASELINE = join(ROOT, 'data/design/table-stack-baseline.json');
/** The shared stack itself: the one file allowed to pair a `<table>` with the card list. */
const IMPLEMENTATION = 'components/ui/CardStackTable.tsx';
/** Test fixtures may quote markup (the blog sanitizer does). They never render. */
const isTestFile = (rel) => rel.includes('__tests__') || rel.includes('.test.');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Count of `<table` occurrences, comments included: the ledger is a text census, not a parse. */
const countTables = (text) => (text.match(/<table/g) ?? []).length;

const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const ledger = JSON.parse(readFileSync(BASELINE, 'utf8'));
const entries = ledger.entries;

function census() {
  const found = {};
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file).split('\\').join('/');
    if (rel === IMPLEMENTATION || isTestFile(rel)) continue;
    const n = countTables(readFileSync(file, 'utf8'));
    if (n > 0) found[rel] = n;
  }
  return found;
}

describe('table card-stack coverage', () => {
  const found = census();

  it('ledgers every table in frontend/src, so a new one cannot skip this gate', () => {
    expect(Object.keys(found).filter((rel) => !(rel in entries))).toEqual([]);
  });

  it('has no stale ledger entries (the files exist and still hold the same table count)', () => {
    const stale = [];
    for (const [rel, entry] of Object.entries(entries)) {
      if (!(rel in found)) stale.push({ rel, expected: entry.tables, actual: 0 });
      else if (found[rel] !== entry.tables) stale.push({ rel, expected: entry.tables, actual: found[rel] });
    }
    expect(stale).toEqual([]);
  });

  it('every entry declares a known status, and a reason where the status allows a table', () => {
    for (const [rel, entry] of Object.entries(entries)) {
      expect(['converted', 'cardStacked', 'allowListed']).toContain(entry.status);
      expect(rel.endsWith('.tsx')).toBe(true);
      if (entry.status === 'cardStacked' || entry.status === 'allowListed') {
        expect(typeof entry.reason).toBe('string');
        expect(entry.reason.length).toBeGreaterThan(60);
      }
      if (entry.remaining) {
        expect(entry.remaining).toBeLessThanOrEqual(entry.tables);
        expect(typeof entry.remainingReason).toBe('string');
        expect(entry.remainingReason.length).toBeGreaterThan(60);
      }
    }
  });

  it('keeps every converted file on the shared stack, below md', () => {
    const converted = Object.entries(entries).filter(([, e]) => e.status === 'converted');
    // Ten table-carrying files plus the two editorial renderers (asserted below),
    // which no longer carry a `<table>` at all.
    expect(converted.length).toBeGreaterThanOrEqual(10);
    for (const rel of ['pages/FrontDoor.tsx', 'components/ArticlePage.tsx']) {
      expect(entries[rel]).toBeUndefined();
    }
    for (const [rel] of converted) {
      const text = read(rel);
      // A converted file either uses the shared component, or is the editorial pair
      // that no longer carries a `<table>` at all.
      const usesStack = /CardStackRows|CardStackTable/.test(text);
      expect(usesStack || countTables(text) === 0).toBe(true);
      // ...and its table, where it still has one, is the md+ branch.
      if (countTables(text) > 0) {
        expect(text).toMatch(/className="[^"]*\bhidden\b[^"]*(?:md|lg):block/);
      }
    }
  });

  it('keeps the phone cards out of the horizontal scroll and inside the token system', () => {
    const source = read(IMPLEMENTATION);
    const stackBody = source.slice(
      source.indexOf('export const CardStackRows'),
      source.indexOf('export interface CardStackTableProps'),
    );
    expect(stackBody).toMatch(/<ul/);
    expect(stackBody).not.toMatch(/overflow-x-auto/);
    // The console panels that are dark in either theme get the `onDark` ink set,
    // so a card cannot inherit near-black text on a near-black surface.
    expect(source).toMatch(/tone\?: 'default' \| 'onDark'/);
    expect(read('components/DistrictVulnerabilityTable.tsx')).toMatch(/tone="onDark"/);
    expect(read('components/HistoricalHazardCatalog.tsx')).toMatch(/tone="onDark"/);
    // Colours come from the carbon roles, so the stack needs no dark-mode or
    // prefers-contrast rules of its own.
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('keeps the editorial renderers on the shared stack', () => {
    // The landing page and every article page render a section table from
    // content/site-routes.json; they are the surfaces the audit measured.
    for (const rel of ['pages/FrontDoor.tsx', 'components/ArticlePage.tsx']) {
      const text = read(rel);
      expect(text).toMatch(/components\/ui\/CardStackTable|from '\.\/ui\/CardStackTable'/);
      expect(countTables(text)).toBe(0);
    }
  });
});

describe('the shared card stack', () => {
  const source = read(IMPLEMENTATION);

  it('renders one branch per breakpoint from one data source', () => {
    expect(source).toMatch(/md:hidden/);
    expect(source).toMatch(/hidden[^"]*md:block/);
    expect(source).toMatch(/rows\.map/);
    expect(source).toMatch(/columns\.map/);
  });

  it('gives the phone branch the same semantics the table has', () => {
    // A description list of label/value pairs, named by the caption, with the
    // first cell promoted to the card heading. A screen reader then gets the
    // column name with each value, exactly as the `<th scope="col">` row does.
    expect(source).toMatch(/<dl/);
    expect(source).toMatch(/<dt/);
    expect(source).toMatch(/<dd/);
    expect(source).toMatch(/aria-labelledby=\{labelledBy\}/);
    expect(source).toMatch(/<caption id=\{captionId\}/);
    expect(source).toMatch(/labelledBy=\{caption \? captionId : undefined\}/);
  });
});
