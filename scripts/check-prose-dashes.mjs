#!/usr/bin/env node
/**
 * Prose-dash policy check (audit P2-4 item 2, backlog 15).
 *
 * The design skill's ban on the em-dash is absolute for copy. The pragmatic revision this repo
 * adopted is narrower and testable:
 *
 *   1. `'—'` survives **only** as the empty-value glyph - the typographic stand-in for "no
 *      data". Anywhere a reader sees it as punctuation, it goes.
 *   2. An en-dash in a **range** (`2000–2026`, `0.40–0.65`, `6–9`, `Jan–Dec`, `22:00 – 07:00`) is
 *      the character an en-dash is for. Replacing it with a hyphen would be the typographic
 *      error, so ranges are allowed.
 *   3. Everything else - prose, headings, `aria-label`, `title`, `placeholder`, toast copy,
 *      markdown articles - is a finding.
 *
 * Comments and developer-facing attributes (`name`, `key`, `testID`, `data-*`, `className`,
 * `href`, …) are stripped before the check, so a dash in an explanatory comment is not copy.
 *
 * Usage: node scripts/check-prose-dashes.mjs [--json]
 * Exit code is 1 when copy carries a dash, so it can gate CI.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = [join(ROOT, 'frontend/src'), join(ROOT, 'apps/mobile/src')];
const EXTS = /\.(tsx|ts|md)$/;
/** Generated, vendored or test source: not copy a reader sees. */
const SKIP = /(node_modules|\/__tests__\/|\.test\.|generated)/;

const EM = '\u2014';
const EN = '\u2013';
const DASHES = `${EM}${EN}`;

/** Blank out comments while preserving line numbers, so a comment's dash is not a finding. */
function blankOutComments(source) {
  let out = '';
  let i = 0;
  let state = 'code'; // code | line | block
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    const ch = source[i];
    if (state === 'code' && two === '//') {
      state = 'line';
      out += '  ';
      i += 2;
      continue;
    }
    if (state === 'code' && two === '/*') {
      state = 'block';
      out += '  ';
      i += 2;
      continue;
    }
    if (state === 'line' && ch === '\n') state = 'code';
    if (state === 'block' && two === '*/') {
      state = 'code';
      out += '  ';
      i += 2;
      continue;
    }
    out += state === 'code' || ch === '\n' ? ch : ' ';
    i += 1;
  }
  return out;
}

/** Attributes a developer reads, not a visitor. */
const DEV_ATTR = /\b(name|key|testID|data-[a-z-]+|id|className|style|to|href|src|type|role)=("[^"]*"|'[^']*'|\{[^}]*\}|\S+)/g;

/** A range: digits, month abbreviations, or two interpolations joined by an en/em dash. */
const RANGE = new RegExp(
  `(\\d\\s*[${DASHES}]\\s*\\d)` +
    `|(\\b[A-Z][a-z]{2}\\s*[${DASHES}]\\s*[A-Z][a-z]{2}\\b)` +
    `|(\\}\\s*[${DASHES}]\\s*\\{)`,
);

/**
 * Judge each dash where it stands. The empty-value glyph is always written between quotes
 * (`'—'`), between tags (`>—<`), or between a ternary arm and a brace - so the characters on
 * either side decide it, not the line as a whole. A line can hold both a placeholder and prose;
 * this reports only the prose.
 */
function judge(line, index) {
  const before = line.slice(0, index);
  const after = line.slice(index + 1);
  const prev = before.trimEnd().slice(-1);
  const next = after.trimStart()[0] ?? '';
  const padded = /\s$/.test(before) && /^\s/.test(after);

  if (RANGE.test(before.slice(-6) + line[index] + after.slice(0, 6))) return 'range';
  if (/['"`]/.test(prev) && /['"`]/.test(next)) return 'placeholder';
  if (/[>{(,;:=?|]/.test(prev) && /[<})]/.test(next)) return 'placeholder';
  if (!padded) return 'placeholder'; // no spaces: a range or a glyph, never a sentence dash
  return 'prose';
}

const findings = [];
for (const dir of SCAN) {
  const files = [];
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (EXTS.test(entry)) files.push(full);
    }
  };
  walk(dir);

  for (const file of files) {
    const rel = relative(ROOT, file).split('\\').join('/');
    if (SKIP.test(rel)) continue;
    const code = blankOutComments(readFileSync(file, 'utf8'));
    code.split('\n').forEach((raw, index) => {
      if (!raw.includes(EM) && !raw.includes(EN)) return;
      // A documented exception: the dash is data or a transformation, not authored copy.
      if (raw.includes('prose-dash:')) return;
      const line = raw.replace(DEV_ATTR, '');
      for (let i = 0; i < line.length; i += 1) {
        if (line[i] !== EM && line[i] !== EN) continue;
        if (judge(line, i) === 'prose') {
          findings.push({
            file: rel,
            line: index + 1,
            kind: line[i] === EM ? 'em-dash' : 'en-dash',
            text: line.trim().slice(0, 140),
          });
          return; // one finding per line: the fix is per sentence
        }
      }
    });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(findings, null, 2));
  process.exit(findings.length === 0 ? 0 : 1);
}

if (findings.length === 0) {
  console.log('[prose-dashes] no em-dash or en-dash in reader-facing copy.');
} else {
  console.log(`[prose-dashes] ${findings.length} dash(es) in copy. The empty-value glyph '—' and en-dash ranges are allowed; these are not.`);
  for (const f of findings) console.log(`  ${f.file}:${f.line} [${f.kind}] ${f.text}`);
}
process.exit(findings.length === 0 ? 0 : 1);
