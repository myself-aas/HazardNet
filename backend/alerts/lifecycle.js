/**
 * Alert lifecycle (PRODUCT_SPEC §1.6) — DRAFT → PENDING_REVIEW → PUBLISHED, and
 * the two ways out of it that are not publication.
 *
 *   DRAFT ──(assessment written; WATCH or below)──────────────▶ PUBLISHED
 *     │                                                          ▲
 *     └──(needs a human: any level above WATCH)──▶ PENDING_REVIEW ┤
 *                                                       │        │
 *                                                       │        └─(approve, named reviewer)
 *                                                       └──(reject, reason required)──▶ REJECTED
 *   any state ──(a newer assessment for the same district/horizon/hazard)──▶ SUPERSEDED
 *
 * The rules this module exists to enforce, and where each one comes from:
 *
 *   R1 §1.6 — the pipeline may publish a WATCH-equivalent alert on its own. That is
 *      the *only* automatic publication: `publishAssessment` refuses a level above
 *      `policy.max_auto_publish_level`.
 *   R2 §1.6 — anything above WATCH requires a named reviewer. The transition to
 *      PUBLISHED therefore requires `actor` to be a verified user id *and* the
 *      assessment to have been reviewed; there is no "approve as pipeline" path.
 *   R3 §1.6 — a rejection requires a reason, and the pair
 *      (evidence, rejection reason) is written back as an eval label.
 *   R4 §1.6 — a published alert must carry reviewer identity, timestamp, model
 *      version, data cutoff and the evidence snapshot. `toPublishRecord` will not
 *      build a record without all five; the API returns 422 rather than publishing
 *      something untraceable.
 *
 * `evaluateTransition` is pure: it returns `{ok, code, status, body}` and the route
 * decides what to do with it. That keeps the state machine testable and keeps the
 * HTTP layer boring.
 */

import { ALERT_LEVELS, levelRank, maxLevel } from './policy.js';

export const ALERT_STATES = Object.freeze(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'SUPERSEDED']);

/** States from which no further transition is possible. */
export const TERMINAL_STATES = Object.freeze(['SUPERSEDED']);

const PIPELINE_ACTOR = 'alert-pipeline';

export function isTerminal(state) {
  return TERMINAL_STATES.includes(state);
}

/** §1.6 rule 1, in one place. */
export function canAutoPublish(assessment, policy) {
  if (!assessment || assessment.status !== 'assessed') return false;
  if (!ALERT_LEVELS.includes(assessment.level)) return false;
  return levelRank(assessment.level) <= levelRank(policy.max_auto_publish_level);
}

/**
 * Is a reviewer allowed to approve *this* alert?
 *
 * Admins and duty officers may. Anyone else needs an explicit entry in
 * `ALERT_DUTY_OFFICERS` (comma-separated uids or emails, checked case-
 * insensitively) — a named list is the point of §1.6, so there is no "any
 * authenticated user may approve" fallback.
 */
export function isDutyOfficer(user, env = process.env) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  if (role === 'admin' || role === 'duty_officer' || role === 'duty-officer') return true;
  const allow = String(env.ALERT_DUTY_OFFICERS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return false;
  const identities = [user.id, user.uid, user.email]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return identities.some((identity) => allow.includes(identity));
}

/** The evidence snapshot frozen into the alert at review time (PRODUCT_SPEC §1.6). */
export function buildEvidenceSnapshot(assessment, { now = new Date() } = {}) {
  if (!assessment || assessment.status !== 'assessed') return null;
  return {
    kind: 'evidence_snapshot/1.0.0',
    captured_at: now.toISOString(),
    policy_version: assessment.policy_version,
    level: assessment.level,
    hazard_type: assessment.hazard_type,
    district_id: assessment.district_id,
    district_name: assessment.district_name,
    horizon: assessment.horizon,
    target_date: assessment.target_date,
    prediction_date: assessment.prediction_date,
    lead_time_days: assessment.lead_time_days,
    severity_score: assessment.severity_score,
    confidence: assessment.confidence,
    confidence_kind: assessment.confidence_kind,
    reasons: assessment.reasons,
    blockers: assessment.blockers,
    evidence: assessment.evidence,
    freshness: assessment.freshness,
    provenance: assessment.provenance,
    digest_source: [
      assessment.district_id, assessment.horizon, assessment.target_date,
      assessment.level, assessment.policy_version,
    ].join('|'),
  };
}

/** Reviewer identity as it is stored on the alert: id, email, and how it was verified. */
export function reviewerIdentity(user, { via = 'firebase' } = {}) {
  if (!user) return null;
  return {
    id: user.id || user.uid || null,
    email: user.email || null,
    name: user.name || user.displayName || null,
    role: user.role || 'user',
    verified_via: via,
  };
}

/**
 * Allowed transitions. `guard` runs against `{alert, target, actor, reason}` and
 * either returns `null` (allowed) or a message explaining the refusal.
 */
const TRANSITIONS = [
  {
    id: 'create',
    from: [],
    to: 'DRAFT',
    automatic: true,
    label: 'assess',
  },
  {
    id: 'auto-publish',
    from: ['DRAFT'],
    to: 'PUBLISHED',
    automatic: true,
    // R1: the pipeline may only publish at or below the auto-publish ceiling.
    guard: ({ target, policy }) => (canAutoPublish(target, policy) ? null
      : `§1.6: ${target.level} is above the auto-publish ceiling ` +
        `(${policy.max_auto_publish_level}); it requires a named duty officer`),
  },
  {
    id: 'submit-for-review',
    from: ['DRAFT', 'REJECTED'],
    to: 'PENDING_REVIEW',
    label: 'hold for review',
    // Anyone who can read the API can put an alert in front of a reviewer.
    guard: ({ actor }) => (actor ? null : 'actor is required to submit for review'),
  },
  {
    id: 'approve',
    from: ['PENDING_REVIEW'],
    to: 'PUBLISHED',
    label: 'approve',
    // R2 + R4.
    guard: ({ actor, target, evidence_snapshot: snapshot }) => {
      if (!actor) return 'a named reviewer is required (§1.6)';
      if (!snapshot) return 'an evidence snapshot is required before publication (§1.6)';
      if (!target || !target.level) return 'no assessed level to publish';
      return null;
    },
  },
  {
    id: 'reject',
    from: ['DRAFT', 'PENDING_REVIEW'],
    to: 'REJECTED',
    label: 'reject',
    // R3: a rejection without a reason is not a label, it is a dead end.
    guard: ({ actor, reason }) => {
      if (!actor) return 'a named reviewer is required to reject (§1.6)';
      if (!reason || String(reason).trim().length < 4) {
        return 'a rejection reason is required (§1.6) — it is recorded as an eval label';
      }
      return null;
    },
  },
  {
    id: 'escalate',
    // Same issue, worse assessment: the level moved above the auto-publish ceiling.
    // Critically, this pulls a *published* WATCH back for review — an automatic
    // publication that later turns out to be a WARNING may not stay live on its own.
    from: ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED'],
    to: 'PENDING_REVIEW',
    automatic: true,
    label: 'escalate for review',
    guard: ({ target, policy, reason }) => {
      if (!reason || !String(reason).trim()) return 'an escalation must record why the level moved';
      if (!target || !target.level) return 'no assessed level to escalate to';
      if (levelRank(target.level) <= levelRank(policy.max_auto_publish_level)) {
        return `${target.level} is at or below the auto-publish ceiling; escalation is not required`;
      }
      return null;
    },
  },
  {
    id: 'supersede',
    from: ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED'],
    to: 'SUPERSEDED',
    automatic: true,
    label: 'supersede',
    guard: ({ reason }) => ((reason && String(reason).trim()) ? null
      : 'a superseded alert must say what replaced it'),
  },
];

export function describeTransitions() {
  return TRANSITIONS.map(({ id, from, to, label, automatic, guard }) => ({
    id,
    from,
    to,
    label: label || id,
    automatic: Boolean(automatic),
    guarded: Boolean(guard),
  }));
}

/**
 * Decide whether a transition is legal, without performing any I/O.
 *
 * @returns {{ok: boolean, code: number, error?: string, transition?: object}}
 */
export function evaluateTransition(intent = {}) {
  const {
    action, alert = null, actor = null, reason = null, target = null,
    policy, evidence_snapshot: snapshot = null,
  } = intent;

  const transition = TRANSITIONS.find((t) => t.id === action);
  if (!transition) {
    return { ok: false, code: 400, error: `unknown action "${action}"` };
  }
  const current = action === 'create' ? null : (alert && alert.state) || null;
  if (action !== 'create') {
    if (!current) return { ok: false, code: 404, error: 'alert not found' };
    if (!transition.from.includes(current)) {
      return {
        ok: false,
        code: 409,
        error: `cannot ${action} an alert in state ${current} ` +
          `(allowed from: ${transition.from.join(', ') || 'creation only'})`,
        state: current,
      };
    }
    if (isTerminal(current)) {
      return { ok: false, code: 409, error: `alert is ${current} and cannot change`, state: current };
    }
  }
  if (transition.guard) {
    const refusal = transition.guard({ alert, actor, reason, target, policy, evidence_snapshot: snapshot });
    if (refusal) {
      const code = /required|reason|snapshot|named reviewer|ceiling/i.test(refusal) ? 422 : 409;
      return { ok: false, code, error: refusal, state: current };
    }
  }
  return { ok: true, code: 200, transition };
}

/** Append a transition event to a document's log (pure — returns a new document). */
export function applyTransition(document, { transition, actor, at, reason, rejection_reason: rejectionReason, level, extra = {} }) {
  const event = {
    type: 'transition',
    action: transition.id,
    at: at || new Date().toISOString(),
    actor: actor || (transition.automatic ? PIPELINE_ACTOR : null),
    from: document.state,
    to: transition.to,
    level: level || document.level,
    reason: reason || null,
    ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
    ...extra,
  };
  const next = {
    ...document,
    state: transition.to,
    events: [...(document.events || []), event],
  };
  if (transition.id === 'reject') {
    next.rejections = [...(document.rejections || []), {
      at: event.at,
      reviewer: event.actor,
      reason: rejectionReason || reason,
      evidence_snapshot: extra.evidence_snapshot || null,
      // The label is the point: a rejected alert is a recorded false positive,
      // ready to be joined against outcomes by the Phase 3 evaluator.
      label: {
        decision: 'rejected',
        level: event.level,
        hazard_type: document.hazard_type,
        district_id: document.district_id,
        horizon: document.horizon,
        target_date: document.target_date,
        reason: rejectionReason || reason,
      },
    }];
  }
  return next;
}

/**
 * Build the record that gets published (R4). Returns `{ok, error, record}`.
 * Every field §1.6 requires is checked here, not by the caller.
 */
export function toPublishRecord(assessment, { reviewer, at = new Date(), evidenceSnapshot, mode = 'human' } = {}) {
  const missing = [];
  if (!reviewer || !(reviewer.id || reviewer.email)) missing.push('reviewer identity');
  if (!at) missing.push('timestamp');
  if (!assessment || !assessment.provenance || !assessment.provenance.model_version) {
    missing.push('model version');
  }
  const cutoff = assessment && assessment.freshness ? assessment.freshness.data_cutoff : null;
  if (!cutoff) missing.push('data cutoff');
  if (!evidenceSnapshot) missing.push('evidence snapshot');
  if (missing.length > 0) {
    return { ok: false, error: `§1.6 requires ${missing.join(', ')} before an alert is published` };
  }
  const record = {
    id: assessment.alert_id || null,
    kind: 'published_alert/1.0.0',
    published_at: at.toISOString(),
    level: assessment.level,
    level_rank: levelRank(assessment.level),
    policy_version: assessment.policy_version,
    mode,
    reviewer,
    hazard_type: assessment.hazard_type,
    district_id: assessment.district_id,
    district_name: assessment.district_name,
    division: assessment.division,
    pcode: assessment.pcode,
    horizon: assessment.horizon,
    lead_time_days: assessment.lead_time_days,
    target_date: assessment.target_date,
    prediction_date: assessment.prediction_date,
    severity_score: assessment.severity_score,
    confidence: assessment.confidence,
    confidence_kind: assessment.confidence_kind,
    reasons: assessment.reasons,
    blockers: assessment.blockers,
    evidence: assessment.evidence,
    freshness: assessment.freshness,
    provenance: assessment.provenance,
    model_version: assessment.provenance ? assessment.provenance.model_version : null,
    dataset_version: assessment.provenance ? assessment.provenance.dataset_version : null,
    data_cutoff: cutoff,
    evidence_snapshot: evidenceSnapshot,
    disclaimer: assessment.disclaimer,
  };
  return { ok: true, record };
}

export { PIPELINE_ACTOR, maxLevel };
