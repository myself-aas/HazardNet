/**
 * Gate for backlog 13 of docs/audits/2026-10-03-frontend-design-system-audit.md:
 *
 *   "Four-state checklist for all 35 pages" - loading / empty / error+retry / success, per page.
 *
 * The checklist is a judgement per page (a static editorial page has no loading state to show; a
 * form's retry is the button the reader still has), so it lives in data/design/four-state-baseline.json
 * with the reason written down, and this suite holds it against the source:
 *
 *   1. every `frontend/src/pages/*.tsx` file is ledgered, and every ledgered file exists;
 *   2. every state either names evidence that is still in the file, or says why it does not exist
 *      - so a state cannot be removed without someone changing the ledger;
 *   3. a page that reads over the network may not declare its loading or error state
 *      not-applicable;
 *   4. a state that is not retryable has to say what the reader does instead;
 *   5. the counts are pinned: reclassifying a page, or adding a fetch page, is a decision.
 *
 * No headless browser exists in this repository's test environment, so "evidence" means the
 * source contains the block - not that it renders on a device. That is the same limit every other
 * source-level gate here states, and it is why the evidence is a rendered-block marker rather than
 * a state variable name.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = join(ROOT, 'frontend/src/pages');
const BASELINE = join(ROOT, 'data/design/four-state-baseline.json');

const ledger = JSON.parse(readFileSync(BASELINE, 'utf8'));

/** Every page file under pages/, relative to it, including the dashboard/ subdirectory. */
function walkPages(dir = PAGES, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === '__tests__') continue;
    if (statSync(full).isDirectory()) out.push(...walkPages(full, `${prefix}${entry}/`));
    else if (entry.endsWith('.tsx')) out.push(`${prefix}${entry}`);
  }
  return out;
}

const files = walkPages();
const source = new Map(files.map((name) => [name, readFileSync(join(PAGES, name), 'utf8')]));

const STATES = ledger.states;
const KINDS = new Set(['page', 'notice', 'inline', 'text', 'absent', 'not-applicable']);
/** Every state that is not one of these two has to name evidence in the file. */
const NO_EVIDENCE = new Set(['absent', 'not-applicable']);

describe('four-state checklist', () => {
  it('ledgers every page file, and no file that is not there', () => {
    const ledgered = Object.keys(ledger.entries).map((key) => key.replace(/^pages\//, '')).sort();
    expect(ledgered).toEqual([...files].sort());
  });

  it('declares the four states for every page, with a valid kind', () => {
    const problems = [];
    for (const [page, entry] of Object.entries(ledger.entries)) {
      for (const state of STATES) {
        const cell = entry[state];
        if (!cell) {
          problems.push(`${page}: no ${state} state`);
          continue;
        }
        if (!KINDS.has(cell.kind)) problems.push(`${page}: ${state} has kind "${cell.kind}"`);
        if (NO_EVIDENCE.has(cell.kind) && !(cell.reason || '').trim()) {
          problems.push(`${page}: ${state} is ${cell.kind} without a reason`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('still finds the evidence each present state names', () => {
    const problems = [];
    for (const [page, entry] of Object.entries(ledger.entries)) {
      const text = source.get(page.replace(/^pages\//, ''));
      if (!text) continue;
      for (const state of STATES) {
        const cell = entry[state];
        if (NO_EVIDENCE.has(cell.kind)) continue;
        if (!(cell.evidence || '').trim()) {
          problems.push(`${page}: ${state} names no evidence`);
        } else if (!text.includes(cell.evidence)) {
          problems.push(`${page}: ${state} evidence not found: ${JSON.stringify(cell.evidence)}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('does not let a page that reads over the network skip its loading or error state', () => {
    const problems = [];
    for (const [page, entry] of Object.entries(ledger.entries)) {
      if (entry.data !== 'fetch') continue;
      for (const state of ['loading', 'error']) {
        if (entry[state].kind === 'not-applicable') problems.push(`${page}: ${state} waved through`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('requires a reason wherever a state is not retryable', () => {
    const problems = [];
    for (const [page, entry] of Object.entries(ledger.entries)) {
      for (const state of STATES) {
        const cell = entry[state];
        if (cell.retry === false && !(cell.reason || '').trim()) {
          problems.push(`${page}: ${state} is not retryable and does not say why`);
        }
        if (cell.retry_via && cell.retry !== true) {
          problems.push(`${page}: ${state} names a retry path but is not marked retryable`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('pins the shape counts, so a reclassification is a deliberate edit', () => {
    const byData = {};
    const byKind = {};
    let absent = 0;
    for (const entry of Object.values(ledger.entries)) {
      byData[entry.data] = (byData[entry.data] || 0) + 1;
      for (const state of STATES) {
        byKind[entry[state].kind] = (byKind[entry[state].kind] || 0) + 1;
        if (entry[state].kind === 'absent') absent += 1;
      }
    }
    expect({ byData, pages: Object.keys(ledger.entries).length, absent }).toEqual({
      // 2026-10-05: +1 fetch page — the run card moved from the front-door hero to /last-run,
      // which reads the freshness and alert artifacts at the page level.
      byData: { fetch: 22, mutation: 7, static: 7 },
      pages: 36,
      absent: 0,
    });
    // No page is allowed to fall back to `absent`: the five cells that used to be open (Dashboard
    // empty + error, the account dashboard empty + error, /archive empty, /blogs/:slug empty) are
    // now rendered states with the evidence above. The pin stays so a future page cannot quietly
    // introduce one, and the evidence test catches a present state whose block is deleted.
    expect(byKind.absent ?? 0).toBe(0);
  });

  it('keeps every page four states implemented rather than deferred', () => {
    const missing = (state) =>
      Object.entries(ledger.entries)
        .filter(([, entry]) => entry[state].kind === 'absent')
        .map(([page]) => page);

    expect({ empty: missing('empty'), error: missing('error'), loading: missing('loading') }).toEqual({
      empty: [],
      error: [],
      loading: [],
    });

    // A page may waive its error state only when it reads nothing at all.
    const waived = Object.entries(ledger.entries).filter(([, entry]) => entry.error.kind === 'not-applicable');
    expect(waived.map(([page]) => page).length).toBe(7);
    expect(waived.filter(([, entry]) => entry.data !== 'static')).toEqual([]);

    // Every page states a success.
    expect(Object.entries(ledger.entries).filter(([, e]) => e.success.kind === 'absent')).toEqual([]);
  });
});
