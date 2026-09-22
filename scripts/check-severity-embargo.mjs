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
export const RULES = [
  // ── block tier: derivation of a NEW severity value or its parameters ──────────
  {
    tier: 'block',
    id: 'embargoed-vulnerability',
    // ADR 0014 §3: the Vulnerability Formula (and its index/score aliases) is
    // embargoed research — withhold formula, weights and derived output from
    // public surfaces. `\b` after `index` keeps ordinary prose like
    // "vulnerability indexing" out of the block tier.
    pattern: /\bvulnerability[\s_-]?(?:formula|index|score)\b/gi,
    why: 'ADR 0014: the Vulnerability Formula is embargoed research and must not appear on public surfaces.',
  },
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
  // These do not fail the build on their own. They are printed on every run so the
  // question stays visible instead of being answered once by an allowlist and
  // forgotten. A composite that merely COUNTS and AVERAGES existing severity values
  // is a presentation aggregation; one that derives a new severity value is
  // embargoed. Only the owner can say which this is, so the gate asks rather than
  // decides — and once the owner answers, the answer is recorded in
  // REVIEW_CLASSIFICATIONS below (see ADR 0012) so the same question is not asked
  // again on every build while a NEW unclassified phrase still is.
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
  // Found while recording the ADR 0012 classifications, and deliberately NOT
  // classified there: this is a different block of copy in the same component.
  // `Vulnerability Formula = (Division Avg District Severity × 0.6) + (High Risk
  // Ratio × 0.4)` prints explicit coefficients on a visitor surface. C1 withholds
  // derived-index weights from public copy, so either the coefficients are the
  // embargoed index's (a leak — withdraw them) or they are a presentation-level
  // ranking of two already-published values (keep — and label them the way the
  // composite blocks now are). That is the owner's call, not the gate's, so the
  // gate reports it on every run instead of deciding it. `formula|weighting|
  // coefficients` rather than `weights`: the block-tier `index-weights` rule
  // already owns that word, and matching it twice would report one leak as two.
  {
    tier: 'review',
    id: 'weighted-formula',
    pattern: /\b(vulnerability|exposure|risk|severity|hazard)\s+(formula|weighting|coefficients?)\b/gi,
    why:
      'Visitor copy that prints a weighted formula. If the coefficients belong to the ' +
      'embargoed derived severity index this is a leak; if they rank already-published ' +
      'values for presentation the copy must say so. Owner must classify it (ADR 0012, ' +
      '"Not decided here").',
  },
];

/**
 * Owner classifications for the review tier — the answer to `[ASK USER] 4`
 * (2026-09-19, ADR 0012), recorded as data so the gate enforces it.
 *
 * Both pre-existing entries are the same quantity in the same component:
 * `compositeScore = districtCount × avgSeverity`, where `avgSeverity` is the
 * arithmetic mean of the per-district severity the product already publishes on
 * the map, the district cards and the same table. Classified
 * **presentation-aggregation**: it re-expresses two numbers already on screen,
 * carries no weights, no calibrated threshold, no cluster membership and no
 * model internals, so it is not the embargoed derived severity index.
 *
 * The classification is "keep, LABELLED", and that is the part the gate checks:
 * `label` must appear within `LABEL_WINDOW_CHARS` of the phrase, so the number a
 * visitor reads is never separable from the statement of what it is. Deleting the
 * label — or copying the phrase into a new file without one — fails the build.
 *
 * A match with no entry here is still reported as awaiting classification, so
 * this list can never become a blanket allowlist for composite-index copy.
 */
export const REVIEW_CLASSIFICATIONS = [
  {
    file: 'frontend/src/components/NationalOverview.tsx',
    match: 'Composite Hazard Score',
    classification: 'presentation-aggregation',
    decided: '2026-09-19',
    basis:
      'districtCount × mean(per-district severity). Both factors are published on the same ' +
      'screen (the telemetry matrix prints the count and the average next to the product); ' +
      'no weights, thresholds, clusters or model internals are disclosed.',
    label: /presentation aggregation/i,
  },
  {
    file: 'frontend/src/components/NationalOverview.tsx',
    match: 'Composite Risk Index',
    classification: 'presentation-aggregation',
    decided: '2026-09-19',
    basis:
      'The same product restated as the Top-3 ranking rule (Hazard District Count × Average ' +
      'Severity Score). Ranking key over published values, not a derived severity index.',
    label: /presentation aggregation/i,
  },
];

/** How far from the classified phrase its disclosure label may sit. */
export const LABEL_WINDOW_CHARS = 1400;

/** The recorded owner decision for a (file, matched phrase) pair, if any. */
export function findClassification(relPath, matched) {
  const needle = matched.trim().toLowerCase();
  return REVIEW_CLASSIFICATIONS.find(
    (entry) =>
      entry.file === relPath &&
      (needle === entry.match.toLowerCase() ||
        needle.includes(entry.match.toLowerCase()) ||
        entry.match.toLowerCase().includes(needle)),
  ) || null;
}

/** Classifications whose phrase no longer appears anywhere (copy withdrawn). */
function staleClassifications(violations) {
  // `v.classification` is set whenever an entry matched — including the entries
  // that escalated to a block for a missing label — so a label regression is not
  // also reported as "the copy went away".
  const seen = new Set(
    violations.filter((v) => v.classification).map((v) => `${v.file}::${v.match.trim().toLowerCase()}`),
  );
  return REVIEW_CLASSIFICATIONS.filter(
    (entry) => !seen.has(`${entry.file}::${entry.match.toLowerCase()}`),
  );
}

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

/**
 * Attach the recorded owner decision to a review-tier match — or escalate it to a
 * block when the disclosure label the decision was granted on is no longer next to
 * the phrase.
 *
 * "Keep, labelled" is the classification the owner gave (ADR 0012). An unlabelled
 * composite is exactly what the embargo exists to prevent, so the label is a build
 * requirement rather than a courtesy. Pure and exported so the escalation can be
 * tested without editing public copy (__tests__/severityEmbargo.test.js).
 */
export function applyClassification(violation, text, matchIndex) {
  const decision = findClassification(violation.file, violation.match);
  if (!decision) return violation;

  const window = text.slice(
    Math.max(0, matchIndex - LABEL_WINDOW_CHARS),
    matchIndex + violation.match.length + LABEL_WINDOW_CHARS,
  );
  const annotated = {
    ...violation,
    classification: decision.classification,
    decided: decision.decided,
    basis: decision.basis,
  };

  if (!decision.label.test(window)) {
    annotated.tier = 'block';
    annotated.rule = `${violation.rule}-unlabelled`;
    annotated.why =
      `Classified '${decision.classification}' by the owner on ${decision.decided} on the ` +
      'condition that the copy states what the number is. That disclosure label is gone, ' +
      'so the phrase now reads as an unqualified derived index. Restore the label ' +
      '(or withdraw the number) — see ADR 0012.';
  }
  return annotated;
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
          const violation = {
            tier: rule.tier,
            file: rel,
            line,
            rule: rule.id,
            match: match[0],
            why: rule.why,
          };

          violations.push(applyClassification(violation, text, match.index));
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

  const classified = review.filter((v) => v.classification);
  const unclassified = review.filter((v) => !v.classification);
  const stale = staleClassifications(violations);

  if (asJson) {
    console.log(
      JSON.stringify(
        { ok: blocks.length === 0, blocked: blocks, review: unclassified, classified, stale_classifications: stale },
        null,
        2,
      ),
    );
    return blocks.length ? 1 : 0;
  }

  if (classified.length) {
    console.log(`[embargo] classified: ${classified.length} composite-index reference(s) carry a recorded owner decision (ADR 0012).`);
    for (const v of classified) {
      console.log(`  ${v.file}:${v.line}  "${v.match}"  → ${v.classification} (${v.decided}), disclosure label present`);
    }
  }

  if (stale.length) {
    console.log(`[embargo] note: ${stale.length} recorded classification(s) no longer match any copy — the phrase was`);
    for (const entry of stale) {
      console.log(`  withdrawn or reworded. Remove the entry from REVIEW_CLASSIFICATIONS: ${entry.file} "${entry.match}"`);
    }
  }

  if (unclassified.length) {
    console.warn(`[embargo] review: ${unclassified.length} reference(s) awaiting owner classification.`);
    for (const v of unclassified) {
      console.warn(`  ${v.file}:${v.line}  [${v.rule}]  "${v.match}"`);
    }
    console.warn('  → These do not fail the build. Classify each as (a) a presentation aggregation of\n' +
      '    already-published values — keep it, labelled — or (b) a derived index or its weights,\n' +
      '    in which case remove it from public copy until the research is published. Record the\n' +
      '    answer in REVIEW_CLASSIFICATIONS so the gate enforces it, and label enforcement with\n' +
      '    it (ADR 0012).\n');
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
