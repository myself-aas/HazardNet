#!/usr/bin/env node
/**
 * check-severity-embargo.mjs — fail the build if embargoed research leaks into public copy.
 *
 * WHY THIS EXISTS
 * ---------------
 * A derived severity index (and the weights behind it) is part of **unpublished
 * research**. Until that work is published, its formula, weights, calibrated
 * thresholds and cluster assignments must not appear in anything a visitor can read:
 * publishing them would undermine the novelty claim and may breach the authors'
 * conflict-of-interest obligations.
 *
 * A comment saying so is not a control. This is: every file that renders public copy
 * is scanned on each build, and the build fails if embargoed material appears. The
 * rule is enforced, not trusted.
 *
 * WHAT IS EMBARGOED
 * -----------------
 *   · a derived severity index / composite score and its weights or coefficients;
 *   · calibrated probability thresholds presented as HazardNet's own;
 *   · cluster ids, cluster centroids, or membership assignments;
 *   · anything labelled as a "novel"/"proposed"/"improved" index for this project.
 *
 * WHAT IS *NOT* EMBARGOED — and must not be blocked
 * -------------------------------------------------
 *   · `Severity_Index` as carried by the historical archive: a field of the source
 *     data, already present in the committed CSV, and explicitly *reported rather
 *     than computed*. Copy must label it as the archive's field.
 *   · severity values from `Models/` inference, physics-track severity, and the
 *     existing dual-track display — all shipped product, not research output.
 *   · the word "severity" itself. This is a hazard product; a blunt keyword block
 *     would be useless and would be disabled within a week.
 *
 * So the check is deliberately narrow: it looks for *derivation language* and
 * *research framing* attached to severity, not for the topic.
 *
 * Usage:
 *   node scripts/check-severity-embargo.mjs              # scan default public surfaces
 *   node scripts/check-severity-embargo.mjs --json       # machine-readable result
 *
 * Exit codes: 0 clean · 1 leak found
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/** Where visitor-readable copy lives. */
const SCAN_ROOTS = [
  'frontend/src/content',
  'frontend/src/data',
  'frontend/src/pages',
  'frontend/src/components',
  'frontend/public/data',
  'docs/PUBLIC_SURFACE.md',
];

/** Extensions worth reading as copy. */
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.md', '.html']);

/**
 * Paths that legitimately discuss the embargo itself, or are not public copy.
 * A file here is skipped wholesale — keep this list as short as possible, and never
 * add a file merely because it tripped the check.
 */
const ALLOWLIST = [
  'scripts/check-severity-embargo.mjs',
  'scripts/build_hazard_archive.mjs',
  'frontend/public/data/hazard-archive.json', // carries only the embargo *notice*
  'docs/codebase/',                            // internal engineering docs, not public copy
];

/**
 * Detection rules. Each is a claim about *derivation* or *research framing*, not a
 * topic keyword — see the module docstring for why.
 *
 * `pattern`  the text that constitutes a leak
 * `unless`   a co-occurring phrase that makes the match legitimate (the archive's own
 *            reported field, or the embargo notice itself)
 */
const RULES = [
  // ── block tier: derivation of a NEW severity value or its parameters ──────────
  {
    tier: 'block',
    id: 'index-weights',
    pattern: /\b(severity|index)\s+weights?\b/gi,
    unless: /\b(embargo|withheld|unpublished|not published)\b/i,
    why: 'Severity index weights are the core of the unpublished contribution.',
  },
  {
    tier: 'block',
    id: 'calibrated-thresholds',
    pattern: /\bcalibrated?\s+(probability\s+)?thresholds?\b/gi,
    unless: /\b(requires|required|not|no calibration|uncalibrated|embargo|withheld)\b/i,
    why: 'Calibrated thresholds presented as shipped would pre-empt the publication.',
  },
  {
    tier: 'block',
    id: 'cluster-membership',
    pattern: /\b(cluster|k-?means|centroid)\s*(ids?|numbers?|assignments?|membership|centroids?)\b/gi,
    unless: /\b(embargo|withheld|unpublished|in development|planned)\b/i,
    why: 'Cluster membership and centroids are derived research output.',
  },
  {
    tier: 'block',
    id: 'research-framing',
    pattern: /\b(under review|manuscript|journal submission|preprint)\b/gi,
    why: 'Announcing unpublished research status on a public page is itself a disclosure risk.',
  },

  // ── review tier: pre-existing copy an owner must classify ────────────────────
  // These do not fail the build. They are printed on every run so the question stays
  // visible instead of being answered once by an allowlist and forgotten. A composite
  // that merely COUNTS and AVERAGES existing severity values is a presentation
  // aggregation; one that derives a new severity value is embargoed. Only the owner
  // can say which this is, so the gate asks rather than decides.
  {
    tier: 'review',
    id: 'composite-index',
    pattern: /\b(composite|derived|weighted|novel|proposed|improved)\s+(severity|hazard|risk)\s+(index|score|distribution)\b/gi,
    unless: /\b(archive|reported|not computed|embargo|withheld)\b/i,
    why:
      'A composite index with a stated formula in public copy. If it derives a new ' +
      'severity value from weights it is embargoed; if it only counts/averages the ' +
      'model\'s existing severity it is a presentation aggregation. Owner must classify it.',
  },
];

function* walk(target) {
  if (!existsSync(target)) return;
  const stat = statSync(target);
  if (stat.isFile()) {
    yield target;
    return;
  }
  for (const entry of readdirSync(target)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    yield* walk(join(target, entry));
  }
}

function isAllowed(relPath) {
  return ALLOWLIST.some((entry) => relPath === entry || relPath.startsWith(entry));
}

export function scan() {
  const violations = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(join(ROOT, root))) {
      if (!SCAN_EXT.has(extname(file))) continue;
      const rel = relative(ROOT, file).split('\\').join('/');
      if (isAllowed(rel)) continue;

      const text = readFileSync(file, 'utf8');
      for (const rule of RULES) {
        const re = new RegExp(rule.pattern.source, rule.pattern.flags);
        let match;
        while ((match = re.exec(text)) !== null) {
          if (rule.unless) {
            // Look at the surrounding sentence: a legitimate mention of the archive's
            // own reported field must not be reported as a leak.
            const start = Math.max(0, match.index - 220);
            const window = text.slice(start, match.index + match[0].length + 220);
            if (rule.unless.test(window)) continue;
          }
          const line = text.slice(0, match.index).split('\n').length;
          violations.push({
            tier: rule.tier,
            file: rel,
            line,
            rule: rule.id,
            match: match[0],
            why: rule.why,
          });
        }
      }
    }
  }
  return violations;
}

function main() {
  const asJson = process.argv.includes('--json');
  const violations = scan();

  const blocks = violations.filter((v) => v.tier === 'block');
  const review = violations.filter((v) => v.tier === 'review');

  if (asJson) {
    console.log(JSON.stringify({ ok: blocks.length === 0, blocked: blocks, review }, null, 2));
    return blocks.length ? 1 : 0;
  }

  if (review.length) {
    console.warn(`[embargo] review: ${review.length} composite-index reference(s) awaiting owner classification.`);
    for (const v of review) {
      console.warn(`  ${v.file}:${v.line}  [${v.rule}]  "${v.match}"`);
    }
    console.warn('  → These do not fail the build. Classify each as (a) a presentation aggregation of\n' +
      '    existing severity values, or (b) a derived index — in which case remove it from\n' +
      '    public copy until the research is published.\n');
  }

  if (!blocks.length) {
    console.log(
      '[embargo] PASS: no embargoed severity-index derivation in public copy.\n' +
        '          The historical archive\'s own Severity_Index field is exempt by design.',
    );
    return 0;
  }

  console.error(`[embargo] FAIL: ${blocks.length} embargoed reference(s) in public copy.\n`);
  for (const v of blocks) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]  "${v.match}"`);
    console.error(`      ${v.why}`);
  }
  console.error(
    '\n  A derived severity index is under publication embargo. Publish the archive\'s own\n' +
      '  reported Severity_Index field instead, labelled as such, or set the embargo\n' +
      '  inactive in BOTH scripts/check-severity-embargo.mjs and\n' +
      '  scripts/build_hazard_archive.mjs once the research is published.',
  );
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
