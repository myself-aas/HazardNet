/**
 * The advisory tier vocabulary: five tiers, three bands, one review rule.
 *
 * A tier is a severity statement about a district — `NORMAL`, `WATCH`, `WARNING`, `SEVERE`,
 * `EXTREME` — and three separate concerns depend on those five words:
 *
 *   · **the band that produces a tier** from a score (0.40 / 0.70 / 0.85, the manuscript's);
 *   · **the ceiling below which no human is needed** (`WATCH`);
 *   · **whether a tier needs review** (`WARNING` and above).
 *
 * Each of the three was written out more than once. The bands were declared in
 * `packages/core/src/alertPolicy.ts` *and* `scripts/lib/advisory-tier.mjs` (pinned equal by
 * `__tests__/advisoryTierBands.test.js`, a cross-reference where a dependency belonged); the
 * review rule was a function in `advisory-tier.mjs`, an array in
 * `backend/utils/dailyAdvisoryPublic.js` and a second array in `frontend/src/lib/dailyAdvisories.ts`.
 * Two of those three would have gone on agreeing with each other while disagreeing with the
 * third — which is the failure mode the alias tables had.
 *
 * `.js` with JSDoc, for the same reason as `districtRegistry.js` and `freshnessSlo.js`: the Node
 * runtimes and the pipeline scripts load `packages/core` as source with plain Node.
 */

/** The five published tiers, worst first. A reader must round-trip every one of them. */
export const ADVISORY_TIERS = Object.freeze(['EXTREME', 'SEVERE', 'WARNING', 'WATCH', 'NORMAL']);

/**
 * The severity bands that cut a tier, as a score floor per tier.
 *
 * `NORMAL` has no floor — it is what remains below `WATCH` — and **`EXTREME` has none either**,
 * deliberately: it is a publication decision a named duty officer makes, not a number a score
 * can cross. Deriving it would mean a model output could declare an emergency with no human in
 * the loop, which is the one thing the whole ceiling arrangement exists to prevent.
 */
export const TIER_BANDS = Object.freeze({
  SEVERE: 0.85,
  WARNING: 0.70,
  WATCH: 0.40,
});

/**
 * The highest tier a pipeline may publish without a named reviewer.
 *
 * The engine enforces the same ceiling as `max_auto_publish_level` in
 * `backend/alerts/policy.js`; the reader-facing derivation in `forecasts.ts` stops here too,
 * which is why a UI can never show a tier no human approved.
 */
export const AUTO_PUBLISH_CEILING = 'WATCH';

/**
 * Whether a tier requires a named duty officer's review before publication.
 *
 * One rule, four callers: the pipeline (which stamps `requires_review` onto every row), the
 * artifact builder (which re-derives it when validating), the browser (which recomputes it when
 * parsing) and the alert engine (which compares levels rather than tiers). The engine keeps its
 * own comparison because it works in *levels*, not tiers — a different vocabulary — but it reads
 * the same ceiling from here through `backend/alerts/policy.js`.
 *
 * Anything unrecognised is treated as requiring review: a tier this module has not been taught
 * must not be published automatically.
 *
 * @param {unknown} tier
 * @returns {boolean}
 */
export function requiresReview(tier) {
  if (typeof tier !== 'string') return true;
  const normalised = tier.trim().toUpperCase();
  if (!normalised) return true;
  if (normalised === 'EXTREME' || normalised === 'SEVERE' || normalised === 'WARNING') return true;
  if (normalised === 'WATCH' || normalised === 'NORMAL') return false;
  return true;
}

/**
 * The tier a score falls in — the full three-band derivation, no ceiling.
 *
 * Callers that publish or display at the *client* level must use `tierFromSeverity` in
 * `forecasts.ts` instead, which stops at `WATCH`. This one is for the pipeline and the engine,
 * which are allowed to reach `WARNING`/`SEVERE` when a reviewer has approved the row.
 *
 * `null` in, `null` out: an absent score is not `NORMAL`.
 *
 * @param {unknown} score
 * @returns {'SEVERE'|'WARNING'|'WATCH'|'NORMAL'|null}
 */
export function tierForSeverity(score) {
  if (score === null || score === undefined || score === '') return null;
  if (typeof score === 'object' || typeof score === 'boolean') return null;
  const value = Number(score);
  if (!Number.isFinite(value)) return null;
  // No `>= EXTREME` branch: see `TIER_BANDS`.
  if (value >= TIER_BANDS.SEVERE) return 'SEVERE';
  if (value >= TIER_BANDS.WARNING) return 'WARNING';
  if (value >= TIER_BANDS.WATCH) return 'WATCH';
  return 'NORMAL';
}

/**
 * The confidence bins — `Certain` / `Probable` / `Uncertain`, cut at 0.85 and 0.70.
 *
 * The same two numbers existed in `core/alertPolicy.ts` (`CONFIDENCE_THRESHOLDS`), in
 * `core/forecasts.ts` (`confidenceBin`), in the pipeline's content builder (as prose:
 * `'Certain (≥ 0.85)'`) and in the mobile severity helper. The prose variants stay where they
 * are — they are copy — but they read the thresholds from here.
 *
 * @param {unknown} confidence
 * @returns {'Certain'|'Probable'|'Uncertain'|'unknown'}
 */
export function confidenceBin(confidence) {
  if (confidence === null || confidence === undefined || confidence === '') return 'unknown';
  const value = Number(confidence);
  if (!Number.isFinite(value)) return 'unknown';
  if (value >= CONFIDENCE_THRESHOLDS.CERTAIN) return 'Certain';
  if (value >= CONFIDENCE_THRESHOLDS.PROBABLE) return 'Probable';
  return 'Uncertain';
}

/** Confidence cut points, shared by every surface that labels a confidence. */
export const CONFIDENCE_THRESHOLDS = Object.freeze({
  CERTAIN: 0.85,
  PROBABLE: 0.70,
});
