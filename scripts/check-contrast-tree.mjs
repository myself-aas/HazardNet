#!/usr/bin/env node
/**
 * Contrast across the JSX tree, not just within one element.
 *
 * check-contrast.mjs scores a foreground against a background only when both
 * sit in the same class list. Most real markup does not work that way — a panel
 * sets the fill and its children set the ink:
 *
 *     <div className="bg-carbon-90 …">
 *       <h3 className="text-white">…</h3>     ← 16.83:1 light, 1.00:1 dark
 *
 * carbon-90 inverts to #ffffff, so that heading disappears in dark mode. The
 * flat scanner cannot see it: the <h3> has no background of its own and the
 * <div> has no text of its own, so neither line has a scoreable pair.
 *
 * This walks the real JSX tree with Babel and resolves each element's ink
 * against the nearest ANCESTOR that paints a background.
 *
 * Deliberately conservative — it reports only what it can stand behind:
 *   • static class strings only. A className built from a ternary or a variable
 *     may differ per state, so the element is treated as painting nothing
 *     rather than guessed at.
 *   • an ancestor whose background is a translucent veil or `bg-transparent`
 *     is skipped, because the true ground is whatever is behind the component.
 *   • it stops at the component root; it cannot know what a parent component
 *     renders this into.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { resolve, contrast, isResting, RESOLVER, LITERAL } from './lib/class-resolver.mjs';

const traverse = _traverse.default ?? _traverse;
const AA = 4.5;

/**
 * The family alternation is DERIVED from the real token graph, never
 * hand-listed. A hand-list is silently wrong in the worst possible way: a
 * family it omits (`carbon-black`, `warning-surface`) makes the element
 * carrying that background invisible to the tree walk, so its children get
 * scored — and "fixed" — against the wrong ancestor. Longest-first so
 * `carbon-black` wins over `carbon`.
 */
const FAMILIES = [...new Set([
  ...Object.keys(RESOLVER.theme).map((k) => k.replace(/^--color-/, '').replace(/-\d{2,3}$/, '')),
  // Tailwind literals never appear as `--color-*` tokens, so the token graph
  // alone does not know them. Omitting `white` here is what hid self-painted
  // panels from the walk.
  ...Object.keys(LITERAL),
])].sort((a, b) => b.length - a.length);
const RAMP = FAMILIES.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const CLS = new RegExp(`^(dark:)?(text|bg)-(${RAMP})(?:-(\\d{2,3}))?(?:/(\\d{1,3}))?$`);
/**
 * Grounds whose real backdrop is not knowable from the markup: a translucent
 * veil sits on whatever the component was dropped onto — a map tile, a hero
 * photo. Scoring a ratio against the page canvas there would be inventing a
 * number, so contrast is not scored. The STRUCTURAL rule below still applies.
 */
const UNKNOWABLE = /^(?:dark:)?bg-(?:transparent|[a-z0-9-]+\/\d{1,3})$/;
/** Grounds that are the same colour in both themes. */
const FIXED_GROUND = /^(?:dark:)?bg-(?:carbon-black|black|white)(?:\/\d+)?$/;

/** Resolve a utility class to a hex in one theme, or null. Shared with the flat scanner. */
const colorOf = (cls, mode) => {
  if (cls.startsWith('dark:') && mode !== 'dark') return null;
  return resolve(cls, mode);
};

/**
 * Ink that is correct for a given kind of ground.
 *
 * The neutral ramp splits cleanly at 40/50: on an inverting tile only 10–40
 * (and ap-on-inverse) clear AA, and on a normal surface only 50–90 do. The
 * coloured families split at 300/400 the same way. Mapping therefore depends
 * entirely on which ground the element actually sits on, which is why this
 * runs off the JSX tree instead of a regex.
 */
const INVERTED_TILE = /^(?:dark:)?bg-carbon-(?:70|80|90)(?:\/\d+)?$/;
const PLAIN_SURFACE = /^(?:dark:)?bg-(?:white|carbon-0?5|carbon-10)(?:\/\d+)?$/;
const ACTION_FILL = /^(?:dark:)?bg-(?:primary|primary-strong|blue-[5-7]00|ap-primary)(?:\/\d+)?$/;
/** #000 in both themes, so its ink must be fixed, not inverting. */
const FIXED_SCRIM = /^(?:dark:)?bg-(?:carbon-black|black)(?:\/\d+)?$/;

function remedy(fgCls, bgCls) {
  const fg = fgCls.replace(/^dark:/, '');
  if (ACTION_FILL.test(bgCls)) return 'text-ap-action-fg';
  if (FIXED_SCRIM.test(bgCls)) {
    if (/^text-white\/\d+$/.test(fg)) return 'text-ap-on-scrim-muted';
    if (/^text-carbon-(?:10|20|30|40|50|60)$/.test(fg)) return 'text-ap-on-scrim-muted';
    if (/^text-(?:white|carbon-(?:70|80|90)|carbon-black|ap-on-inverse|black)$/.test(fg)) return 'text-ap-on-scrim';
    // The accent and the severity encoding both need a value that holds in
    // both themes, because the scrim underneath them does not move.
    if (/^text-(?:ap-link|ap-action|primary|primary-strong|blue-\d{2,3})$/.test(fg)) return 'text-ap-primary-on-dark';
    if (/^text-(?:rose|red|amber|orange|severity)[a-z-]*-?\d*$/.test(fg)) return 'text-ap-on-scrim-sev';
    return null;
  }
  if (INVERTED_TILE.test(bgCls)) {
    if (/^text-white\/\d+$/.test(fg)) return 'text-carbon-30';         // muted, stays muted
    if (/^text-(?:white|carbon-(?:70|80|90))$/.test(fg)) return 'text-ap-on-inverse';
    if (/^text-carbon-(?:50|60)$/.test(fg)) return 'text-carbon-30';
    if (fg === 'text-ap-link') return 'text-blue-300';
    const fam = /^text-([a-z]+)-(?:400|500|600|700)$/.exec(fg);
    if (fam) return `text-${fam[1]}-300`;
    return null;
  }
  if (PLAIN_SURFACE.test(bgCls)) {
    if (/^text-(?:carbon-(?:10|20|30|40)|ap-on-scrim-muted)$/.test(fg)) return 'text-carbon-60';
    // carbon-black is #000 in BOTH themes; on a surface that inverts it goes
    // black-on-dark. The surface ink must invert with the surface.
    if (/^text-(?:white|ap-on-inverse|carbon-black|black|ap-on-scrim)$/.test(fg)) return 'text-carbon-90';
    // Scrim-pinned inks landing back on a light surface need their inverting
    // counterparts, not the values that were pinned for a black scrim.
    if (fg === 'text-ap-primary-on-dark') return 'text-ap-link';
    if (fg === 'text-ap-on-scrim-sev') return 'text-rose-700';
    return null;
  }
  return null;
}

/** Static class list of a JSX element: string literals and template quasis. */
function classesOf(node) {
  const attr = node.openingElement?.attributes?.find(
    (a) => a.type === 'JSXAttribute' && (a.name?.name === 'className' || a.name?.name === 'class'),
  );
  if (!attr?.value) return [];
  const out = [];
  const push = (text, node) => {
    for (const c of String(text).split(/\s+/).filter(Boolean)) out.push({ cls: c, node });
  };
  if (attr.value.type === 'StringLiteral') push(attr.value.value, attr.value);
  else if (attr.value.type === 'JSXExpressionContainer') {
    const e = attr.value.expression;
    if (e.type === 'StringLiteral') push(e.value, e);
    else if (e.type === 'TemplateLiteral') for (const q of e.quasis) push(q.value.cooked ?? '', q);
  }
  return out;
}

const pick = (entries, prop, mode) => {
  let base = null;
  let dark = null;
  for (const e of entries) {
    const m = CLS.exec(e.cls);
    if (!m || m[2] !== prop || !isResting(e.cls)) continue;
    if (e.cls.startsWith('dark:')) dark = e;
    else base = e;
  }
  return mode === 'dark' ? dark ?? base : base;
};

const files = execSync("find frontend/src -name '*.tsx' ! -path '*__tests__*'")
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean);

const problems = [];
const edits = [];
const wantsFix = process.argv.includes('--fix');

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parse(src, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });
  } catch {
    continue; // a file we cannot parse is not a file we may report on
  }

  traverse(ast, {
    JSXElement(path) {
      const classes = classesOf(path.node);
      if (!classes.length) return;

      for (const mode of ['light', 'dark']) {
        const fgEntry = pick(classes, 'text', mode);
        if (!fgEntry) continue;

        // Nearest ground that actually paints, STARTING WITH THE ELEMENT
        // ITSELF. Skipping self here is what let an earlier revision of this
        // codemod rewrite ink on self-painted panels against the modal scrim
        // behind them, producing white-on-white.
        let bgEntry = pick(classes, 'bg', mode);
        let holder = bgEntry ? path.node : null;
        if (!bgEntry) {
          for (let p = path.parentPath; p; p = p.parentPath) {
            if (p.node.type !== 'JSXElement') continue;
            const cand = pick(classesOf(p.node), 'bg', mode);
            if (cand) {
              bgEntry = cand;
              holder = p.node;
              break;
            }
          }
        }
        if (!bgEntry) continue;

        const fg = colorOf(fgEntry.cls, mode);
        const bg = colorOf(bgEntry.cls, mode);
        if (!fg || !bg) continue;

        // Structural: a ground that is the same colour in both themes cannot
        // carry ink that flips. Whatever the backdrop actually is, the pair is
        // wrong in one of the two themes — no ratio needed to know that.
        if (mode === 'light' && FIXED_GROUND.test(bgEntry.cls)) {
          const inkLight = colorOf(fgEntry.cls, 'light');
          const inkDark = colorOf(fgEntry.cls, 'dark');
          const groundFixed = colorOf(bgEntry.cls, 'light') === colorOf(bgEntry.cls, 'dark');
          if (groundFixed && inkLight && inkDark && inkLight !== inkDark) {
            const fix = remedy(fgEntry.cls, bgEntry.cls);
            problems.push({
              file: file.replace('frontend/src/', ''),
              line: path.node.loc?.start.line ?? 0,
              mode: 'both',
              pair: `${fgEntry.cls} inside ${bgEntry.cls}`,
              detail: `ink flips ${inkLight}→${inkDark} on a ground that never flips`,
              ancestorLine: holder?.loc?.start.line ?? 0,
              fix,
            });
            if (fix) {
              edits.push({
                file, start: fgEntry.node.start, end: fgEntry.node.end,
                from: fgEntry.cls,
                to: fgEntry.cls.startsWith('dark:') ? `dark:${fix}` : fix,
              });
            }
            continue;
          }
        }

        if (UNKNOWABLE.test(bgEntry.cls)) continue;

        const ratio = contrast(fg, bg);
        if (ratio < AA) {
          const fix = remedy(fgEntry.cls, bgEntry.cls);
          problems.push({
            file: file.replace('frontend/src/', ''),
            line: path.node.loc?.start.line ?? 0,
            mode,
            pair: `${fgEntry.cls} inside ${bgEntry.cls}`,
            detail: `${fg} on ${bg} = ${ratio.toFixed(2)}:1 (AA needs ${AA})`,
            ancestorLine: holder?.loc?.start.line ?? 0,
            fix,
          });
          if (fix) {
            edits.push({
              file,
              start: fgEntry.node.start,
              end: fgEntry.node.end,
              from: fgEntry.cls,
              to: fgEntry.cls.startsWith('dark:') ? `dark:${fix}` : fix,
            });
          }
        }
      }
    },
  });
}

if (wantsFix) {
  // Apply from the end of each file backwards so earlier offsets stay valid.
  const byFile = {};
  for (const e of edits) (byFile[e.file] ??= []).push(e);
  let applied = 0;
  const unfixable = problems.filter((p) => !p.fix).length;
  for (const [file, list] of Object.entries(byFile)) {
    let text = readFileSync(file, 'utf8');
    const seen = new Set();
    for (const e of list.sort((a, b) => b.start - a.start)) {
      const key = `${e.start}:${e.from}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const slice = text.slice(e.start, e.end);
      const re = new RegExp(`(?<![\\w:-])${e.from.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![\\w/-])`, 'g');
      const next = slice.replace(re, e.to);
      if (next === slice) continue;
      text = text.slice(0, e.start) + next + text.slice(e.end);
      applied += 1;
    }
    writeFileSync(file, text);
  }
  console.log(`applied ${applied} inherited-background fix(es) across ${Object.keys(byFile).length} file(s)`);
  if (unfixable) console.log(`${unfixable} finding(s) had no mechanical remedy and were left for review`);
  process.exit(0);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ total: problems.length, problems }, null, 2));
  process.exit(0);
}

if (!problems.length) {
  console.log(`✅ ${files.length} components: inherited backgrounds contrast in both themes.`);
  process.exit(0);
}

console.log(`${problems.length} inherited-background contrast problem(s):\n`);
const byPair = {};
for (const p of problems) (byPair[p.pair] ??= []).push(p);
for (const [pair, hits] of Object.entries(byPair).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(hits.length).padStart(3)}  ${pair}`);
  if (process.argv.includes('--report')) {
    for (const h of hits) console.log(`         ${h.file}:${h.line} (bg at :${h.ancestorLine})  ${h.detail}`);
  }
}
process.exit(1);
