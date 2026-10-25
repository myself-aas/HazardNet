export const ADVISORY_TIERS = ['SEVERE', 'WARNING', 'WATCH', 'NORMAL'];

export const TIER_BANDS = {
  SEVERE: 0.85,
  WARNING: 0.7,
  WATCH: 0.4,
};

export const AUTO_PUBLISH_CEILING = 'WATCH';

export const ADVISORY_POLICY = {
  version: 'advisory-tier/1.0.0',
  bands: TIER_BANDS,
  source_fields: ['final_severity', 'severity_score'],
  auto_publish_ceiling: AUTO_PUBLISH_CEILING,
  requires_review_above: AUTO_PUBLISH_CEILING,
  note: 'Tiers are cut by the pipeline from final_severity when present, else severity_score, on the manuscript’s bands. A tier is a severity statement, not a published alert: rows above the WATCH ceiling carry requires_review and are not an official warning.',
};

export function tierForSeverity(score) {
  if (score === null || score === undefined || score === '' || typeof score === 'object') {
    return null;
  }
  const n = Number(score);
  if (Number.isNaN(n)) return null;
  if (n >= TIER_BANDS.SEVERE) return 'SEVERE';
  if (n >= TIER_BANDS.WARNING) return 'WARNING';
  if (n >= TIER_BANDS.WATCH) return 'WATCH';
  return 'NORMAL';
}

export function requiresReview(tier) {
  return tier === 'SEVERE' || tier === 'WARNING';
}

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
