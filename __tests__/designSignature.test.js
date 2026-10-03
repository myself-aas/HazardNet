/**
 * Gate for backlog 16 of docs/audits/2026-10-03-frontend-design-system-audit.md:
 *
 *   "Delete the 19 decorative status dots; de-duplicate the 15 `md:grid-cols-3` marketing rows."
 *
 * Both halves are judgement calls, which is why they were deferred, and both are the kind of
 * judgement that is easy to lose: a dot is one `<span>` and a card row is one class string, so the
 * pattern comes back the next time someone needs a heading to feel alive. The ledger records the
 * judgement per instance (data/design/decorative-signature-baseline.json) and this suite holds it
 * against a live scan:
 *
 *   1. every status dot in frontend/src is accounted for - the ones that remain are severity or
 *      state encoders, named with their reason;
 *   2. every three-column row on the page surface is accounted for, and a feature/card row may not
 *      repeat a signature that another page already owns.
 *
 * A new dot, a new three-across row, or a pasted card row fails here with the file name.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'frontend/src');
const PAGES = join(SRC, 'pages');
const BASELINE = join(ROOT, 'data/design/decorative-signature-baseline.json');

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

const rel = (file, base) => relative(base, file).split('\\').join('/');
const ledger = JSON.parse(readFileSync(BASELINE, 'utf8'));

/* ------------------------------------------------------------------ *
 * 1. Status dots
 * ------------------------------------------------------------------ */

/**
 * A dot, by the audit's own definition: a small square element rounded into a circle and painted
 * with a token colour. The size is what separates a dot from a pill, a badge or a button; the
 * detector deliberately does not try to read intent, because intent is what the ledger is for.
 */
const SMALL = '(1|1\\.5|2|2\\.5|3|3\\.5|4)';
const isDot = (line) =>
  /rounded-full/.test(line) &&
  /\bbg-[a-z]/.test(line) &&
  new RegExp(`\\bw-${SMALL}\\b`).test(line) &&
  new RegExp(`\\bh-${SMALL}\\b`).test(line);

function scanDots() {
  const found = {};
  for (const file of walk(SRC)) {
    const r = rel(file, SRC);
    if (isTestFile(r)) continue;
    const hits = readFileSync(file, 'utf8')
      .split('\n')
      .filter(isDot).length;
    if (hits > 0) found[r] = hits;
  }
  return found;
}

describe('backlog 16 - status dots', () => {
  const kept = ledger.statusDots.kept;
  const found = scanDots();

  it('finds no status dot that is not accounted for', () => {
    const unledgered = Object.keys(found).filter((file) => !kept[file]);
    expect(unledgered).toEqual([]);
  });

  it('every dot that was kept says what data it carries', () => {
    for (const [file, entry] of Object.entries(kept)) {
      expect(typeof entry.reason).toBe('string');
      expect(entry.reason.length).toBeGreaterThan(40);
      expect(found[file]).toBe(entry.count);
    }
  });

  it('no file gained a dot since the sweep', () => {
    for (const [file, count] of Object.entries(found)) {
      expect(`${file}:${count}`).toBe(`${file}:${kept[file].count}`);
    }
  });

  it('the ledger has no stale entries', () => {
    // A file that lost its dot must lose its ledger entry in the same commit, or the ledger
    // stops describing the tree.
    for (const file of Object.keys(kept)) {
      expect(found[file]).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * 2. Equal three-card rows
 * ------------------------------------------------------------------ */

/** The three-across shape: any class string that lands on three columns at some breakpoint. */
function scanThreeColumnRows() {
  const rows = {};
  for (const file of walk(PAGES)) {
    // Keyed from `frontend/src` so the ledger reads `pages/About.tsx`, the same way the table-stack
    // ledger reads its entries.
    const r = rel(file, SRC);
    if (isTestFile(r)) continue;
    const counts = {};
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const quoted = line.match(/"([^"]*grid-cols-[^"]*)"/) ?? line.match(/`([^`]*grid-cols-[^`]*)`/);
      if (!quoted) continue;
      const tokens = quoted[1].split(/\s+/).filter((t) => t.includes('grid-cols'));
      if (!tokens.some((t) => t.endsWith('cols-3'))) continue;
      const signature = [...tokens].sort().join(' ');
      counts[signature] = (counts[signature] ?? 0) + 1;
    }
    if (Object.keys(counts).length > 0) rows[r] = counts;
  }
  return rows;
}

describe('backlog 16 - three-column rows', () => {
  const ledgerRows = ledger.equalThreeCardRows.rows;
  const found = scanThreeColumnRows();

  const signaturesFor = (entry) =>
    Object.fromEntries(Object.entries(entry).map(([sig, v]) => [sig, v]));

  it('finds no three-column row that is not in the ledger', () => {
    expect(Object.keys(found).sort()).toEqual(Object.keys(ledgerRows).sort());
  });

  it('each ledgered row still exists, with the same count', () => {
    for (const [file, entry] of Object.entries(ledgerRows)) {
      const expected = signaturesFor(entry);
      const actual = found[file] ?? {};
      for (const [signature, spec] of Object.entries(expected)) {
        expect(actual[signature]).toBe(spec.count ?? 1);
      }
    }
  });

  it('every row says what kind of content it holds', () => {
    const KINDS = new Set(['cards', 'index', 'stats', 'console']);
    for (const entry of Object.values(ledgerRows)) {
      for (const spec of Object.values(entry)) {
        expect(KINDS.has(spec.kind)).toBe(true);
        expect(spec.reason.length).toBeGreaterThan(30);
      }
    }
  });

  it('a feature/card row may not repeat another page\'s signature', () => {
    // This is the de-duplication half of the row: reference indexes and stat rows are allowed to
    // share a shape, feature rows are not - the third repeat of "three equal cards" is exactly the
    // generic-AI signature the audit asked to remove.
    const owners = new Map();
    for (const [file, entry] of Object.entries(ledgerRows)) {
      for (const [signature, spec] of Object.entries(entry)) {
        if (spec.kind !== 'cards') continue;
        const previous = owners.get(signature);
        expect(previous ? `${signature} already used by ${previous}` : null).toBeNull();
        owners.set(signature, file);
      }
    }
  });

  it('keeps the marketing feature rows varied', () => {
    // About and Analytics were the two pages the audit named: their card rows are now a lead card
    // plus a pair, and a 2+1+1 bento, so neither page contains the three-across shape at all.
    const about = readFileSync(join(PAGES, 'About.tsx'), 'utf8');
    const analytics = readFileSync(join(PAGES, 'AnalyticsPage.tsx'), 'utf8');
    expect(/grid-cols-3/.test(about)).toBe(false);
    expect(/md:grid-cols-4/.test(analytics)).toBe(true);
  });
});
