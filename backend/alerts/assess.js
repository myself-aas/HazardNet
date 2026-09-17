/**
 * Alert assessment (PRODUCT_SPEC §1.3) — the pure half of the alert engine.
 *
 * Given one forecast row, produce the alert the policy in force says it deserves:
 * a level, the rule that fired, the evidence trail a reader needs to audit it, and
 * the reason it is not higher. No I/O, no clock, no store: `assessRow` is a function
 * of (row, policy, now), which is what lets the tests pin the §1.3 table exactly.
 *
 * ## The rules, and the two deliberate deviations from a naive reading
 *
 * The spec's table is written entirely in probability terms. Two things make a
 * literal implementation unsafe in this repository, so the engine handles both
 * explicitly instead of pretending otherwise:
 *
 *   - **The probability is uncalibrated.** Every row ships
 *     `confidence_kind: model_softmax_top_class`; there is no fitted map (Phase 3
 *     left that blocked on the event archive). The spec defines `WARNING` as
 *     "calibrated probability ≥ warning threshold", so by default the WARNING rule
 *     is *disabled* and reports itself as disabled. A saturated softmax must not
 *     become a warning.
 *   - **`SEVERE` is reachable without a model.** §1.3: "SEVERE: WARNING-level
 *     evidence plus duty-officer review, **or** official BMD/FFWC bulletin". An
 *     official bulletin of 10/10 therefore produces SEVERE from BMD/FFWC evidence
 *     alone — that is the intended behaviour, and it is the only path in this
 *     repository that reaches SEVERE without a human approving *this* alert.
 *
 * ## Levels, in order
 *
 *   NO_ALERT  severity below the watch band, probability below the watch
 *             threshold, both tracks agreeing and low, and no fresh bulletin.
 *   WATCH     probability ≥ watch threshold, or severity ≥ watch band, or
 *             divergence > 0.30, or a bulletin score in (0.30, 1.00).
 *   WARNING   probability ≥ warning threshold (calibrated only, by default) and
 *             both evidence tracks agree.
 *   SEVERE    WARNING-level evidence **plus** an official bulletin at maximum
 *             severity, or a duty officer's approval recorded on the alert.
 *
 * `blockers` carries the rules that matched but could not raise the level, so a
 * `WATCH` that "should" be a `WARNING` says so in its own payload.
 */

import { getPolicy, maxLevel, levelRank, ALERT_LEVELS, REQUIRED_DISCLAIMER } from './policy.js';
import { VALID_HAZARDS } from '../utils/forecastRow.js';

/** Fraction of the freshness SLO above which an assessment warns about staleness. */
const STALE_FRACTION = 0.75;

const SKIP_REASONS = Object.freeze({
  NO_HAZARD: 'row carries no hazard_type',
  NO_SEVERITY: 'row carries no severity_score',
  UNKNOWN_LEVEL: 'row.hazard_type is not one of the eight modelled classes',
});

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);

const round = (value, digits = 4) => {
  if (!isNum(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * The eight modelled classes, taken from the row contract rather than restated.
 *
 * This list **must** be the model's vocabulary — `Models/labels.json` and
 * `VALID_HAZARDS` in `backend/utils/forecastRow.js` (which the CSV ingest already
 * enforces) — because it decides which rows the engine is willing to judge. An
 * earlier revision of this file used the *display* vocabulary from
 * `frontend/src/data/*` (Storm Surge, River Erosion, Landslide, Heatwave); that is
 * a different set, and using it here silently skipped every Cold Wave, Fire, Heat
 * Wave and Severe Local Storm row — the four classes those two lists do not share.
 * `__tests__/alerts/assess.test.js` now pins this constant to `Models/labels.json`,
 * so the two cannot drift again.
 */
export const HAZARD_CLASSES = Object.freeze([...VALID_HAZARDS]);

export function isModelledHazard(hazardType) {
  return HAZARD_CLASSES.includes(hazardType);
}

/** Parse a date that is either `YYYY-MM-DD` or a full ISO timestamp. */
function parseDate(value) {
  if (!value) return null;
  const raw = String(value);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Read the §1.3 inputs out of a forecast row, staying honest about what is absent.
 *
 * `confidence` is the value the serving layer produced (`backend/utils/forecastRow.js`):
 * a softmax top-class score today, a calibrated probability once a map is fitted.
 * `confidence_kind` is what tells the two apart, and it is the *only* thing that
 * unlocks the WARNING rule — not the presence of a number.
 */
export function readEvidence(row = {}) {
  const severity = row.severity_score ?? row.severity ?? null;
  const modelSeverity = row.model_severity ?? null;
  const physicsSeverity = row.physics_severity ?? null;

  const confidence = isNum(row.confidence) ? row.confidence
    : (isNum(row.confidence_calibrated) ? row.confidence_calibrated : null);
  const confidenceKind = row.confidence_kind
    || (isNum(row.confidence_calibrated) ? 'calibrated_probability' : null);

  // Divergence: the row's own traceable value wins; otherwise the absolute gap
  // between the two tracks, but only when **both** exist (a missing physics track
  // is absence of evidence, not disagreement).
  let divergence = row.track_divergence;
  let divergenceSource = 'row.track_divergence';
  if (!isNum(divergence)) {
    divergence = isNum(modelSeverity) && isNum(physicsSeverity)
      ? Math.abs(modelSeverity - physicsSeverity)
      : null;
    divergenceSource = divergence === null ? null : 'abs(model_severity - physics_severity)';
  } else {
    divergence = Math.abs(divergence);
  }

  // Agreement, in the §1.3 sense of "both tracks agree": absolute agreement is
  // the only definition that survives a missing physics track, because
  // `physics_agreement` is computed against the *top* hazard and reads `false`
  // whenever physics scores a different class most highly — which on a degenerate
  // model is nearly always, and says nothing about "both tracks agree on danger".
  const tolerance = 1e-9;
  const agreement = isNum(modelSeverity) && isNum(physicsSeverity)
    ? Math.abs(modelSeverity - physicsSeverity) <= tolerance
      ? 'high'
      : 'low'
    : 'unknown';

  const bulletinScore = isNum(row.bulletin_score)
    ? row.bulletin_score
    : (isNum(row.hydrology_score) ? row.hydrology_score : null);

  const predictionDate = parseDate(row.prediction_date);
  const targetDate = parseDate(row.target_date);
  let leadTimeDays = null;
  if (predictionDate && targetDate) {
    const hours = (targetDate.getTime() - predictionDate.getTime()) / 36e5;
    if (hours >= 0) leadTimeDays = Math.round((hours / 24) * 10) / 10;
  }

  return {
    hazard_type: row.hazard_type ?? null,
    severity,
    model_severity: modelSeverity,
    physics_severity: physicsSeverity,
    confidence,
    confidence_kind: confidenceKind,
    track_divergence: divergence === null ? null : round(divergence),
    divergence_source: divergenceSource,
    agreement,
    bulletin_score: bulletinScore === null
      ? null
      : Math.max(0, Math.min(1, bulletinScore > 1 ? bulletinScore / 10 : bulletinScore)),
    official_source: row.official_source ?? null,
    bulletin_source: row.bulletin_source ?? null,
    prediction_date: row.prediction_date ?? null,
    target_date: row.target_date ?? null,
    lead_time_days: leadTimeDays,
    model_version: row.model_version ?? null,
    dataset_version: row.dataset_version ?? null,
    pipeline_version: row.pipeline_version ?? null,
    run_id: row.run_id ?? null,
  };
}

/** Data cutoff = when the inputs behind the row were fetched (PRODUCT_SPEC §1.6). */
function resolveCutoff(row, evidence, now) {
  const explicit = row.data_cutoff
    || (row.generated_at ? parseDate(row.generated_at) : null)
    || (row.created_at ? parseDate(row.created_at) : null)
    || parseDate(row.prediction_date);
  if (!explicit) return { at: null, source: null, age_hours: null };
  const source = row.data_cutoff ? 'row.data_cutoff'
    : row.generated_at ? 'row.generated_at'
      : row.created_at ? 'row.created_at'
        : 'row.prediction_date';
  const ageHours = now ? round((now.getTime() - explicit.getTime()) / 36e5, 2) : null;
  return {
    at: explicit.toISOString(),
    source,
    age_hours: ageHours,
  };
}

/**
 * Assess one row. Returns an alert object (never published, never stored) with:
 * level, reasons, blockers, evidence, freshness, and the policy version used.
 */
export function assessRow(row = {}, { policy = getPolicy(), now = new Date() } = {}) {
  const evidence = readEvidence(row);
  const cutoff = resolveCutoff(row, evidence, now);
  const fresh = isNum(cutoff.age_hours) ? cutoff.age_hours <= policy.max_prediction_age_hours : null;

  if (!evidence.hazard_type) {
    return {
      status: 'skipped',
      skip_reason: SKIP_REASONS.NO_HAZARD,
      level: null,
      district_id: row.district_id ?? null,
      district_name: row.district_name ?? null,
      horizon: row.horizon ?? null,
      policy_version: policy.version,
    };
  }
  if (!isModelledHazard(evidence.hazard_type)) {
    return {
      status: 'skipped',
      skip_reason: SKIP_REASONS.UNKNOWN_LEVEL,
      level: null,
      district_id: row.district_id ?? null,
      district_name: row.district_name ?? null,
      horizon: row.horizon ?? null,
      policy_version: policy.version,
    };
  }
  if (!isNum(evidence.severity)) {
    return {
      status: 'skipped',
      skip_reason: SKIP_REASONS.NO_SEVERITY,
      level: null,
      district_id: row.district_id ?? null,
      district_name: row.district_name ?? null,
      horizon: row.horizon ?? null,
      policy_version: policy.version,
    };
  }

  const calibrated = evidence.confidence_kind === 'calibrated_probability'
    && isNum(evidence.confidence);
  const probability = calibrated ? evidence.confidence : null;

  const reasons = [];
  const blockers = [];
  let level = 'NO_ALERT';

  const raise = (candidate, reason) => {
    if (levelRank(candidate) > levelRank(level)) level = candidate;
    if (!reasons.some((r) => r.rule === reason.rule)) reasons.push(reason);
  };

  // --- WATCH rules -----------------------------------------------------------
  if (isNum(probability) && probability >= policy.watch_probability) {
    raise('WATCH', {
      rule: 'watch_probability',
      detail: `calibrated probability ${round(probability)} ≥ watch threshold ${policy.watch_probability}`,
      track: 'model',
    });
  }
  if (evidence.confidence_kind === 'model_softmax_top_class'
      && isNum(evidence.confidence)
      && evidence.confidence >= policy.watch_probability) {
    raise('WATCH', {
      rule: 'watch_softmax_proxy',
      detail:
        `uncalibrated softmax ${round(evidence.confidence)} ≥ watch threshold ` +
        `${policy.watch_probability} — treated as a WATCH proxy, not as a calibrated probability`,
      track: 'model',
    });
  }
  if (evidence.severity >= policy.watch_severity) {
    raise('WATCH', {
      rule: 'watch_severity_band',
      detail: `severity index ${round(evidence.severity)} ≥ watch band ${policy.watch_severity}`,
      track: 'model',
    });
  }
  if (isNum(evidence.track_divergence) && evidence.track_divergence > policy.divergence_watch) {
    raise('WATCH', {
      rule: 'watch_divergence',
      detail:
        `model/physics divergence ${evidence.track_divergence} > ${policy.divergence_watch} ` +
        `(${evidence.divergence_source})`,
      track: 'fusion',
    });
  }
  if (isNum(evidence.bulletin_score)
      && evidence.bulletin_score > policy.divergence_watch
      && evidence.bulletin_score < 1) {
    raise('WATCH', {
      rule: 'watch_official_bulletin',
      detail:
        `official bulletin severity ${round(evidence.bulletin_score)} ` +
        `(${evidence.bulletin_source || 'BMD/FFWC'}) calls for heightened readiness`,
      track: 'official',
    });
  }

  // --- WARNING rule ----------------------------------------------------------
  const warningEvidence = isNum(probability) && probability >= policy.warning_probability;
  if (warningEvidence) {
    if (evidence.agreement === 'high') {
      raise('WARNING', {
        rule: 'warning_probability_and_agreement',
        detail:
          `calibrated probability ${round(probability)} ≥ warning threshold ` +
          `${policy.warning_probability} and both evidence tracks agree`,
        track: 'fusion',
      });
    } else {
      blockers.push({
        rule: 'warning_agreement',
        detail:
          `probability ${round(probability)} ≥ warning threshold but the tracks do not agree ` +
          `(model ${round(evidence.model_severity)}, physics ${round(evidence.physics_severity)})`,
        track: 'fusion',
      });
    }
  } else if (isNum(evidence.confidence) && evidence.confidence >= policy.warning_probability) {
    const softmaxOnly = !calibrated;
    if (policy.calibrated_probability_required_for_warning && softmaxOnly) {
      blockers.push({
        rule: 'warning_requires_calibration',
        detail:
          `score ${round(evidence.confidence)} ≥ warning threshold ${policy.warning_probability} ` +
          'but confidence_kind is ' + (evidence.confidence_kind || 'absent') +
          ' and no calibration map is fitted (docs/mlops/CALIBRATION.md)',
        track: 'model',
      });
    } else if (evidence.agreement === 'high') {
      // Only reachable when the deployment has explicitly lifted the calibration
      // requirement (ALERT_ALLOW_UNCALIBRATED_WARNING) — the blocker above is the
      // default answer, and `warnings` on the policy records that it was lifted.
      raise('WARNING', {
        rule: 'warning_uncalibrated_override',
        detail:
          `score ${round(evidence.confidence)} ≥ warning threshold and both tracks agree, ` +
          'with the calibration requirement lifted by configuration',
        track: 'fusion',
      });
    } else {
      blockers.push({
        rule: 'warning_agreement',
        detail:
          `score ${round(evidence.confidence)} ≥ warning threshold but the evidence tracks do ` +
          `not agree (agreement=${evidence.agreement})`,
        track: 'fusion',
      });
    }
  }

  // --- SEVERE ---------------------------------------------------------------
  const severeFromOfficial = isNum(evidence.bulletin_score) && evidence.bulletin_score >= 1;
  const warningReached = levelRank(level) >= levelRank('WARNING');
  const dutyOfficerApproval = row.duty_officer_approval === true
    || row.approved_by_duty_officer === true
    || row.reviewed_by_duty_officer === true;
  if (severeFromOfficial) {
    raise('SEVERE', {
      rule: 'severe_official_bulletin',
      detail:
        `official bulletin (${evidence.bulletin_source || 'BMD/FFWC'}) is at maximum severity ` +
        '— §1.3 SEVERE via official source',
      track: 'official',
    });
  } else if (warningReached && dutyOfficerApproval) {
    raise('SEVERE', {
      rule: 'severe_duty_officer_review',
      detail:
        `WARNING-level evidence reviewed by a duty officer ` +
        `(${row.reviewed_by || row.reviewer || 'unnamed'}) — §1.3 SEVERE`,
      track: 'human',
    });
  } else if (warningReached) {
    blockers.push({
      rule: 'severe_requires_review_or_official',
      detail:
        'WATCH/WARNING evidence without duty-officer review or an official bulletin at ' +
        'maximum severity; SEVERE is not reachable automatically',
      track: 'human',
    });
  }

  // --- presentation ----------------------------------------------------------
  const bandFor = (value, fallback) => {
    if (!isNum(value)) return fallback;
    if (value >= policy.warning_probability) return 'high';
    if (value >= policy.watch_probability) return 'elevated';
    return 'low';
  };

  const freshness = {
    prediction_date: evidence.prediction_date,
    data_cutoff: cutoff.at,
    data_cutoff_source: cutoff.source,
    age_hours: cutoff.age_hours,
    slo_hours: policy.max_prediction_age_hours,
    within_slo: fresh,
    stale_soon: isNum(cutoff.age_hours) && fresh === true
      ? cutoff.age_hours >= policy.max_prediction_age_hours * STALE_FRACTION
      : false,
  };

  const evidenceTrail = {
    model: {
      hazard_type: evidence.hazard_type,
      severity: round(evidence.severity),
      model_severity: round(evidence.model_severity),
      confidence: round(evidence.confidence),
      confidence_kind: evidence.confidence_kind,
      confidence_published: calibrated
        ? 'calibrated_probability'
        : 'uncalibrated_model_softmax',
      band: bandFor(evidence.confidence, 'unavailable'),
    },
    physics: {
      physics_severity: round(evidence.physics_severity),
      physics_agreement: evidence.agreement,
      divergence: evidence.track_divergence,
      divergence_source: evidence.divergence_source,
      note: evidence.agreement === 'unknown'
        ? 'no independent physics score on this row; §1.3 agreement cannot be tested'
        : null,
    },
    official: {
      bulletin_score: evidence.bulletin_score,
      source: evidence.bulletin_source || evidence.official_source || null,
    },
    line: [
      `${row.district_name || row.district_id || 'unknown district'} · ` +
      `${evidence.hazard_type} · ${row.horizon || 'unknown horizon'}`,
      isNum(evidence.lead_time_days)
        ? `lead time ${evidence.lead_time_days} d (target ${evidence.target_date})`
        : 'lead time unknown',
      calibrated
        ? `calibrated probability ${round(probability)}`
        : `uncalibrated score ${round(evidence.confidence)} (${evidence.confidence_kind || 'no kind stated'})`,
      isNum(evidence.physics_severity)
        ? `independent physics severity ${round(evidence.physics_severity)} ` +
          `(divergence ${evidence.track_divergence})`
        : 'no independent physics score',
    ],
  };

  const requiresReview = levelRank(level) > levelRank(policy.max_auto_publish_level);

  return {
    status: 'assessed',
    kind: 'alert_assessment',
    policy_version: policy.version,
    level,
    level_rank: levelRank(level),
    district_id: row.district_id ?? null,
    district_name: row.district_name ?? null,
    division: row.division ?? row.division_name ?? null,
    pcode: row.pcode ?? row.adm2_pcode ?? null,
    horizon: row.horizon ?? null,
    hazard_type: evidence.hazard_type,
    target_date: evidence.target_date,
    prediction_date: evidence.prediction_date,
    lead_time_days: evidence.lead_time_days,
    severity_score: round(evidence.severity),
    confidence: round(evidence.confidence),
    confidence_kind: evidence.confidence_kind || null,
    reasons,
    blockers,
    evidence: evidenceTrail,
    freshness,
    provenance: {
      model_version: evidence.model_version,
      dataset_version: evidence.dataset_version,
      pipeline_version: evidence.pipeline_version,
      run_id: evidence.run_id,
    },
    auto_publishable: !requiresReview,
    requires_human_review: requiresReview,
    review_rule: requiresReview
      ? `§1.6: levels above ${policy.max_auto_publish_level} require a named duty officer`
      : `§1.6: ${level} may be published automatically`,
    disclaimer: policy.disclaimer || REQUIRED_DISCLAIMER,
  };
}

/**
 * Assess a batch, in the order of `DATA_CONTRACT.alerts.sort_order` (level first,
 * then severity, then district) and return the counts the pipeline logs.
 */
export function assessBatch(rows = [], options = {}) {
  const policy = options.policy || getPolicy();
  const now = options.now || new Date();
  const alerts = [];
  const skipped = [];
  const counts = Object.fromEntries(ALERT_LEVELS.map((level) => [level, 0]));
  const byHazard = {};
  let saturated = 0;
  let uncalibrated = 0;

  for (const row of rows) {
    const assessment = assessRow(row, { policy, now });
    if (assessment.status === 'skipped') {
      skipped.push({ reason: assessment.skip_reason, district_id: assessment.district_id });
      continue;
    }
    counts[assessment.level] += 1;
    byHazard[assessment.hazard_type] = (byHazard[assessment.hazard_type] || 0) + 1;
    if (assessment.confidence_kind === 'model_softmax_top_class') uncalibrated += 1;
    if (isNum(assessment.severity_score) && assessment.severity_score >= 0.999) saturated += 1;
    alerts.push(assessment);
  }

  alerts.sort((a, b) => {
    if (levelRank(b.level) !== levelRank(a.level)) return levelRank(b.level) - levelRank(a.level);
    if ((b.severity_score ?? 0) !== (a.severity_score ?? 0)) {
      return (b.severity_score ?? 0) - (a.severity_score ?? 0);
    }
    return String(a.district_name || '').localeCompare(String(b.district_name || ''));
  });

  return {
    kind: 'alert_batch',
    policy_version: policy.version,
    generated_at: now.toISOString(),
    rows_total: rows.length,
    assessed: alerts.length,
    skipped,
    counts: { ...counts, skipped: skipped.length },
    by_hazard: byHazard,
    saturation: {
      severity_at_max: saturated,
      uncalibrated_scores: uncalibrated,
      note: alerts.length > 0 && saturated / alerts.length >= 0.25
        ? 'more than a quarter of rows sit at the maximum severity — the model output ' +
          'distribution is degenerate (MODEL_CARD §6.1); level counts below prioritise, ' +
          'they do not discriminate'
        : null,
    },
    alerts,
  };
}

/** Convenience for the API: is this level publishable without a human? */
export function isAutoPublishable(level, policy = getPolicy()) {
  if (!ALERT_LEVELS.includes(level)) return false;
  return levelRank(level) <= levelRank(policy.max_auto_publish_level);
}

export { SKIP_REASONS, maxLevel, levelRank };
