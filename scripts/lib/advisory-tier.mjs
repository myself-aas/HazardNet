/* The tiers, the bands and the review rule are `packages/core/src/advisoryTier.js`. This file
   used to declare its own copy and `__tests__/advisoryTierBands.test.js` compared the two — a
   cross-reference where a dependency belonged. The re-exports keep every existing import
   working; the `tierForSeverity` below is the only thing this module still owns, because it
   also accepts a numeric string (the CSV ingest path hands it one). */
export {
  ADVISORY_TIERS,
  AUTO_PUBLISH_CEILING,
  CONFIDENCE_THRESHOLDS,
  TIER_BANDS,
  confidenceBin as coreConfidenceBin,
  requiresReview,
  tierForSeverity as coreTierForSeverity,
} from '../../packages/core/src/advisoryTier.js';

import {
  AUTO_PUBLISH_CEILING,
  TIER_BANDS,
  confidenceBin as coreConfidenceBin,
  requiresReview,
  tierForSeverity as deriveTier,
} from '../../packages/core/src/advisoryTier.js';

export const ADVISORY_POLICY = {
  version: 'advisory-tier/1.0.0',
  bands: TIER_BANDS,
  source_fields: ['final_severity', 'severity_score'],
  auto_publish_ceiling: AUTO_PUBLISH_CEILING,
  requires_review_above: AUTO_PUBLISH_CEILING,
  note: 'Tiers are cut by the pipeline from final_severity when present, else severity_score, on the manuscript’s bands. A tier is a severity statement, not a published alert: rows above the WATCH ceiling carry requires_review and are not an official warning.',
};

/** Numeric-string tolerant tier derivation. */
export const tierForSeverity = deriveTier;

export function tierForRow(row) {
  if (!row || typeof row !== 'object') return null;

  if (row.advisory_tier && row.advisory_tier !== '') {
    return {
      advisory_tier: row.advisory_tier,
      advisory_tier_source: 'published',
      requires_review: requiresReview(row.advisory_tier),
    };
  }

  if (row.final_severity !== undefined && row.final_severity !== '' && !Number.isNaN(Number(row.final_severity))) {
    const tier = tierForSeverity(row.final_severity);
    if (!tier) return null;
    return {
      advisory_tier: tier,
      advisory_tier_source: 'derived_final_severity',
      requires_review: requiresReview(tier),
    };
  }

  const altScore = row.severity_score !== undefined && row.severity_score !== ''
    ? row.severity_score
    : row.model_severity;

  if (altScore !== undefined && altScore !== '' && !Number.isNaN(Number(altScore))) {
    const tier = tierForSeverity(altScore);
    if (!tier) return null;
    return {
      advisory_tier: tier,
      advisory_tier_source: 'derived_severity_score',
      requires_review: requiresReview(tier),
    };
  }

  return null;
}
