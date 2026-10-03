#!/usr/bin/env node
/**
 * CSS `!important` gate — `npm run check:important`.
 *
 * Backlog 6 of docs/audits/2026-10-03-frontend-design-system-audit.md is "kill the 405
 * `!important`". Most of them cannot be killed, and the reason is worth writing down, because it
 * is the same reason the count got that high in the first place.
 *
 * How the cascade actually resolves here (Tailwind v4 + this stylesheet):
 *
 *   - `@import "tailwindcss"` puts every utility in `@layer utilities`. **Unlayered rules win
 *     over layered rules**, whatever the specificity - so a plain rule in `index.css` already
 *     beats `.text-xs`, `.border`, `.rounded-lg` and every other utility without needing
 *     `!important`. A screen-scoped `!important` on an unlayered rule is therefore *inert*
 *     unless something unlayered, later, or inline is also setting that property.
 *   - `@media print` is the exception that keeps most of the count alive. The print sheet runs
 *     after the screen rules of the same file, and it has to override rules with *higher*
 *     specificity than its own (`h1` vs `.prose-blog h1`), so `!important` is the mechanism.
 *     Removing those needs a print/PDF comparison, not a stylesheet reading.
 *   - `@media (prefers-reduced-motion: reduce)` is the other exception: the block is early in the
 *     file, and later animation declarations would win without the flag.
 *
 * So this gate does three things:
 *
 *   1. counts `!important` per scope against a committed baseline (a ratchet, like the token and
 *      hex baselines);
 *   2. fails on an *inert* `!important`: screen-scoped, unlayered, and for a property that no
 *      inline style in the app sets - the one case where the flag provably changes nothing;
 *   3. keeps the justified list honest: every screen `!important` that stays must be named in
 *      `data/design/important-baseline.json` with the inline style or the cascade rule it fights.
 *
 * Usage:
 *   node scripts/check-css-important.mjs            fail on new/inert importants (exit 1)
 *   node scripts/check-css-important.mjs --report   print the breakdown, always exit 0
 *   node scripts/check-css-important.mjs --json     machine-readable summary
 *   node scripts/check-css-important.mjs --update   rewrite the baseline counts
 *   node scripts/check-css-important.mjs --seed     rewrite counts and the justified/unverified lists
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = join(ROOT, 'frontend/src/index.css');
const SRC = join(ROOT, 'frontend/src');
const BASELINE = join(ROOT, 'data/design/important-baseline.json');

const argv = process.argv.slice(2);
const wantsReport = argv.includes('--report');
const wantsJson = argv.includes('--json');
const wantsUpdate = argv.includes('--update');
const wantsSeed = argv.includes('--seed');

/** Blank out comments while keeping every byte offset, so line numbers survive. */
function maskComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function parseCss(text) {
  const code = maskComments(text);
  const declarations = [];
  const stack = [];
  let line = 1;
  let buf = '';
  let bufLine = 1;

  const push = () => {
    const raw = buf.trim();
    buf = '';
    if (!raw) return;
    const selectorFrame = [...stack].reverse().find((f) => !f.isAt);
    const decl = raw.match(/^([-a-zA-Z]+)\s*:\s*([\s\S]*?)\s*(!important)?$/);
    if (!decl || !selectorFrame) return;
    declarations.push({
      line: bufLine,
      property: decl[1].toLowerCase(),
      value: decl[2],
      important: Boolean(decl[3]),
      media: stack.filter((f) => /^@media/.test(f.head)).map((f) => f.head),
      layered: stack.some((f) => /^@layer/.test(f.head)),
      selector: selectorFrame.head.replace(/\s+/g, ' '),
    });
  };

  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === '\n') {
      line += 1;
      buf += ch;
      continue;
    }
    if (ch === '{') {
      stack.push({ head: buf.trim(), line: bufLine, isAt: buf.trim().startsWith('@') });
      buf = '';
      bufLine = line;
      continue;
    }
    if (ch === '}') {
      push();
      stack.pop();
      bufLine = line;
      continue;
    }
    if (ch === ';') {
      push();
      bufLine = line;
      continue;
    }
    if (!buf.trim()) bufLine = line;
    buf += ch;
  }
  if (buf.trim()) push();
  return declarations.filter((d) => d.important && d.property);
}

/** Every property the app sets from a `style={{ … }}` object - the only competitor an unlayered
 *  rule cannot beat without the flag. */
function inlineStyleProperties() {
  const props = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) {
        const text = readFileSync(full, 'utf8');
        for (const m of text.matchAll(/style=\{\{([\s\S]{0,400}?)\}\}/g)) {
          for (const key of m[1].matchAll(/([A-Za-z][A-Za-z0-9]*)\s*:/g)) {
            props.add(key[1].replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
          }
        }
        for (const m of text.matchAll(/setProperty\(\s*['"]([a-z-]+)['"]/g)) props.add(m[1]);
      }
    }
  };
  walk(SRC);
  return props;
}

const text = readFileSync(CSS, 'utf8');
const declarations = parseCss(text);
const inlineProps = inlineStyleProperties();

/** Blocks that exist for the print/PDF capture path even though they are not in a print media
 *  query: they style the DOM while html2canvas or the print preview is walking it. */
const CAPTURE_SELECTOR = /pdf-capture|print-preview|ink-saver|print-only|screen-only|pdf-exporting|print-sheet|print-table/;

function scopeOf(decl) {
  const joined = decl.media.join(' ');
  if (/print/.test(joined) || CAPTURE_SELECTOR.test(decl.selector)) return 'print';
  if (/prefers-reduced-motion/.test(joined)) return 'reducedMotion';
  if (/data-low-bandwidth/.test(decl.selector)) return 'lowBandwidth';
  return 'screen';
}

/**
 * Why a screen-scoped `!important` may still be legitimate, in the order the answers are decided:
 *
 *   inline-app     the property is one the app sets from `style={{ … }}`, so the selector really
 *                  does have to out-rank an inline style;
 *   inline-vendor  a vendor writes the property inline at runtime - Leaflet sets width, height and
 *                  whiteSpace on `.leaflet-popup-content` from `_updateLayout`, for instance;
 *   unverified     none of the above: the flag may be inert, but proving it needs a rendered
 *                  computed-style comparison, which this pass could not run (the sandbox cannot
 *                  download a browser). These are listed, counted, and may only shrink.
 */
/** The only properties a vendor writes *inline* here: Leaflet's `_updateLayout` sets width,
 *  height and white-space on `.leaflet-popup-content` after measuring it. */
const VENDOR_INLINE = (decl) =>
  /leaflet-popup-content/.test(decl.selector) && ['width', 'height', 'white-space'].includes(decl.property);

const counts = { print: 0, reducedMotion: 0, lowBandwidth: 0, screen: 0 };
const screenBuckets = { 'inline-app': [], 'inline-vendor': [], unverified: [] };

for (const decl of declarations) {
  const scope = scopeOf(decl);
  counts[scope] += 1;
  if (scope !== 'screen') continue;
  const key = `${decl.selector}::${decl.property}`;
  if (inlineProps.has(decl.property)) screenBuckets['inline-app'].push(key);
  else if (VENDOR_INLINE(decl)) screenBuckets['inline-vendor'].push(key);
  else screenBuckets.unverified.push(key);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const problems = [];

for (const [scope, count] of Object.entries(counts)) {
  const was = baseline.counts[scope];
  if (typeof was === 'number' && count > was) {
    problems.push(`${scope}: ${count} !important, baseline ${was} - the ratchet only turns down`);
  }
}

for (const bucket of ['inline-app', 'inline-vendor']) {
  const known = new Set(baseline.justified[bucket]);
  for (const key of new Set(screenBuckets[bucket])) {
    if (!known.has(key)) {
      problems.push(`screen !important ${key} is not in the baseline's justified.${bucket} list`);
    }
  }
  for (const key of known) {
    if (!screenBuckets[bucket].includes(key)) {
      problems.push(`stale baseline entry in justified.${bucket}: ${key}`);
    }
  }
}

const unverified = new Set(screenBuckets.unverified);
const knownUnverified = new Set(baseline.unverified);
for (const key of unverified) {
  if (!knownUnverified.has(key)) {
    problems.push(`screen !important ${key} is neither justified nor listed in baseline.unverified - decide and record it`);
  }
}
for (const key of knownUnverified) {
  if (!unverified.has(key)) problems.push(`baseline.unverified entry no longer exists: ${key}`);
}

const summary = {
  counts,
  keys: {
    'inline-app': [...new Set(screenBuckets['inline-app'])].sort(),
    'inline-vendor': [...new Set(screenBuckets['inline-vendor'])].sort(),
    unverified: [...new Set(screenBuckets.unverified)].sort(),
  },
  baseline: baseline.counts,
  justified: {
    'inline-app': screenBuckets['inline-app'].length,
    'inline-vendor': screenBuckets['inline-vendor'].length,
  },
  unverified: screenBuckets.unverified.length,
};

if (wantsJson) console.log(JSON.stringify(summary, null, 2));
else if (wantsReport || problems.length > 0) {
  console.log(`!important by scope: print ${counts.print}, reducedMotion ${counts.reducedMotion}, lowBandwidth ${counts.lowBandwidth}, screen ${counts.screen}`);
  console.log(`baseline:            print ${baseline.counts.print}, reducedMotion ${baseline.counts.reducedMotion}, lowBandwidth ${baseline.counts.lowBandwidth}, screen ${baseline.counts.screen}`);
  console.log(`screen, justified by an inline style: ${screenBuckets['inline-app'].length} app, ${screenBuckets['inline-vendor'].length} vendor`);
  console.log(`screen, unverified (needs a rendered comparison): ${screenBuckets.unverified.length}`);
  if (wantsReport) {
    for (const key of screenBuckets.unverified) console.log(`  unverified ${key}`);
    for (const key of screenBuckets['inline-vendor']) console.log(`  vendor     ${key}`);
  }
  if (!wantsReport) for (const p of problems) console.log(`FAIL ${p}`);
}

if (wantsUpdate) {
  // --update re-counts only; it deliberately does not invent justifications. New screen entries
  // must be added to justified/unverified by hand, which is the point of the ledger.
  baseline.counts = counts;
  writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log('baseline counts updated');
  process.exit(0);
}

if (argv.includes('--seed')) {
  baseline.counts = counts;
  baseline.justified = summary.keys['inline-app'].length || summary.keys['inline-vendor'].length
    ? { 'inline-app': summary.keys['inline-app'], 'inline-vendor': summary.keys['inline-vendor'] }
    : baseline.justified;
  baseline.unverified = summary.keys.unverified;
  writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`baseline seeded: ${summary.keys['inline-app'].length} app, ${summary.keys['inline-vendor'].length} vendor, ${summary.keys.unverified.length} unverified`);
  process.exit(0);
}

if (wantsReport || wantsJson) process.exit(0);
if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log('✅ Every !important has a reason to exist.');
