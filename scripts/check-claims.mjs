#!/usr/bin/env node
/**
 * Claims registry gate — PRD REQ-006 / TASK-008 / TRD INT-CLAIM-01.
 *
 * Rule: a metric-shaped number may appear in PUBLIC COPY only if its value is
 * registered in docs/CLAIMS.md with a strategy label. Unregistered metric →
 * exit 1 (fails CI).
 *
 * What counts as public copy (deliberately narrow, to keep false positives
 * near zero — see the runbook failure-mode playbook: the scanner targets
 * METRIC patterns, not every number):
 *   1. JSX text nodes in the frontend source (content between > and <)
 *   2. String literals assigned to copy-carrying props: label, title,
 *      subtitle, description, alt, aria-label, content, text, badge, name,
 *      question, answer
 *   3. Plain HTML files (frontend/index.html, dist/index.html)
 *
 * What is scanned for:
 *   P1  percentages in prose            "98.4%", "Severity ≥ 67%"
 *   P2  skill-metric tokens near a number  "MAE 0.034", "POD of 0.7"
 *   P3  bare skill-score decimals        0.9887, 0.034 (0.XX / 0.XXX / 0.XXXX)
 *   P4  latency claims                   "42.8 ms"
 *
 * Exemptions: pure geometry/style literals ("50%", "w-[85%]", SVG attributes)
 * never enter the corpus because only JSX text and copy-named props are
 * extracted. Runtime-computed values (`${expr}` template chunks without
 * digits) carry no static number and are ignored by construction.
 *
 * Usage:
 *   node scripts/check-claims.mjs                       # defaults
 *   node scripts/check-claims.mjs --claims docs/CLAIMS.md \
 *        --src frontend/src --html frontend/index.html
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// ─── CLI ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { claims: 'docs/CLAIMS.md', src: ['frontend/src'], html: ['frontend/index.html'], root: process.cwd() };
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    const val = argv[i + 1];
    if (key === 'claims') args.claims = val;
    else if (key === 'src') args.src = val.split(',').filter(Boolean);
    else if (key === 'html') args.html = val.split(',').filter(Boolean);
    else if (key === 'root') args.root = val;
  }
  return args;
}

// ─── Registry parsing ───────────────────────────────────────────────────────
export function parseClaims(text) {
  const values = new Set();
  for (const line of text.split('\n')) {
    const m = line.match(/^\|\s*([0-9]+(?:\.[0-9]+)?)\s*\|/);
    if (m) values.add(m[1]);
  }
  return values;
}

// ─── Corpus extraction ──────────────────────────────────────────────────────
const COPY_PROPS = new Set([
  'label', 'title', 'subtitle', 'description', 'alt', 'aria-label', 'aria-label',
  'content', 'text', 'badge', 'name', 'question', 'answer', 'placeholder',
]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === '__tests__' || entry === '__mocks__') continue; // not public copy
      yield* walk(p);
    } else if (/\.(tsx|ts)$/.test(entry) && !/\.(test|spec)\./.test(entry)) yield p;
  }
}

/** JSX text nodes: content between `>` and `<` that contains no `{` blocks.
 *  The `>` must not close an arrow function (`=>`), and segments carrying
 *  code punctuation (`[`, `]`, `;`, `=`) are dropped — they are component
 *  body code caught between a `=>` and the next `<`, never rendered copy. */
function extractJsxText(source) {
  const out = [];
  const re = /(?<!=)>([^<>{}]+)</g;
  let m;
  while ((m = re.exec(source))) {
    // decode HTML entities first so legends like "(&lt;0.50)" scan as "(<0.50)"
    const text = m[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, '#');
    if (/[0-9]/.test(text) && !/[[\]=]/.test(text)) out.push(text);
  }
  return out;
}

/** Copy-carrying string literals: JSX attributes (prop="…") AND object
 *  properties (prop: '…') — quick-action lists, sample questions etc. use
 *  the object form. */
function extractCopyProps(source) {
  const out = [];
  const propAlt = [...COPY_PROPS].join('|');
  const re = new RegExp(
    `(?:^|[\\s,{])(${propAlt})\\s*[:=]\\s*(?:"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"|'([^'\\\\]*(?:\\\\.[^'\\\\]*)*)')`,
    'g'
  );
  let m;
  while ((m = re.exec(source))) {
    const text = m[2] ?? m[3] ?? '';
    if (/[0-9]/.test(text)) out.push(text);
  }
  return out;
}

// ─── Metric patterns ────────────────────────────────────────────────────────
const PATTERNS = [
  { id: 'P1', re: /(\d{1,3}(?:\.\d+)?)\s*%/g, kind: 'percentage' },
  { id: 'P2', re: /\b(?:F1|POD|FAR|CSI|ECE|MAE|RMSE|softmax|accuracy|precision|recall|confidence)\b(?![\w.-]*\d)[^.<>{}]{0,40}?(?:^|[^A-Za-z0-9.])(\d+(?:\.\d+)?)/gi, kind: 'metric-token' },
  { id: 'P3', re: /\b(0\.\d{2,4})\b/g, kind: 'skill-score' },
  { id: 'P4', re: /\b(\d+(?:\.\d+)?)\s*ms\b/g, kind: 'latency' },
];

export function findViolations(corpus, registeredValues) {
  const violations = [];
  for (const { file, text } of corpus) {
    for (const { re, kind } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        const token = m[1];
        if (!registeredValues.has(token)) {
          const idx = m.index;
          const line = text.slice(0, idx).split('\n').length;
          violations.push({ file, line, kind, token, context: text.slice(Math.max(0, idx - 40), idx + 30).replace(/\s+/g, ' ').trim() });
        }
      }
    }
  }
  return violations;
}

export function collectCorpus({ srcDirs, htmlFiles, root }) {
  const corpus = [];
  for (const dir of srcDirs) {
    const abs = resolve(root, dir);
    if (!existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const source = readFileSync(file, 'utf8');
      const combined = [...extractJsxText(source), ...extractCopyProps(source)].join('\n');
      if (combined.trim()) corpus.push({ file: relative(root, file), text: combined });
    }
  }
  for (const html of htmlFiles) {
    const abs = resolve(root, html);
    if (existsSync(abs)) {
      const source = readFileSync(abs, 'utf8');
      // strip tags so only human-visible text remains
      const text = source.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
      if (/[0-9]/.test(text)) corpus.push({ file: html, text });
    }
  }
  return corpus;
}

// ─── Main ───────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv);
  const claimsPath = join(args.root, args.claims);
  if (!existsSync(claimsPath)) {
    console.error(`❌ claims registry not found: ${claimsPath}`);
    process.exit(2);
  }
  const registered = parseClaims(readFileSync(claimsPath, 'utf8'));
  const corpus = collectCorpus({ srcDirs: args.src, htmlFiles: args.html, root: args.root });

  const violations = findViolations(corpus, registered);

  console.log(`Claims gate: ${corpus.length} public-copy source(s) scanned, ${registered.size} registered values.`);
  if (violations.length === 0) {
    console.log('✅ every metric-shaped number in public copy is registered in docs/CLAIMS.md');
    return;
  }
  console.error(`\n❌ ${violations.length} unregistered metric(s) in public copy (PRD REQ-006):`);
  const seen = new Set();
  for (const v of violations) {
    const key = `${v.file}:${v.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.error(`  ${v.file} [${v.kind} ${v.id}] "${v.token}" — …${v.context}…`);
  }
  console.error('\nFix: register the value with its strategy label in docs/CLAIMS.md, or remove/replace the fabricated metric.');
  process.exit(1);
}

const invokedDirectly = process.argv[1] && (process.argv[1].endsWith('check-claims.mjs'));
if (invokedDirectly) main();
