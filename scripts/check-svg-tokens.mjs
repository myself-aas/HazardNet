#!/usr/bin/env node
/**
 * Raw colour literals in SVG presentation attributes.
 *
 * Why this gate exists
 * ────────────────────
 * The two contrast gates (`check-contrast.mjs`, `check-contrast-tree.mjs`) read
 * `className` and nothing else. An SVG paints through *attributes* instead —
 * `fill="#1d1d1f"`, `stroke="#0066cc"`, `stopColor="#c01f1f"` — so every colour
 * inside a hand-rolled chart or map was invisible to them.
 *
 * That blind spot is not cosmetic. A hex in an attribute cannot respond to
 * `prefers-color-scheme`, so those surfaces stay in their light-mode colours
 * when the rest of the page inverts. The Bangladesh district map was the worst
 * case: 14 literals, every one a copy of a LIGHT Apple token, which left the
 * whole map rendering light-on-light in dark mode.
 *
 * The rule
 * ────────
 * A colour in an SVG attribute must be a `var(--…)` reference, so it resolves
 * through the one token graph like everything else. Two things are allowed to
 * be literal, and both must say why:
 *
 *   · third-party brand marks (a Google "G" is #4285F4 by trademark, and
 *     re-tinting it would be wrong), listed in ALLOW below;
 *   · `none`, `transparent`, `currentColor` and `url(#…)` paint references,
 *     which carry no colour of their own.
 *
 * Usage: node scripts/check-svg-tokens.mjs [--report]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SRC = join(ROOT, 'frontend/src');
/**
 * Known backlog, same shape the other design ledgers use. The rule is enforced
 * going forward: a file may lose literals freely, but gaining one — or a new
 * file appearing — fails. Rewrite with `--update` only when clearing entries.
 */
const BASELINE = join(ROOT, 'data/design/svg-paint-baseline.json');

/**
 * Literals that are correct as literals. Keyed by file, because a brand hex is
 * only legitimate in the component that draws that brand's mark.
 */
const ALLOW = {
  'components/ProviderGlyph.tsx': {
    '#4285F4': 'Google brand blue, fixed by their mark guidelines; tinting it would misrepresent the provider.',
  },
};

/** Attributes that paint. `color` is included: it feeds currentColor. */
const PAINT_ATTRS = ['fill', 'stroke', 'stopColor', 'stop-color', 'floodColor', 'flood-color', 'lightingColor', 'color'];

/**
 * Matches `attr="…"`, `attr='…'` and `attr={…}`. The braced form captures the
 * WHOLE expression rather than a lone string, because the first version of this
 * gate only understood `{'#fff'}` and walked straight past
 * `{isSelected ? '#1d1d1f' : '#333333'}` — a ternary is where a hardcoded
 * colour is most likely to hide, since that is what a state-dependent paint
 * looks like.
 */
const ATTR_RE = new RegExp(
  `\\b(${PAINT_ATTRS.join('|')})\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{([^}]*)\\})`,
  'g',
);

/** Every colour literal inside an arbitrary expression. */
const INLINE_LITERAL_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;

/** A literal colour: hex, rgb()/rgba(), hsl()/hsla(), or a CSS named colour we care about. */
const LITERAL_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const findings = [];
for (const file of walk(SRC)) {
  const rel = relative(SRC, file).split('\\').join('/');
  const allowed = ALLOW[rel] ?? {};
  const lines = readFileSync(file, 'utf8').split('\n');
  for (const [i, line] of lines.entries()) {
    for (const m of line.matchAll(ATTR_RE)) {
      const quoted = (m[2] ?? m[3] ?? '').trim();
      if (m[2] !== undefined || m[3] !== undefined) {
        if (!LITERAL_RE.test(quoted) || allowed[quoted]) continue;
        findings.push({ file: rel, line: i + 1, attr: m[1], value: quoted });
        continue;
      }
      for (const lit of (m[4] ?? '').match(INLINE_LITERAL_RE) ?? []) {
        if (allowed[lit]) continue;
        findings.push({ file: rel, line: i + 1, attr: m[1], value: lit });
      }
    }
  }
}

const byFile = {};
for (const f of findings) (byFile[f.file] ??= []).push(f);
const counts = Object.fromEntries(
  Object.entries(byFile).map(([file, list]) => [file, list.length]).sort(),
);

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, `${JSON.stringify({
    why: 'Raw colour literals in SVG paint attributes that predate check-svg-tokens.mjs. '
      + 'Each one is frozen in its light-mode value and cannot follow the theme. '
      + 'Counts may only go down.',
    files: counts,
  }, null, 2)}\n`);
  console.log(`baseline written: ${findings.length} literal(s) across ${Object.keys(counts).length} file(s)`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).files;
const regressions = [];
for (const [file, n] of Object.entries(counts)) {
  const allowedCount = baseline[file] ?? 0;
  if (n > allowedCount) regressions.push(`${file}: ${n} literal(s), baseline allows ${allowedCount}`);
}
const cleared = Object.entries(baseline).filter(([file, n]) => (counts[file] ?? 0) < n);

if (regressions.length === 0) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`✅ no new raw SVG paint. ${total} known literal(s) remain in ${Object.keys(counts).length} file(s).`);
  if (cleared.length) {
    console.log(`   ${cleared.length} file(s) improved since the baseline — run --update to bank it:`);
    for (const [file, n] of cleared) console.log(`     ${file}: ${n} → ${counts[file] ?? 0}`);
  }
  process.exit(0);
}

console.log(`${regressions.length} file(s) gained a raw colour literal in an SVG paint attribute:\n`);
for (const r of regressions) console.log(`  ${r}`);
if (process.argv.includes('--report')) {
  for (const [file, list] of Object.entries(byFile)) {
    if (!regressions.some((r) => r.startsWith(file))) continue;
    for (const f of list) console.log(`     ${file}:${f.line}  ${f.attr}="${f.value}"`);
  }
}
console.log('\nUse a token: fill="var(--ap-sev-high)" or a Tailwind paint class (fill-carbon-90).');
process.exit(1);
