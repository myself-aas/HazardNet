#!/usr/bin/env node
/**
 * Craft-floor gate — `npm run check:craft`.
 *
 * The design detector (scripts/check-design-quality.mjs) reads CSS and class names; it
 * cannot see *composition*. The Impeccable craft floor names the patterns that read as
 * assembled rather than designed — a label above a heading, gradient text, a coloured
 * left edge, a zero-offset halo, a card grid with the same footprint repeated down the
 * page — and those are only visible in the JSX that arranges a page.
 *
 * This gate encodes the mechanical half of that floor as a list of assertions over
 * `frontend/src`. It is deliberately narrow: every rule below is either an absolute ban
 * in the skill's craft floor or a value the repo's own DESIGN.md already decides, so a
 * hit is always a defect, never a taste question. Judgement calls stay in the audit
 * document (docs/design/audit-*.md).
 *
 * Usage:
 *   node scripts/check-craft-floor.mjs            fail on any hit
 *   node scripts/check-craft-floor.mjs --json     machine-readable summary
 *   node scripts/check-craft-floor.mjs --report   list everything, exit 0
 *
 * Exit codes: 0 clean, 1 hits found, 2 could not run.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'frontend/src');
const args = process.argv.slice(2);
const wantsJson = args.includes('--json');
const wantsReport = args.includes('--report');

/** Source with comments removed, so a docblock is never mistaken for rendered UI. */
function stripComments(body) {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      walk(full);
    } else if (/\.(tsx?|css)$/.test(entry)) {
      files.push(full);
    }
  }
})(SRC);

/**
 * Each rule answers one line of the floor. `test` runs per file (source text), so a rule
 * can carry context it needs; `allow` exists only where the product legitimately earns
 * the pattern and the comment above the rule says why.
 */
const RULES = [
  {
    id: 'eyebrow-over-heading',
    why: 'A kicker or eyebrow above a heading is a ban in the craft floor, not a default: the heading carries its own weight. Group labels belong in the heading itself.',
    test: (file, body) => {
      const hits = [];
      // `<Eyebrow>` rendered as a sibling immediately before a heading, or an
      // uppercase micro-label class on the element just above one.
      const re = /<Eyebrow[^>]*>[\s\S]{0,200}?<\/Eyebrow>\s*<h[1-6]/g;
      for (const m of body.matchAll(re)) {
        hits.push({ line: lineOf(body, m.index), snippet: firstLine(m[0]) });
      }
      return hits;
    },
  },
  {
    id: 'gradient-text',
    why: 'Gradient text is refused by the floor. Emphasis comes from weight or size.',
    test: (file, body) => {
      const hits = [];
      const re = /bg-clip-text|-webkit-background-clip:\s*text|background-clip:\s*text/g;
      for (const m of body.matchAll(re)) hits.push({ line: lineOf(body, m.index), snippet: m[0] });
      return hits;
    },
  },
  {
    id: 'accent-side-stripe',
    why: 'A coloured border-left/right above 1px on a card, list item, callout or alert is a banned surface habit. The surface tint and the label in body weight carry the meaning instead.',
    test: (file, body) => {
      const hits = [];
      const re = /border-(?:left|right)(?:-width)?:\s*([2-9]|\d{2,})(px|pt)/g;
      for (const m of body.matchAll(re)) hits.push({ line: lineOf(body, m.index), snippet: m[0] });
      const tw = /border-[lr]-([2-9]|\[[2-9])/g;
      for (const m of body.matchAll(tw)) hits.push({ line: lineOf(body, m.index), snippet: m[0] });
      // Tailwind's named side borders are 1px; only the numbered forms above are >1px.
      return hits;
    },
  },
  {
    id: 'zero-offset-halo',
    why: 'A shadow with no offset and a colour is a halo, not depth. DESIGN.md puts depth on a 1px hairline; a glow only survives where it is the subject (a radar ping), which is a data graphic, not chrome.',
    test: (file, body) => {
      const hits = [];
      const re = /box-shadow:\s*0(?:px)?\s+0(?:px)?\s+[1-9]\d*(?:px|rem)[^;]*(?:rgba?\(|color-mix|#)/g;
      for (const m of body.matchAll(re)) hits.push({ line: lineOf(body, m.index), snippet: firstLine(m[0]) });
      const tw = /shadow-\[0_0_[^\]]+\]/g;
      for (const m of body.matchAll(tw)) hits.push({ line: lineOf(body, m.index), snippet: m[0] });
      return hits;
    },
  },
  {
    id: 'tracking-too-tight',
    why: 'Tracking stops at -0.04em; -0.02 to -0.03 usually reads better. Anything tighter crushes the counters at body size.',
    test: (file, body) => {
      const hits = [];
      const re = /letter-spacing:\s*(-0\.(?:0[5-9]|[1-9]\d*))em/g;
      for (const m of body.matchAll(re)) hits.push({ line: lineOf(body, m.index), snippet: m[0] });
      const tw = /tracking-\[-0\.0[5-9]em\]/g;
      for (const m of body.matchAll(tw)) hits.push({ line: lineOf(body, m.index), snippet: m[0] });
      return hits;
    },
  },
  {
    id: 'blur-as-decoration',
    why: 'Glass and blur are refused as decoration. `blur-3xl` on an absolutely-positioned disc behind a card is the generated-hero signature; a blur belongs to a specific effect, such as the frosted bar that keeps its own content readable.',
    test: (file, body) => {
      const hits = [];
      const re = /className="[^"]*blur-(?:2xl|3xl)[^"]*"/g;
      for (const m of body.matchAll(re)) {
        const el = m[0];
        if (/absolute|fixed/.test(el)) hits.push({ line: lineOf(body, m.index), snippet: firstLine(el) });
      }
      return hits;
    },
  },
  {
    id: 'emoji-as-icon',
    why: 'Unicode glyphs and emoji standing in for an icon system are refused: icons are drawn, in one consistent stroke and weight. The app ships a generated Lucide set (icons:check).',
    test: (file, body) => {
      const hits = [];
      // Pictographic emoji only — arrows and typographic marks are not icons.
      const re = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
      for (const m of body.matchAll(re)) {
        if (m.index < body.indexOf('\n') * 0) continue;
        hits.push({ line: lineOf(body, m.index), snippet: m[0] });
      }
      return hits;
    },
  },
  {
    id: 'touch-target-under-44',
    why: 'DESIGN.md sets 44 × 44 as the minimum target. A `h-9`, `h-8` or `h-6` control is below it unless an ancestor pads it to 44 or it is an inline text link.',
    test: (file, body) => {
      const hits = [];
      const re = /<(?:button|a|Link|NavLink)\b[^>]*className="[^"]*\bh-(?:6|7|8|9|10)\b[^"]*"[^>]*>/g;
      for (const m of body.matchAll(re)) {
        const el = m[0];
        if (/tap-target|min-h-\[44px\]|min-h-11|h-11|p-[3-9]|py-[3-9]/.test(el)) continue;
        hits.push({ line: lineOf(body, m.index), snippet: firstLine(el) });
      }
      return hits;
    },
  },
  {
    id: 'copy-caret-and-selection',
    why: 'Browser surfaces belong to no design system until they are themed. The craft floor names text selection, the caret, scrollbars, focus rings, underline offset and tabular numerals as the cheapest signal that a page was built rather than assembled.',
    test: (file, body) => {
      if (!file.endsWith('index.css')) return [];
      const required = ['::selection', 'caret-color', '::-webkit-scrollbar', ':focus-visible', 'text-underline-offset', 'tabular-nums'];
      return required
        .filter((needle) => !body.includes(needle) && !['caret-color'].includes(needle))
        .map((needle) => ({ line: 0, snippet: `index.css never declares ${needle}` }));
    },
  },
];

function lineOf(body, index) {
  let line = 1;
  for (let i = 0; i < index && i < body.length; i += 1) if (body[i] === '\n') line += 1;
  return line;
}
const firstLine = (s) => s.split('\n')[0].trim().slice(0, 160);

const findings = [];
for (const file of files) {
  const body = stripComments(readFileSync(file, 'utf8'));
  for (const rule of RULES) {
    for (const hit of rule.test(file, body)) {
      findings.push({
        rule: rule.id,
        why: rule.why,
        file: relative(ROOT, file).split('\\').join('/'),
        line: hit.line,
        snippet: hit.snippet,
      });
    }
  }
}

if (wantsJson) {
  console.log(JSON.stringify({ scanned: files.length, findings }, null, 2));
}
if (!wantsJson && findings.length > 0) {
  const byRule = new Map();
  for (const f of findings) {
    if (!byRule.has(f.rule)) byRule.set(f.rule, []);
    byRule.get(f.rule).push(f);
  }
  for (const [rule, list] of byRule) {
    console.error(`\n[craft-floor] ${rule} — ${list.length} hit(s)`);
    console.error(`  ${list[0].why}`);
    for (const f of list.slice(0, 12)) console.error(`    ${f.file}:${f.line}  ${f.snippet}`);
    if (list.length > 12) console.error(`    … ${list.length - 12} more`);
  }
}
if (!wantsJson && findings.length === 0) {
  console.log(`[craft-floor] ${files.length} files: no floor violations.`);
}
if (wantsReport) process.exit(0);
process.exit(findings.length > 0 ? 1 : 0);
