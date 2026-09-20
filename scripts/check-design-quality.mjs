#!/usr/bin/env node
/**
 * Design-quality gate.
 *
 * Runs the vendored impeccable detector (see docs/design/impeccable.md) over the two
 * things worth measuring, and compares what it finds with the committed baseline:
 *
 *   1. frontend/src             — what we author: components, pages, stylesheets.
 *                                 The detector reads class combinations and literal
 *                                 CSS here, and reports the file and line to fix.
 *   2. frontend/dist/**\/*.html  — what ships: every prerendered document. This is the
 *                                 only view that sees the rendered result (heading
 *                                 sizes, markup that only exists after prerendering).
 *
 * The built stylesheet is deliberately not a target. It is derived from frontend/src,
 * and scanning it makes the detector pair Tailwind utility *definitions* with each
 * other (`.text-slate-100` next to `.bg-amber-50` in the same bundle) which reports
 * combinations no element ever wears. The source scan reports the real usages.
 *
 * Usage:
 *   node scripts/check-design-quality.mjs             fail on any finding not in the baseline
 *   node scripts/check-design-quality.mjs --source-only  scan frontend/src only (no dist)
 *   node scripts/check-design-quality.mjs --update    rewrite the baseline (ratchet it down)
 *   node scripts/check-design-quality.mjs --json      print the summary as JSON
 *   node scripts/check-design-quality.mjs --quiet     only print the verdict
 *
 * Baseline: docs/design/impeccable-baseline.json
 *   `waivers`     findings accepted on purpose. Each carries a reason and matches by
 *                 rule + snippet substring, so a waived pattern on a newly added page
 *                 does not fail the gate. A waiver is only legitimate where something
 *                 else covers the same risk; the reason names that something.
 *   `outstanding` findings we intend to fix. The gate fails when a finding appears that
 *                 is neither waived nor listed here, so the baseline can only shrink
 *                 without a commit that says so.
 *
 * Exit codes: 0 clean, 1 new findings, 2 could not run (missing build, detector failure).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(ROOT, 'docs/design/impeccable-baseline.json');
const SOURCE_TARGET = 'frontend/src';
const DIST_DIR = join(ROOT, 'frontend/dist');

const args = process.argv.slice(2);
const wantsUpdate = args.includes('--update');
const wantsJson = args.includes('--json');
const quiet = args.includes('--quiet');
const sourceOnly = args.includes('--source-only');

function fail(message) {
  console.error(`\n[design-quality] ${message}`);
  process.exit(2);
}

function walkHtml(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkHtml(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

function runDetector(targets) {
  // npx resolves the locally installed CLI; it is a devDependency, so no network is
  // involved once `npm ci` has run.
  const res = spawnSync('npx', ['impeccable', 'detect', ...targets, '--json', '--no-advisory'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  if (res.error) fail(`could not run the impeccable detector: ${res.error.message}`);
  // Exit 2 means "findings", which is the normal case here; anything else is a problem.
  if (res.status !== 0 && res.status !== 2) {
    fail(`detector exited ${res.status}: ${(res.stderr || res.stdout || '').slice(0, 800)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(res.stdout || '[]');
  } catch (err) {
    fail(`detector output was not JSON: ${err.message}`);
  }
  return parsed;
}

function key(f) {
  return `${f.rule}|${f.file}|${f.snippet}`;
}

function normalise(finding) {
  return {
    rule: finding.antipattern,
    file: relative(ROOT, finding.file).split('\\').join('/'),
    line: finding.line || 0,
    snippet: (finding.snippet || '').trim(),
  };
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch (err) {
    fail(`baseline at docs/design/impeccable-baseline.json is not valid JSON: ${err.message}`);
  }
}

function isWaived(finding, waivers) {
  return waivers.some(
    (w) => w.rule === finding.rule && (!w.snippet || finding.snippet.includes(w.snippet)),
  );
}

if (wantsUpdate && sourceOnly) {
  fail('--update cannot run with --source-only; a source-only rewrite would drop prerendered HTML findings from the baseline.');
}

if (!existsSync(join(ROOT, SOURCE_TARGET))) {
  fail(`${SOURCE_TARGET} does not exist.`);
}

let htmlTargets = [];
if (sourceOnly) {
  if (!quiet) {
    console.log('[design-quality] source-only: scanning frontend/src (no prerendered HTML).');
  }
} else {
  if (!existsSync(DIST_DIR)) {
    fail('frontend/dist does not exist — run `npm run build:frontend` before the design-quality gate, or pass --source-only.');
  }
  htmlTargets = walkHtml(DIST_DIR).sort();
  if (htmlTargets.length === 0) fail('no prerendered HTML found under frontend/dist.');
}

const raw = runDetector([join(ROOT, SOURCE_TARGET), ...htmlTargets]);
const findings = raw.map(normalise);

const baseline = loadBaseline();
const waivers = (baseline && baseline.waivers) || [];
const outstanding = new Set(((baseline && baseline.outstanding) || []).map((o) => `${o.rule}|${o.file}|${o.snippet}`));

const waived = findings.filter((f) => isWaived(f, waivers));
const live = findings.filter((f) => !isWaived(f, waivers));
const fresh = live.filter((f) => !outstanding.has(key(f)));
const fixed = [...outstanding].filter((k) => !live.some((f) => key(f) === k));

const byRule = (list) => {
  const m = new Map();
  for (const f of list) m.set(f.rule, (m.get(f.rule) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

const summary = {
  scanned: { source: SOURCE_TARGET, documents: htmlTargets.length },
  findings: findings.length,
  waived: waived.length,
  outstanding: live.length,
  new: fresh.length,
  fixedSinceBaseline: fixed.length,
  byRule: Object.fromEntries(byRule(live)),
};

if (wantsUpdate) {
  const previous = baseline || {};
  const next = {
    $comment:
      'Design-quality baseline for scripts/check-design-quality.mjs. `waivers` are accepted on ' +
      'purpose and each names the check that covers the same risk. `outstanding` is the work left ' +
      'to do; it may only shrink without a commit that explains why it grew.',
    generatedAt: new Date().toISOString(),
    impeccable: previous.impeccable || {},
    targets: [SOURCE_TARGET, 'frontend/dist/**/*.html'],
    waivers: previous.waivers || [],
    counts: {
      waived: waived.length,
      outstanding: live.length,
      byRule: Object.fromEntries(byRule(live)),
    },
    outstandingFindings: live
      .slice()
      .sort((a, b) => a.rule.localeCompare(b.rule) || a.file.localeCompare(b.file))
      .map((f) => ({ rule: f.rule, file: f.file, snippet: f.snippet })),
  };
  // The gate reads `outstanding`; keep both spellings in sync so a hand edit cannot
  // silently detach the list from the counts.
  next.outstanding = next.outstandingFindings;
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  if (!quiet) {
    console.log(
      `[design-quality] baseline rewritten: ${live.length} outstanding, ${waived.length} waived.`,
    );
  }
  process.exit(0);
}

if (wantsJson) {
  console.log(JSON.stringify({ ...summary, newFindings: fresh, fixed }, null, 2));
} else if (!quiet) {
  console.log(
    `[design-quality] ${htmlTargets.length} documents + ${SOURCE_TARGET}: ` +
      `${live.length} outstanding, ${waived.length} waived, ${fresh.length} new.`,
  );
  for (const [rule, n] of byRule(live)) console.log(`  ${String(n).padStart(4)}  ${rule}`);
}

if (fresh.length > 0) {
  console.error(`\n[design-quality] ${fresh.length} new design-quality finding(s):`);
  for (const f of fresh.slice(0, 40)) {
    console.error(`  ${f.rule}  ${f.file}${f.line ? `:${f.line}` : ''}  ${f.snippet}`);
  }
  if (fresh.length > 40) console.error(`  … and ${fresh.length - 40} more.`);
  console.error(
    '\nFix them, or — only where another check covers the same risk — record a waiver with a\n' +
      'reason in docs/design/impeccable-baseline.json and run `npm run check:design:update`.',
  );
  process.exit(1);
}

if (!baseline) fail('no baseline committed at docs/design/impeccable-baseline.json.');

if (!quiet && fixed.length > 0) {
  console.log(
    `[design-quality] ${fixed.length} baseline entr${fixed.length === 1 ? 'y is' : 'ies are'} now fixed — run \`npm run check:design:update\` to ratchet the baseline down.`,
  );
}
process.exit(0);
