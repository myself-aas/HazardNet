/**
 * The alert policy in force (PRODUCT_SPEC §1.3 / §1.6), as data.
 *
 * Everything the engine decides is decided by this object, so a threshold change
 * is a reviewable configuration change rather than a code change, and every alert
 * records the `policy_version` that produced it. Two properties matter more than
 * the numbers:
 *
 *   1. **`WARNING` needs a calibrated probability.** §1.3 defines `WARNING` as
 *      "calibrated probability ≥ warning threshold AND both evidence tracks agree".
 *      No calibration accuracy is claimed in this repository (Phase 3: the event archive
 *      is not loaded, so there is nothing to fit on), so `confidence` is still the
 *      model's confidence. `calibrated_probability_required_for_warning` defaults to
 *      `true`, which means **the engine cannot issue a `WARNING` from model
 *      evidence alone** — it can reach `WATCH`, and `SEVERE` only from an official
 *      BMD/FFWC bulletin or a duty officer's explicit approval. Flipping the flag to
 *      `false` (env `ALERT_ALLOW_UNCALIBRATED_WARNING=true`) is a deliberate,
 *      auditable decision, not a default.
 *
 *   2. **Nothing above `WATCH` is auto-published.** `max_auto_publish_level` is
 *      `WATCH`; the store refuses `autoPublish` above it, and a human must publish
 *      every `WARNING`/`SEVERE`. That closes the "uncalibrated confidence +
 *      auto-publish" project-killer at the API level, not in a convention.
 *
 * The thresholds themselves are placeholders chosen to be conservative against a
 * model whose output distribution is documented as degenerate (MODEL_CARD §6.1):
 * with `model_severity` saturating at 1.0, the severity band puts nearly every
 * district at `WATCH`. The engine reports that (see `assessBatch.saturated`)
 * instead of turning it into 64 simultaneous warnings. The owner sets the real
 * thresholds before any external alerting (docs/ops/owner-actions.md, Action 5).
 */

export const ALERT_LEVELS = ['NO_ALERT', 'WATCH', 'WARNING', 'SEVERE'];

/** Rank of a level, for comparisons. Unknown levels are -1 (never trusted). */
export function levelRank(level) {
  const index = ALERT_LEVELS.indexOf(level);
  return index;
}

export function maxLevel(a, b) {
  return levelRank(a) >= levelRank(b) ? a : b;
}

/**
 * The disclaimer every public surface must carry (PRODUCT_SPEC §1.7).
 *
 * Plain text, because SMS and Telegram cannot render the markdown emphasis the
 * spec uses. `__tests__/alerts/policy.test.js` compares this constant against the
 * spec's §1.7 block with the markdown stripped, so the two cannot drift apart.
 */
export const REQUIRED_DISCLAIMER =
  'HazardNet is a research-based decision-support tool. It is not an official warning service. ' +
  'Always follow instructions from the Bangladesh Meteorological Department, FFWC and your local ' +
  'administration. In an emergency call 999 (national emergency), 1090 (disaster response), ' +
  'or 16123 (agriculture helpline).';

export const POLICY_VERSION = 'alert-policy/1.0.0';

export const POLICY_DEFAULTS = Object.freeze({
  version: POLICY_VERSION,
  /** §1.3 WATCH: "calibrated probability ≥ watch threshold". */
  watch_probability: 0.40,
  /** §1.3 WARNING: "calibrated probability ≥ warning threshold". */
  warning_probability: 0.65,
  /**
   * The severity band that also reaches WATCH. Not in §1.3's table, which is
   * written entirely in probability terms; it exists because the shipped rows
   * carry a severity index for every district and the product needs *some*
   * relative prioritisation signal while the probability is uncalibrated. It is
   * labelled in every assessment as `severity_band`, so nobody mistakes it for the
   * calibrated rule.
   */
  watch_severity: 0.55,
  /** §1.3 WATCH: "or model/physics divergence > 0.30". */
  divergence_watch: 0.30,
  /** How close the two tracks must be to count as agreeing (|model − physics| ≤ ε). */
  agreement_epsilon: 0.10,
  /** See the module header: this is what keeps WARNING honest today. */
  calibrated_probability_required_for_warning: true,
  /** §1.6: the pipeline may publish up to this level; above it needs a human. */
  max_auto_publish_level: 'WATCH',
  /** Freshness SLO for the row that produced the assessment (PRODUCT_SPEC §2). */
  max_prediction_age_hours: 48,
  /** Carried on every assessment so no consumer has to remember to attach it. */
  disclaimer: REQUIRED_DISCLAIMER,
});

const asNumber = (value, fallback, { min = 0, max = 1 } = {}) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
};

const asBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
};

const asLevel = (value, fallback) =>
  ALERT_LEVELS.includes(String(value || '').toUpperCase())
    ? String(value).toUpperCase()
    : fallback;

/**
 * Build the policy in force, applying environment overrides.
 *
 * Every override is recorded in `overridden` so `GET /api/v1/alerts/policy` can
 * show a reader which thresholds are defaults and which were changed in the
 * deployment. An invalid value falls back to the default rather than throwing:
 * a malformed env var must not take the alerting surface down, and the
 * `overridden` list still shows the operator that their setting was ignored.
 */
export function getPolicy(env = process.env) {
  const policy = { ...POLICY_DEFAULTS, source: 'defaults', overridden: [], ignored: [] };

  const rules = [
    ['watch_probability', 'ALERT_WATCH_PROBABILITY', asNumber],
    ['warning_probability', 'ALERT_WARNING_PROBABILITY', asNumber],
    ['watch_severity', 'ALERT_WATCH_SEVERITY', asNumber],
    ['divergence_watch', 'ALERT_DIVERGENCE_WATCH', asNumber],
    ['agreement_epsilon', 'ALERT_AGREEMENT_EPSILON', asNumber],
    ['calibrated_probability_required_for_warning', 'ALERT_ALLOW_UNCALIBRATED_WARNING',
      (value, fallback) => !asBoolean(value, !fallback)],
    ['max_auto_publish_level', 'ALERT_MAX_AUTO_PUBLISH_LEVEL', asLevel],
    ['max_prediction_age_hours', 'ALERT_MAX_PREDICTION_AGE_HOURS',
      (value, fallback) => asNumber(value, fallback, { min: 1, max: 24 * 30 })],
  ];

  for (const [key, envKey, parse] of rules) {
    if (env[envKey] === undefined || env[envKey] === '') continue;
    const parsed = parse(env[envKey], POLICY_DEFAULTS[key]);
    if (parsed === POLICY_DEFAULTS[key] && String(env[envKey]) !== String(POLICY_DEFAULTS[key])) {
      policy.ignored.push({ key, env: envKey, value: String(env[envKey]) });
      continue;
    }
    policy[key] = parsed;
    policy.overridden.push({ key, env: envKey, value: parsed });
  }

  if (policy.overridden.length > 0) policy.source = 'environment';
  // An inverted pair of thresholds would make WARNING unreachable in a way nobody
  // could see from the outside; surface it instead of silently reordering.
  if (policy.warning_probability < policy.watch_probability) {
    policy.warnings = [
      `warning_probability (${policy.warning_probability}) is below watch_probability ` +
      `(${policy.watch_probability}); WARNING is unreachable at this configuration`,
    ];
  }
  return policy;
}

/** The policy as the API publishes it: human-readable, with the honest caveats. */
export function describePolicy(policy = getPolicy()) {
  return {
    version: policy.version,
    source: policy.source,
    overridden: policy.overridden,
    ignored: policy.ignored,
    warnings: policy.warnings || [],
    thresholds: {
      watch_probability: policy.watch_probability,
      warning_probability: policy.warning_probability,
      watch_severity: policy.watch_severity,
      divergence_watch: policy.divergence_watch,
      agreement_epsilon: policy.agreement_epsilon,
    },
    human_in_the_loop: {
      max_auto_publish_level: policy.max_auto_publish_level,
      requires_named_reviewer_above: policy.max_auto_publish_level,
      note:
        'PRODUCT_SPEC §1.6: the pipeline may publish at or below ' +
        `${policy.max_auto_publish_level} automatically; anything above it requires a named ` +
        'duty officer, and the reviewer identity is stored on the alert.',
    },
    calibration: {
      calibrated_probability_required_for_warning: policy.calibrated_probability_required_for_warning,
      note: policy.calibrated_probability_required_for_warning
        ? 'No calibration accuracy is claimed, so WARNING cannot be ' +
          'reached from model evidence alone: rows carry confidence_kind=' +
          'model_softmax_top_class. WATCH and official-bulletin SEVERE remain available.'
        : 'This deployment has explicitly allowed WARNING without a calibrated probability ' +
          '(ALERT_ALLOW_UNCALIBRATED_WARNING=true). That is a product decision, recorded here.',
    },
    disclaimer: REQUIRED_DISCLAIMER,
  };
}
