/**
 * The advisory tier, stamped by the pipeline.
 *
 * Before this module existed the tier existed in exactly one place — the upstream Kaggle
 * advisory CSV — and every other consumer had to invent one. `frontend/src/lib/forecasts.ts`
 * invented it from `severity_score` with a third set of thresholds, `StatusStrip` with a
 * fourth, and the numbers did not agree with each other or with the published policy. The
 * row a reader saw and the row the model produced could therefore disagree about how bad a
 * district was, which on this platform is the whole product.
 *
 * So the tier is cut once, here, in the pipeline that writes the artifact, from the blend the
 * merge already computes:
 *
 *   `final_severity`  → the fused score the manuscript cuts the tier from, when the row has it;
 *   `severity_score`  → the row's own severity, otherwise.
 *
 * **The bands are the manuscript's** (0.40 / 0.70 / 0.85), which is what "keep the manuscript"
 * means in practice: `packages/core/src/alertPolicy.ts` carries the same numbers and a test
 * asserts the two agree, so the pipeline, the web client and the mobile client cannot drift
 * apart again.
 *
 * Two things this module deliberately does NOT do:
 *
 *   1. **It does not publish an alert.** A tier on a forecast row is a statement about
 *      severity. Issuing an alert is the alert engine's decision, and
 *      `AUTO_PUBLISH_CEILING = 'WATCH'` means WARNING and SEVERE require a named duty officer
 *      whose identity is stored on the alert. `requires_review` travels with the tier so a
 *      reader (and the UI) can see which rows are still waiting for that sign-off.
 *   2. **It does not overwrite an upstream tier.** When the source CSV already carries an
 *      `advisory_tier` — the Kaggle advisory dataset does, and `advisoryMapper.js` validates it
 *      — that value wins, and the row records that it was `published` rather than derived.
 */

/** The four tiers, worst first. Mirrors `ADVISORY_TIERS` in the web client. */
export const ADVISORY_TIERS = ['SEVERE', 'WARNING', 'WATCH', 'NORMAL'];

/**
 * Severity bands, from the manuscript. Inclusive lower bounds.
 *
 * Kept in step with `SEVERITY_THRESHOLDS` in `packages/core/src/alertPolicy.ts` by
 * `__tests__/advisoryTierBands.test.js`, which parses both files.
 */
export const TIER_BANDS = {
  SEVERE: 0.85,
  WARNING: 0.7,
  WATCH: 0.4,
};

/** Above this tier a row needs a named reviewer before it can become a published alert. */
export const AUTO_PUBLISH_CEILING = 'WATCH';

/** Keys checked, in order, for the score the tier is cut from. */
export const TIER_SOURCE_FIELDS = ['final_severity', 'severity_score'];

/**
 * The tier for a severity in [0, 1]. Anything not a finite number has no tier: an absent
 * number is never rendered as NORMAL, because NORMAL is a claim that the district is quiet.
 */
export function tierForSeverity(score) {
  // Strict on purpose. `Number(null)` and `Number('')` are both 0, so the obvious
  // `Number(score)` would turn an empty CSV cell or a null column into a *NORMAL* tier — a
  // claim that the district is quiet, made from an absent value. An empty string is not a
  // number, and a missing score has no tier.
  let value = null;
  if (typeof score === 'number') value = score;
  else if (typeof score === 'string' && score.trim() !== '') value = Number(score);
  if (value === null || !Number.isFinite(value)) return null;
  if (value >= TIER_BANDS.SEVERE) return 'SEVERE';
  if (value >= TIER_BANDS.WARNING) return 'WARNING';
  if (value >= TIER_BANDS.WATCH) return 'WATCH';
  return 'NORMAL';
}

/** True when this tier may not be published without a named reviewer. */
export function requiresReview(tier) {
  return tier === 'SEVERE' || tier === 'WARNING';
}

/**
 * Cut the tier for one row.
 *
 * Returns `null` when the row carries neither score — the caller leaves the fields off rather
 * than writing a tier nothing supports.
 */
export function tierForRow(row) {
  for (const field of TIER_SOURCE_FIELDS) {
    const tier = tierForSeverity(row?.[field]);
    if (tier) return { tier, source: `derived_${field}` };
  }
  return null;
}

/** The artifact-side descriptor, so the bands travel with the data they were applied to. */
export const ADVISORY_POLICY = {
  version: 'advisory-tier/1.0.0',
  bands: { ...TIER_BANDS },
  source_fields: [...TIER_SOURCE_FIELDS],
  auto_publish_ceiling: AUTO_PUBLISH_CEILING,
  requires_review_above: AUTO_PUBLISH_CEILING,
  note:
    'Tiers are cut by the pipeline from final_severity when present, else severity_score, on the '
    + 'manuscript\u2019s bands. A tier is a severity statement, not a published alert: rows above '
    + `the ${AUTO_PUBLISH_CEILING} ceiling carry requires_review and are not an official warning.`,
};
