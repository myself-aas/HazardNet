#!/usr/bin/env node
/**
 * Public-surface gate: no location in this repository's tree appears in a shipped document.
 *
 * Scope is the HTML the deployment serves — `frontend/dist/**\/*.html`, every byte of it:
 * rendered text, HTML comments, JSON-LD, inline styles. A comment is not rendered, but it
 * is delivered, and "the frontend does not name the tree" is a simpler rule to hold than
 * "the frontend does not name the tree except in the parts a visitor has to view source to
 * see". The rule and its reasoning are in docs/PUBLIC_SURFACE.md §3; the pattern lives in
 * scripts/lib/public-text.mjs, which the build scripts and the browser-side twin
 * (frontend/src/lib/publicText.ts) also use.
 *
 * Deliberately out of scope:
 *   · the JavaScript and CSS bundles, which are not documents and which carry build-time
 *     strings a visitor is never shown. The source-level test
 *     (__tests__/noRepoPaths.test.js) covers what components can render.
 *   · the served data artifacts under dist/data/. They are machine-readable copies whose
 *     provenance is the point: a script auditing a published number reads them, and they
 *     keep the paths the page dropped.
 *
 * Usage:
 *   node scripts/check-public-paths.mjs            fail if any document names the tree
 *   node scripts/check-public-paths.mjs --json     machine-readable report
 *
 * Exit codes: 0 clean, 1 a document names the tree, 2 could not run (no build present).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_PATH } from './lib/public-text.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'frontend/dist');
const wantsJson = process.argv.slice(2).includes('--json');

/**
 * The anchored rule, made global so a document is scanned for every occurrence rather than
 * the first. The anchor matters: it is what distinguishes a location in this repository's
 * tree (`scripts/build_freshness_artifact.mjs`) from a URL this site serves
 * (`/data/model-performance.json`, `/assets/index-abc123.css`), which begins with a slash
 * and resolves on the deployed origin. An unanchored scan reports the build's own asset
 * references on all 198 documents and says nothing about the surface.
 */
const EVERY_REPO_PATH = new RegExp(REPO_PATH.source, 'g');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error(
    '[public-paths] frontend/dist does not exist — run `npm run build:frontend` first.',
  );
  process.exit(2);
}

const documents = walk(DIST).sort();
const hits = [];
for (const file of documents) {
  const text = readFileSync(file, 'utf8');
  const found = new Map();
  for (const match of text.matchAll(EVERY_REPO_PATH)) {
    found.set(match[0], (found.get(match[0]) || 0) + 1);
  }
  if (found.size > 0) {
    hits.push({
      file: relative(ROOT, file).split('\\').join('/'),
      paths: [...found.entries()].map(([path, count]) => ({ path, count })),
    });
  }
}

if (wantsJson) {
  console.log(
    JSON.stringify(
      {
        documents: documents.length,
        clean: documents.length - hits.length,
        offending: hits.length,
        hits,
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    `[public-paths] ${documents.length} shipped documents scanned; ${hits.length} name a location in this repository.`,
  );
}

if (hits.length > 0) {
  if (!wantsJson) {
    for (const hit of hits.slice(0, 25)) {
      console.error(`  ${hit.file}`);
      for (const { path, count } of hit.paths) console.error(`      ${count}×  ${path}`);
    }
    if (hits.length > 25) console.error(`  … and ${hits.length - 25} more documents.`);
    console.error(
      '\nDelete the path from the copy that renders it. Do not replace it with a reworded\n' +
        'pointer: the surface states where a number came from in terms a reader can act on\n' +
        '(a build time, a coverage count, a link to a served artifact), or it does not state\n' +
        'it. docs/PUBLIC_SURFACE.md §3 records the rule.',
    );
  }
  process.exit(1);
}

process.exit(0);
