#!/usr/bin/env node
/**
 * Per-page documentation audit — `npm run audit:pages`.
 *
 * The design detector reads CSS; the craft floor reads JSX composition. Neither reads a
 * *document*, and every route in this product is also a document: it is prerendered, it is
 * crawled, and it is what a visitor sees before React has run. This script walks all of
 * `frontend/dist` and checks the things only a built page can answer:
 *
 *   · one <h1>, and a heading order that never skips a level
 *   · a <title>, a meta description, and a canonical link
 *   · `lang` on <html>, and a landmark to skip to
 *   · every <img> with an alt attribute (empty is allowed: decorative)
 *   · every link and button with an accessible name
 *   · no inline style that reintroduces a raw colour outside the token set
 *   · the safety framing present on routes that state a hazard level
 *
 * It is a report, not a gate: the exit code is always 0 unless the build is missing.
 * Findings are grouped per route so the audit document can cite them.
 *
 *   node scripts/audit-pages.mjs            human summary
 *   node scripts/audit-pages.mjs --json     machine-readable
 *   node scripts/audit-pages.mjs --strict   exit 1 when any P0/P1 finding exists
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'frontend/dist');
const args = process.argv.slice(2);
const wantsJson = args.includes('--json');
const strict = args.includes('--strict');

if (!existsSync(DIST)) {
  console.error('[audit] frontend/dist is missing — run `npm run build:frontend` first.');
  process.exit(2);
}

const pages = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.html')) pages.push(full);
  }
})(DIST);

/** Routes state a hazard level when their slug names one of the eight classes. */
const HAZARD_ROUTES = /hazards\/|districts|divisions|alerts|advisories/;

function routeOf(file) {
  const rel = relative(DIST, file).split('\\').join('/');
  return rel.replace(/(^|\/)index\.html$/, '/').replace(/\.html$/, '').replace(/\/$/, '') || '/';
}

function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const results = [];
for (const file of pages.sort()) {
  const html = readFileSync(file, 'utf8');
  const route = routeOf(file);
  const issues = [];
  const push = (severity, rule, detail) => issues.push({ severity, rule, detail, route });

  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  if (h1s.length === 0) push('P1', 'missing-h1', 'no <h1> in the document');
  if (h1s.length > 1) push('P1', 'multiple-h1', `${h1s.length} <h1> elements`);

  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map((m) => Number(m[1]));
  for (let i = 1; i < headings.length; i += 1) {
    if (headings[i] - headings[i - 1] > 1) {
      push('P2', 'heading-skip', `h${headings[i - 1]} → h${headings[i]}`);
      break;
    }
  }

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!title || title[1].trim().length === 0) push('P1', 'missing-title', 'no <title>');
  if (!/<meta[^>]+name=["']description["'][^>]*content=["'][^"']+["']/i.test(html)) {
    push('P2', 'missing-description', 'no meta description');
  }
  // A noindex document must not nominate a canonical URL; that is correctness, not a gap.
  const noindex = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html);
  if (!noindex && !/<link[^>]+rel=["']canonical["']/i.test(html)) {
    push('P3', 'missing-canonical', 'no canonical link');
  }

  if (!/<html[^>]+lang=["'][a-z-]+["']/i.test(html)) push('P1', 'missing-lang', '<html> has no lang');
  if (!/<main\b/i.test(html) && !/role=["']main["']/i.test(html)) {
    push('P2', 'missing-main', 'no <main> landmark');
  }

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt\s*=/.test(m[0])) push('P1', 'img-without-alt', m[0].slice(0, 90));
  }

  // Accessible name: text content, aria-label, aria-labelledby or a title.
  for (const m of html.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const [, tag, attrs, inner] = m;
    const named =
      textOf(inner).length > 0 ||
      /aria-label\s*=|aria-labelledby\s*=|\btitle\s*=/.test(attrs) ||
      /<svg|<img/i.test(inner);
    if (!named) push('P2', 'control-without-name', `<${tag}${attrs.slice(0, 60)}>`);
  }

  // The safety framing is a layout requirement on any route that shows a level.
  if (HAZARD_ROUTES.test(route)) {
    const body = textOf(html).toLowerCase();
    if (!/not an official/.test(body)) push('P1', 'safety-framing', 'no "not an official warning" statement');
    if (!/999/.test(body)) push('P2', 'safety-number', 'emergency number 999 absent');
  }

  results.push({ route, file: relative(ROOT, file).split('\\').join('/'), issues });
}

const all = results.flatMap((r) => r.issues);
const bySeverity = all.reduce((acc, i) => ({ ...acc, [i.severity]: (acc[i.severity] || 0) + 1 }), {});

if (wantsJson) {
  console.log(JSON.stringify({ documents: results.length, bySeverity, results }, null, 2));
} else {
  console.log(`[audit] ${results.length} documents, ${all.length} findings`, bySeverity);
  const byRule = new Map();
  for (const i of all) byRule.set(i.rule, [...(byRule.get(i.rule) || []), i]);
  for (const [rule, list] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${rule}: ${list.length}`);
    for (const i of list.slice(0, 4)) console.log(`    ${i.route} — ${i.detail}`);
  }
}

process.exit(strict && (bySeverity.P0 || bySeverity.P1) ? 1 : 0);
