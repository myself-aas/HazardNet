/**
 * @jest-environment node
 *
 * One tier vocabulary: five words, three bands, one review rule.
 *
 * `__tests__/advisoryTierBands.test.js` already pins the *bands*. It does not pin the review
 * rule, and the review rule was the one with three declarations:
 *
 *   `scripts/lib/advisory-tier.mjs`              requiresReview(tier)              a function
 *   `backend/utils/dailyAdvisoryPublic.js`       REQUIRES_REVIEW_TIERS = [...]     an array
 *   `frontend/src/lib/dailyAdvisories.ts`        REVIEW_TIERS = [...]              an array
 *
 * Three declarations of "which tiers need a named duty officer". The arrays could agree with
 * each other and disagree with the function — and the artifact validator (array) is what decides
 * whether a published row carries `requires_review`, which is what the reader is shown.
 *
 * This suite pins the rule's owner, its answer for all five tiers, and its behaviour on inputs
 * it was never taught.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const tier = require('../packages/core/src/advisoryTier.js');

describe('the five tiers', () => {
  it('are named worst-first, and nothing else is a tier', () => {
    expect([...tier.ADVISORY_TIERS]).toEqual(['EXTREME', 'SEVERE', 'WARNING', 'WATCH', 'NORMAL']);
    // Derived from the score, only four are reachable — EXTREME is a human decision.
    expect(tier.tierForSeverity(1)).toBe('SEVERE');
    expect(tier.tierForSeverity(0.95)).toBe('SEVERE');
  });

  it('cut on inclusive lower bounds', () => {
    expect(tier.tierForSeverity(0.85)).toBe('SEVERE');
    expect(tier.tierForSeverity(0.8499)).toBe('WARNING');
    expect(tier.tierForSeverity(0.7)).toBe('WARNING');
    expect(tier.tierForSeverity(0.6999)).toBe('WATCH');
    expect(tier.tierForSeverity(0.4)).toBe('WATCH');
    expect(tier.tierForSeverity(0.3999)).toBe('NORMAL');
  });

  it('answers null for a score that is absent, not NORMAL', () => {
    // NORMAL is a claim about a district; an absent score makes no claim.
    for (const absent of [null, undefined, '', 'abc', {}, [], true, NaN]) {
      expect({ input: String(absent), tier: tier.tierForSeverity(absent) })
        .toEqual({ input: String(absent), tier: null });
    }
    expect(tier.tierForSeverity('0.5')).toBe('WATCH'); // the CSV ingest path hands it a string
  });
});

describe('the review rule', () => {
  it('needs a named reviewer at WARNING and above, and only there', () => {
    expect(tier.requiresReview('EXTREME')).toBe(true);
    expect(tier.requiresReview('SEVERE')).toBe(true);
    expect(tier.requiresReview('WARNING')).toBe(true);
    expect(tier.requiresReview('WATCH')).toBe(false);
    expect(tier.requiresReview('NORMAL')).toBe(false);
    expect(tier.requiresReview('warning')).toBe(true);   // published rows vary in case
    expect(tier.requiresReview(' Watch ')).toBe(false);
  });

  it('treats a tier it has not been taught as needing review', () => {
    // The safe direction: an unknown word must not be publishable without a human.
    for (const unknown of ['ADVISORY', '', '   ', null, undefined, 42, {}]) {
      expect({ input: String(unknown), review: tier.requiresReview(unknown) })
        .toEqual({ input: String(unknown), review: true });
    }
  });

  it('agrees with the ceiling: WATCH is publishable, WARNING is not', () => {
    expect(tier.AUTO_PUBLISH_CEILING).toBe('WATCH');
    expect(tier.requiresReview(tier.AUTO_PUBLISH_CEILING)).toBe(false);
    expect(tier.requiresReview('WARNING')).toBe(true);
  });
});

describe('the confidence bins', () => {
  it('cut at 0.85 and 0.70, with an unknown bin for an absent value', () => {
    expect(tier.confidenceBin(0.9)).toBe('Certain');
    expect(tier.confidenceBin(0.85)).toBe('Certain');
    expect(tier.confidenceBin(0.84)).toBe('Probable');
    expect(tier.confidenceBin(0.7)).toBe('Probable');
    expect(tier.confidenceBin(0.69)).toBe('Uncertain');
    expect(tier.confidenceBin(null)).toBe('unknown');
    expect(tier.confidenceBin('nonsense')).toBe('unknown');
  });
});

describe('the three callers read the owner', () => {
  it('derives the review sets from the rule rather than listing tiers', () => {
    // The artifact validator and the browser parser must answer with the same array.
    const server = require('../backend/utils/dailyAdvisoryPublic.js');
    expect(server.REQUIRES_REVIEW_TIERS).toEqual(['WARNING', 'SEVERE', 'EXTREME']);

    // …and the pipeline's helper is the same function, not a lookalike.
    const pipeline = require('../scripts/lib/advisory-tier.mjs');
    expect(pipeline.requiresReview).toBe(tier.requiresReview);
    expect(pipeline.TIER_BANDS).toBe(tier.TIER_BANDS);
    expect(pipeline.AUTO_PUBLISH_CEILING).toBe(tier.AUTO_PUBLISH_CEILING);
    expect(pipeline.tierForSeverity(0.85)).toBe(tier.tierForSeverity(0.85));
    expect(pipeline.tierForSeverity('0.4')).toBe('WATCH');
  });

  it('finds no fourth declaration of the review rule', () => {
    const patterns = [
      /REQUIRES?_REVIEW_TIERS?\s*(?::[^=]+)?=\s*\[\s*'WARNING'/,
      /REVIEW_TIERS\s*(?::[^=]+)?=\s*\[\s*'WARNING'/,
      /tier\s*===\s*'EXTREME'\s*\|\|\s*tier\s*===\s*'SEVERE'/,
    ];
    const allow = new Set([
      'packages/core/src/advisoryTier.js',
      'backend/utils/dailyAdvisoryPublic.js',   // derived from the rule; asserted above
    ]);
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', 'dist', 'build', 'coverage'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) continue;
        const rel = path.relative(ROOT, full).split(path.sep).join('/');
        if (allow.has(rel) || rel.startsWith('__tests__/') || rel.includes('/__tests__/')) continue;
        const source = fs.readFileSync(full, 'utf8');
        for (const pattern of patterns) {
          if (pattern.test(source)) offenders.push(`${rel}: declares the review rule (${pattern})`);
        }
      }
    };
    walk(ROOT);
    expect(offenders).toEqual([]);
  });
});
