/**
 * Source-level half of the public-surface gate: nothing a component can render, and no
 * field the pages read verbatim, names a location in this repository's tree.
 *
 * Its partner is `scripts/check-public-paths.mjs`, which scans the built documents and runs
 * in CI after the build. This file covers what a build scan cannot see: surfaces that are
 * rendered only in the browser (the freshness panel's detail rows, the archive page's empty
 * state), and the authored content the prerenderer composes pages from.
 *
 * The rule itself is `namesRepoFile` from scripts/lib/public-text.mjs — the same predicate
 * the build scripts apply, so a string this test accepts is a string the build would print.
 *
 * Why the artifacts keep their paths: a published number has to be auditable by something,
 * and that something is a script reading the artifact. What changed is that the page no
 * longer prints the artifact's location as though a visitor could open it. See
 * docs/PUBLIC_SURFACE.md §3.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findRepoPaths, namesRepoFile } from '../scripts/lib/public-text.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = join(ROOT, 'frontend/src/content');
const SRC_DIR = join(ROOT, 'frontend/src');
const FRESHNESS = join(ROOT, 'frontend/public/data/freshness.json');
const DIST = join(ROOT, 'frontend/dist');

function walk(dir, predicate) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      out.push(...walk(full, predicate));
    } else if (predicate(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Strip the comment forms that appear in this repository's TypeScript and JSX. */
function withoutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

describe('no repository location reaches a visitor surface', () => {
  it('authored page content is free of them', () => {
    const files = walk(CONTENT_DIR, (name) => name.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    const offenders = [];
    for (const file of files) {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      for (const { pointer, value } of findRepoPaths(data)) {
        offenders.push(`${relative(ROOT, file)} ${pointer}: ${value.slice(0, 120)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the freshness artifact\'s rendered fields are free of them', () => {
    // label, reason, what_this_is and the honesty notes are printed verbatim by the status
    // page and by the prerendered shell. detail values are filtered at render time by
    // publishableEntries, which __tests__/publicText.test.js covers.
    if (!existsSync(FRESHNESS)) return; // not built in every checkout; CI builds it
    const artifact = JSON.parse(readFileSync(FRESHNESS, 'utf8'));
    const rendered = [
      artifact.what_this_is,
      ...(artifact.honesty ?? []),
      ...(artifact.sources ?? []).flatMap((s) => [s.label, s.reason]),
    ].filter((v) => typeof v === 'string');
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.filter((v) => namesRepoFile(v))).toEqual([]);
  });

  it('no component renders one', () => {
    const files = walk(SRC_DIR, (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name));
    expect(files.length).toBeGreaterThan(50);
    const offenders = [];
    for (const file of files) {
      const lines = withoutComments(readFileSync(file, 'utf8')).split('\n');
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        // Module specifiers are how the code finds its own files; they are not rendered.
        if (/^(import|export)\b/.test(trimmed) || /\bfrom\s*['"]/.test(trimmed) || /require\(/.test(trimmed)) {
          return;
        }
        if (namesRepoFile(line)) {
          offenders.push(`${relative(ROOT, file)}:${index + 1} ${trimmed.slice(0, 130)}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the built documents are free of them, when a build is present', () => {
    // The authoritative version of this check runs in CI after the build
    // (`npm run check:paths`, scripts/check-public-paths.mjs) and scans every byte of every
    // document, comments and JSON-LD included. It is repeated here so that a local
    // `npx jest` after a build says the same thing without a second command.
    if (!existsSync(DIST)) {
      console.warn('[noRepoPaths] frontend/dist is not built; skipping the document scan.');
      return;
    }
    const documents = walk(DIST, (name) => name.endsWith('.html'));
    expect(documents.length).toBeGreaterThan(50);
    const offenders = [];
    for (const file of documents) {
      const text = readFileSync(file, 'utf8');
      // Character-by-character windowing would be slow over 198 documents; splitting on
      // the pattern's own boundary characters is enough to hand namesRepoFile candidates.
      for (const candidate of text.split(/[\s"'`<>()[\]{},;]/)) {
        if (!candidate.includes('/')) continue;
        if (namesRepoFile(` ${candidate}`) || namesRepoFile(candidate)) {
          offenders.push(`${relative(ROOT, file)}: ${candidate.slice(0, 120)}`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
