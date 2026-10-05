#!/usr/bin/env node
/**
 * Single-design-system gate — `npm run check:residue`.
 *
 * HazardNet has shipped five design systems. Four are deleted; Apple is the one
 * that stays. The hard part is not the deletion, it is that a superseded system
 * does not leave as a file — it leaves as a *vocabulary*, and the vocabulary
 * outlives the stylesheet by months because every individual use of it still
 * works. The audit that produced this file found exactly that, three layers
 * deep, long after the old CSS was gone:
 *
 *   - `apple.css` carried 80 compatibility aliases (--severity-*, --surface-*,
 *     --glass-*, --panel-*, --chart-*, --sidebar-*, --primary and friends),
 *     each one pointing at an --ap-* token. The pixels were already Apple. But
 *     52 of the 80 had quietly gone dead, and the other 28 gave new code a
 *     second name for a colour it already had a name for. The section comment
 *     above them said the alias block "is gone" — it described the *previous*
 *     generation of aliases, which had been replaced by these.
 *   - `index.css` declared 206 dead `--color-*` theme keys, among them shadcn's
 *     whole semantic set (card, popover, muted, destructive, input, sidebar-*)
 *     and a `spacesuit` key from the NASA-HDS era.
 *   - `frontend/components.json` was still a valid shadcn generator config
 *     pointing at `src/index.css` with `baseColor: taupe`. One
 *     `npx shadcn add button` would have injected a foreign component, foreign
 *     tokens and a taupe ramp straight into the stylesheet.
 *
 * None of that is catchable by tsc, by ESLint, or by a contrast scan. It is
 * only catchable by asserting what must NOT exist. Hence this file.
 *
 * The rules below are deliberately about *names*, not values. A token whose
 * value is correct but whose name belongs to a dead system is still a second
 * vocabulary, and a second vocabulary is how the sixth design system starts.
 *
 * `--report` lists everything and exits 0.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const argv = process.argv.slice(2);
const wantsReport = argv.includes('--report');

const problems = [];
const fail = (rule, detail) => problems.push({ rule, detail });

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const listFiles = (pattern) => sh(pattern).split('\n').filter(Boolean);

/* ── 1 · Files that must not come back ─────────────────────────────────────
   Deleting a stylesheet is not the same as retiring a system: the generator
   config is what lets it reinstall itself. */
const FORBIDDEN_FILES = {
  'frontend/components.json': 'shadcn generator config — `npx shadcn add` would inject a foreign system',
  'frontend/src/styles/meridian.css': 'HDS v3.0 Meridian',
  'frontend/src/styles/nasa-hds.css': 'NASA HDS',
  'frontend/src/styles/brand.css': 'pre-system brand sheet',
  'frontend/src/styles/dark.css': 'standalone dark sheet — dark is an arm of apple.css, not a system',
  'frontend/src/design-system/tokens.ts': 'pre-Apple token module',
  'packages/design-system/src/meridian.ts': 'Meridian tokens',
  'packages/design-system/src/tokens.ts': 'generic token module',
  'packages/design-system/src/material3Expressive.ts': 'Material 3 Expressive',
};
for (const [path, why] of Object.entries(FORBIDDEN_FILES)) {
  if (existsSync(path)) fail('resurrected-file', `${path} — ${why}`);
}

/* ── 2 · Dependencies that bring a whole design language with them ──────── */
const FORBIDDEN_DEPS = {
  shadcn: 'component generator for a different system',
  'tw-animate-css': 'second motion vocabulary — Apple motion lives in apple.css §11',
  '@mui/material': 'Material UI',
  '@emotion/react': 'MUI runtime',
  'antd': 'Ant Design',
  '@chakra-ui/react': 'Chakra',
  'bootstrap': 'Bootstrap',
  'flowbite': 'Flowbite',
  'daisyui': 'daisyUI',
};
for (const manifest of ['package.json', 'frontend/package.json', 'apps/mobile/package.json']) {
  if (!existsSync(manifest)) continue;
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  for (const section of ['dependencies', 'devDependencies']) {
    for (const dep of Object.keys(pkg[section] ?? {})) {
      if (FORBIDDEN_DEPS[dep]) fail('foreign-dependency', `${manifest} ${section}.${dep} — ${FORBIDDEN_DEPS[dep]}`);
    }
  }
}

/* ── 3 · Dead token namespaces ─────────────────────────────────────────────
   Every custom property in the app's CSS must either be an Apple token, a
   Tailwind theme key (which is how utilities get generated), or one of the few
   app-level names that have no Apple equivalent. Anything else is a second
   vocabulary wearing a CSS variable. */
const cssFiles = listFiles("find frontend/src -name '*.css'");
const APP_LOCAL = /^--(navbar|hero|control|ring|tw)-/; // app chrome with no Apple counterpart
const TAILWIND_KEY = /^--(color|font|text|spacing|radius|breakpoint|container|shadow|animate|ease|leading|tracking|blur|z|inset|perspective|aspect|default)-/;
const DEAD_NAMESPACES = /^--(mrd|hds|hn|m3|md3|nasa|meridian|severity|surface|panel|glass|sidebar|chart|primary|secondary|success|warning|info|destructive|muted|popover|card|accent|input|foreground|background|border|subtle|spacesuit)(-|$)/;

for (const file of cssFiles) {
  const body = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of body.matchAll(/(?:^|[;{])\s*(--[a-z0-9][\w-]*)\s*:/gm)) {
    const name = m[1];
    if (name.startsWith('--ap-') || TAILWIND_KEY.test(name) || APP_LOCAL.test(name)) continue;
    if (DEAD_NAMESPACES.test(name)) fail('dead-namespace', `${file} declares ${name} — a superseded system's name`);
    else fail('unknown-namespace', `${file} declares ${name} — not an Apple token or a Tailwind theme key`);
  }
}

/* ── 4 · Every var() must resolve ──────────────────────────────────────────
   An undefined custom property does not throw; the declaration is dropped at
   computed-value time and the element silently inherits. The audit found ten of
   these, including `color: var(--text-body)` on the LAST body rule in the
   cascade — which meant the app's base ink was not an Apple token at all. */
const srcFiles = listFiles("find frontend/src -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \\)");
const declared = new Set();
for (const file of cssFiles) {
  const body = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of body.matchAll(/(?:^|[;{])\s*(--[a-z0-9][\w-]*)\s*:/gm)) declared.add(m[1]);
}
const DYNAMIC = /^--(hero-slide|ap)-?$/; // names built by string concatenation at runtime
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
for (const file of srcFiles) {
  // Comments discuss tokens by name — including the ones this gate exists to
  // keep deleted — so they have to come out before looking for readers.
  const body = stripComments(readFileSync(file, 'utf8'));
  for (const m of body.matchAll(/var\(\s*(--[a-z0-9][\w-]*)\s*(,|\))/g)) {
    const [, name, next] = m;
    if (next === ',') continue; // has a fallback, so it degrades on purpose
    if (declared.has(name) || DYNAMIC.test(name) || name.startsWith('--tw-')) continue;
    fail('undefined-token', `${file.replace('frontend/src/', '')} reads ${name}, which nothing declares`);
  }
}

/* ── 5 · Foreign class vocabularies in components ──────────────────────────
   tw-animate-css is the one that actually shipped: `animate-in fade-in
   slide-in-from-top-2` on six surfaces, pulling a whole library in for a fade. */
const FOREIGN_CLASSES = [
  ['animate-in', 'tw-animate-css'], ['animate-out', 'tw-animate-css'],
  ['fade-in', 'tw-animate-css'], ['fade-out', 'tw-animate-css'],
  ['slide-in-from', 'tw-animate-css'], ['slide-out-to', 'tw-animate-css'],
  ['zoom-in', 'tw-animate-css'], ['zoom-out', 'tw-animate-css'],
];
const tsxFiles = listFiles("find frontend/src -name '*.tsx' ! -path '*__tests__*'");
for (const file of tsxFiles) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!/class(Name)?\s*=/.test(line)) return;
    for (const [cls, owner] of FOREIGN_CLASSES) {
      if (new RegExp(`(?<![\\w-])${cls}(?![\\w-])`).test(line)) {
        fail('foreign-class', `${file.replace('frontend/src/', '')}:${i + 1} uses \`${cls}\` (${owner}); use .ap-enter / .ap-enter-drop`);
      }
    }
  });
}

/* ── 6 · No foreign stylesheet may be imported ─────────────────────────────
   This is the one the other rules missed, and it was the loudest: index.css
   ended with `@import "shadcn/tailwind.css"` — 629 lines of Radix keyframes,
   nine `@custom-variant` definitions and a scroll-fade/shimmer utility set,
   loaded AFTER apple.css and therefore winning the cascade against it. Nothing
   in the app used any of it. It survived because removing the dependency is
   what surfaces the import, and until then the build is perfectly happy.

   Leaflet is allowed: it is a map engine whose CSS positions panes and tiles,
   not a design language, and its chrome is re-dressed in leaflet-transparent.css. */
const ALLOWED_IMPORT = /^(tailwindcss|\.\/|\.\.\/|leaflet)/;
for (const file of cssFiles) {
  for (const m of readFileSync(file, 'utf8').matchAll(/@import\s+["']([^"']+)["']/g)) {
    if (!ALLOWED_IMPORT.test(m[1])) {
      fail('foreign-stylesheet', `${file} imports "${m[1]}" — a third-party design language loaded into ours`);
    }
  }
}

/* ── 7 · No unlayered universal rule may restyle the whole product ─────────
   `*, *::before, *::after { font-family: var(--ap-font-mono) }` sat unlayered
   in index.css under the heading "Global Mono system". Unlayered beats
   @layer base regardless of specificity, and `*` matches every element rather
   than letting a face inherit, so every div/span/a/li/td/label in the product
   rendered in SF Mono instead of SF Pro Text. html, body, h1-h6 and p each had
   an element rule of their own, which outranks `*` on specificity — so the
   title and the body copy looked correct and the bug stayed invisible.

   Motion and print-colour resets are the legitimate uses of `*`, and both are
   inside an at-rule. An unlayered, unconditional one is a second design
   language asserting itself over the first. */
const INHERITED = /\b(font-family|font-size|line-height|letter-spacing|color|font-weight)\s*:/;
for (const file of cssFiles) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let depth = 0, atRule = 0, layer = 0;
  for (const line of lines) {
    if (depth === (atRule ? 1 : 0) && /^\s*\*\s*(,\s*\*(::?[\w-]+)?\s*)*\{/.test(line) && !atRule && !layer) {
      fail('universal-restyle', `${file} restyles every element with an unlayered \`*\` rule — it outranks @layer base everywhere`);
    }
    const open = (line.match(/\{/g) || []).length, close = (line.match(/\}/g) || []).length;
    if (/^\s*@(media|supports|container|print)/.test(line)) atRule += open;
    if (/^\s*@layer/.test(line)) layer += open;
    depth += open - close;
    if (depth === 0) { atRule = 0; layer = 0; }
  }
}
void INHERITED;

/* ── 8 · No superseded colour vocabulary in markup ─────────────────────────
   The `nasa-*` ramp outlived the stylesheet it came from as eight Tailwind
   theme keys aliased onto Apple tokens, and 400 call sites went on speaking it.
   Every pixel was already correct, which is why it survived three passes: the
   aliases resolved. But `nasa-red`, `nasa-red-shade`, `nasa-blue` and
   `nasa-blue-shade` ALL pointed at --ap-primary, so `text-nasa-red-shade`
   painted Action Blue — a name that actively lies about what it draws. */
const DEAD_UTILITY = /\b(?:bg|text|border|ring|fill|stroke|accent|from|to|via|decoration|outline|divide|placeholder)-(nasa|mrd|hds|m3|md3|meridian)-[a-z0-9-]+/g;
for (const file of srcFiles.filter((f) => /\.(tsx|jsx)$/.test(f))) {
  const seen = new Set(readFileSync(file, 'utf8').match(DEAD_UTILITY) || []);
  for (const u of seen) fail('dead-utility', `${file} uses \`${u}\` — a superseded system's colour name`);
}

/* ── 9 · One stylesheet owns the tokens ───────────────────────────────────── */
const tokenSheets = cssFiles.filter((f) => /--ap-primary\s*:/.test(readFileSync(f, 'utf8')));
if (tokenSheets.length !== 1) {
  fail('split-source-of-truth', `--ap-primary is declared in ${tokenSheets.length} stylesheets: ${tokenSheets.join(', ')}`);
}

/* ── report ───────────────────────────────────────────────────────────────── */
const byRule = {};
for (const p of problems) (byRule[p.rule] ??= []).push(p);

if (problems.length === 0) {
  console.log(`✅ one design system: ${cssFiles.length} stylesheets, ${tsxFiles.length} components, no residue.`);
  process.exit(0);
}

console.log(`${problems.length} design-system residue problem(s):\n`);
for (const [rule, hits] of Object.entries(byRule)) console.log(`  ${String(hits.length).padStart(4)}  ${rule}`);
console.log();
for (const [rule, hits] of Object.entries(byRule)) {
  console.log(`--- ${rule} ---`);
  for (const h of wantsReport ? hits : hits.slice(0, 10)) console.log(`  ${h.detail}`);
  if (!wantsReport && hits.length > 10) console.log(`  …and ${hits.length - 10} more (--report for all)`);
  console.log();
}
process.exit(wantsReport ? 0 : 1);
