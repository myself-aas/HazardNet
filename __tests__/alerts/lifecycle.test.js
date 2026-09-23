/**
 * @jest-environment node
 *
 * The §1.6 state machine: which transitions exist, which are refused, and what
 * must be true before an alert becomes PUBLISHED. These are the checks that make
 * "nothing above WATCH is auto-published" a property of the code rather than a
 * promise in a document.
 */
import {
  ALERT_STATES, PIPELINE_ACTOR, applyTransition, buildEvidenceSnapshot, canAutoPublish,
  describeTransitions, evaluateTransition, isDutyOfficer, reviewerIdentity, toPublishRecord,
} from '../../backend/alerts/lifecycle.js';
import { getPolicy } from '../../backend/alerts/policy.js';
import { assessRow } from '../../backend/alerts/assess.js';

const policy = getPolicy({});
const NOW = new Date('2026-09-17T06:00:00Z');

const assessment = (over = {}) => assessRow({
  district_id: 19,
  district_name: 'Dhaka',
  horizon: '7_days',
  hazard_type: 'Flood',
  severity_score: 0.9,
  confidence: 0.4,
  confidence_kind: 'model_softmax_top_class',
  model_severity: 0.9,
  physics_severity: 0.9,
  prediction_date: '2026-09-16',
  target_date: '2026-09-23',
  model_version: '2.1.9+model.d7b1a5b48aa6',
  dataset_version: 'ds1.0123456789abcdef',
  ...over,
}, { policy, now: NOW });

const draft = (level = 'WATCH') => ({
  id: 'alert-1',
  state: 'DRAFT',
  level,
  hazard_type: 'Flood',
  district_id: 19,
  horizon: '7_days',
  target_date: '2026-09-23',
  events: [{ type: 'created', at: NOW.toISOString() }],
});

describe('the state machine', () => {
  test('states are the five §1.6 needs', () => {
    expect(ALERT_STATES).toEqual(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'SUPERSEDED']);
  });

  test('describes every transition with its allowed source states', () => {
    const transitions = describeTransitions();
    expect(transitions.map((t) => t.id)).toEqual([
      'create', 'auto-publish', 'submit-for-review', 'approve', 'reject', 'escalate', 'supersede',
    ]);
    expect(transitions.find((t) => t.id === 'approve').from).toEqual(['PENDING_REVIEW']);
    expect(transitions.find((t) => t.id === 'reject').from).toEqual(['DRAFT', 'PENDING_REVIEW']);
    expect(transitions.find((t) => t.id === 'auto-publish').automatic).toBe(true);
  });

  test('rejects an unknown action and a missing alert', () => {
    expect(evaluateTransition({ action: 'publish-now' })).toMatchObject({ ok: false, code: 400 });
    expect(evaluateTransition({ action: 'approve', alert: null }))
      .toMatchObject({ ok: false, code: 404 });
  });

  test('refuses approve from DRAFT (review is a step, not a formality)', () => {
    const decision = evaluateTransition({
      action: 'approve', alert: draft(), actor: 'u1', target: assessment(),
      policy, evidence_snapshot: buildEvidenceSnapshot(assessment(), { now: NOW }),
    });
    expect(decision.ok).toBe(false);
    expect(decision.code).toBe(409);
    expect(decision.error).toMatch(/cannot approve an alert in state DRAFT/);
  });

  test('refuses any transition out of a terminal state', () => {
    const decision = evaluateTransition({
      action: 'submit-for-review', alert: { state: 'SUPERSEDED' }, actor: 'u1',
    });
    expect(decision.ok).toBe(false);
    expect(decision.code).toBe(409);
  });
});

describe('automatic publication ceiling (§1.6)', () => {
  test('WATCH and below are auto-publishable; WARNING and above are not', () => {
    expect(canAutoPublish({ status: 'assessed', level: 'NO_ALERT' }, policy)).toBe(true);
    expect(canAutoPublish({ status: 'assessed', level: 'WATCH' }, policy)).toBe(true);
    expect(canAutoPublish({ status: 'assessed', level: 'WARNING' }, policy)).toBe(false);
    expect(canAutoPublish({ status: 'assessed', level: 'SEVERE' }, policy)).toBe(false);
    expect(canAutoPublish({ status: 'skipped', level: 'WATCH' }, policy)).toBe(false);
  });

  test('the auto-publish transition refuses a WARNING with a §1.6 explanation', () => {
    const decision = evaluateTransition({
      action: 'auto-publish', alert: draft('WARNING'), target: assessment({
        confidence_kind: 'calibrated_probability', confidence: 0.8,
        model_severity: 0.8, physics_severity: 0.8,
      }), policy,
    });
    expect(decision.ok).toBe(false);
    expect(decision.code).toBe(422);
    expect(decision.error).toMatch(/above the auto-publish ceiling \(WATCH\)/);
  });
});

describe('review requirements', () => {
  const pending = (level = 'WARNING') => ({ ...draft(level), state: 'PENDING_REVIEW' });

  test('approval needs a named actor and an evidence snapshot', () => {
    const noActor = evaluateTransition({
      action: 'approve', alert: pending(), target: assessment(), policy,
      evidence_snapshot: buildEvidenceSnapshot(assessment(), { now: NOW }),
    });
    expect(noActor.ok).toBe(false);
    expect(noActor.error).toMatch(/named reviewer is required/);
    const noSnapshot = evaluateTransition({
      action: 'approve', alert: pending(), actor: 'u1', target: assessment(), policy,
    });
    expect(noSnapshot.ok).toBe(false);
    expect(noSnapshot.error).toMatch(/evidence snapshot is required/);
    const complete = evaluateTransition({
      action: 'approve', alert: pending(), actor: 'u1', target: assessment(), policy,
      evidence_snapshot: buildEvidenceSnapshot(assessment(), { now: NOW }),
    });
    expect(complete.ok).toBe(true);
  });

  test('rejection requires a substantive reason (§1.6 eval labels)', () => {
    expect(evaluateTransition({ action: 'reject', alert: draft(), actor: 'u1', reason: '' }).ok)
      .toBe(false);
    expect(evaluateTransition({ action: 'reject', alert: draft(), actor: 'u1', reason: 'no' }).ok)
      .toBe(false);
    const ok = evaluateTransition({
      action: 'reject', alert: draft(), actor: 'u1', reason: 'district team reports no rainfall',
    });
    expect(ok.ok).toBe(true);
  });

  test('an escalation needs a reason and only applies above the ceiling', () => {
    const above = evaluateTransition({
      action: 'escalate', alert: draft('WATCH'), target: assessment({
        confidence: 0.8, confidence_kind: 'calibrated_probability',
        model_severity: 0.8, physics_severity: 0.8,
      }), policy, reason: 'WATCH → WARNING',
    });
    expect(above.ok).toBe(true);
    expect(above.transition.to).toBe('PENDING_REVIEW');
    const noReason = evaluateTransition({
      action: 'escalate', alert: draft('WATCH'), target: assessment({
        confidence: 0.8, confidence_kind: 'calibrated_probability',
        model_severity: 0.8, physics_severity: 0.8,
      }), policy,
    });
    expect(noReason.ok).toBe(false);
    const belowCeiling = evaluateTransition({
      action: 'escalate', alert: draft('WATCH'), target: assessment(), policy, reason: 'no change',
    });
    expect(belowCeiling.ok).toBe(false);
    expect(belowCeiling.error).toMatch(/escalation is not required/);
  });

  test('a supersede must say what replaced it', () => {
    expect(evaluateTransition({ action: 'supersede', alert: draft(), reason: '' }).ok).toBe(false);
    expect(evaluateTransition({ action: 'supersede', alert: draft(), reason: 'new run' }).ok).toBe(true);
  });
});

describe('duty officer recognition', () => {
  test('roles, claims and the allowlist all count', () => {
    expect(isDutyOfficer({ id: 'u1', role: 'admin' }, {})).toBe(true);
    expect(isDutyOfficer({ id: 'u1', role: 'duty_officer' }, {})).toBe(true);
    expect(isDutyOfficer({ id: 'u1', role: 'user' }, {})).toBe(false);
    expect(isDutyOfficer({ id: 'u1', role: 'user' },
      { ALERT_DUTY_OFFICERS: 'u1, someone@example.org' })).toBe(true);
    expect(isDutyOfficer({ id: 'u2', email: 'Someone@Example.org', role: 'user' },
      { ALERT_DUTY_OFFICERS: 'someone@example.org' })).toBe(true);
    expect(isDutyOfficer({ id: 'u3', role: 'user' }, { ALERT_DUTY_OFFICERS: 'u1' })).toBe(false);
    expect(isDutyOfficer(null, { ALERT_DUTY_OFFICERS: 'u1' })).toBe(false);
  });

  test('an empty allowlist does not become an open door', () => {
    expect(isDutyOfficer({ id: 'u1', role: 'user' }, { ALERT_DUTY_OFFICERS: '' })).toBe(false);
    expect(isDutyOfficer({ id: 'u1', role: 'user' }, {})).toBe(false);
  });
});

describe('evidence snapshot and publish record (§1.6/§1.7)', () => {
  test('the snapshot freezes the assessment a reviewer decided on', () => {
    const snapshot = buildEvidenceSnapshot(assessment({ confidence: 0.55 }), { now: NOW });
    expect(snapshot.kind).toBe('evidence_snapshot/1.0.0');
    expect(snapshot.captured_at).toBe(NOW.toISOString());
    expect(snapshot.level).toBe('WATCH');
    expect(snapshot.reasons.length).toBeGreaterThan(0);
    expect(snapshot.digest_source).toContain('|WATCH|');
    expect(buildEvidenceSnapshot({ status: 'skipped' })).toBeNull();
  });

  test('a publish record is refused when any §1.6 field is missing', () => {
    const alert = assessment();
    const reviewer = reviewerIdentity({ id: 'u1', email: 'officer@example.org' });
    expect(toPublishRecord(alert, {
      reviewer, at: NOW, evidenceSnapshot: buildEvidenceSnapshot(alert, { now: NOW }),
    }).ok).toBe(true);

    expect(toPublishRecord(alert, { at: NOW, evidenceSnapshot: buildEvidenceSnapshot(alert, { now: NOW }) })
      .error).toMatch(/reviewer identity/);
    expect(toPublishRecord(alert, { reviewer, evidenceSnapshot: buildEvidenceSnapshot(alert, { now: NOW }) })
      .error).toBeUndefined();
    const noSnapshot = toPublishRecord(alert, { reviewer, at: NOW });
    expect(noSnapshot.ok).toBe(false);
    expect(noSnapshot.error).toMatch(/evidence snapshot/);
    const noVersion = toPublishRecord({ ...alert, provenance: {} }, {
      reviewer, at: NOW, evidenceSnapshot: buildEvidenceSnapshot(alert, { now: NOW }),
    });
    expect(noVersion.error).toMatch(/model version/);
    const noCutoff = toPublishRecord({ ...alert, freshness: {} }, {
      reviewer, at: NOW, evidenceSnapshot: buildEvidenceSnapshot(alert, { now: NOW }),
    });
    expect(noCutoff.error).toMatch(/data cutoff/);
  });

  test('the published record carries the whole §1.6 audit trail', () => {
    const alert = assessment();
    const snapshot = buildEvidenceSnapshot(alert, { now: NOW });
    const { record } = toPublishRecord(alert, {
      reviewer: reviewerIdentity({ id: 'u1', email: 'officer@example.org' }), at: NOW,
      evidenceSnapshot: snapshot, mode: 'human',
    });
    expect(record.reviewer.email).toBe('officer@example.org');
    expect(record.reviewer.verified_via).toBe('firebase');
    expect(record.published_at).toBe(NOW.toISOString());
    expect(record.model_version).toBe('2.1.9+model.d7b1a5b48aa6');
    expect(record.data_cutoff).toBe('2026-09-16T00:00:00.000Z');
    expect(record.evidence_snapshot).toBe(snapshot);
    expect(record.disclaimer).toMatch(/not an official warning service/);
    expect(record.mode).toBe('human');
  });
});

describe('applying a transition', () => {
  test('appends to the log and moves the state without mutating the input', () => {
    const before = draft();
    const decision = evaluateTransition({
      action: 'submit-for-review', alert: before, actor: PIPELINE_ACTOR,
    });
    const after = applyTransition(before, {
      transition: decision.transition, actor: PIPELINE_ACTOR, at: NOW.toISOString(),
      reason: 'needs review',
    });
    expect(after.state).toBe('PENDING_REVIEW');
    expect(after.events).toHaveLength(2);
    expect(after.events[1]).toMatchObject({
      type: 'transition', from: 'DRAFT', to: 'PENDING_REVIEW', actor: PIPELINE_ACTOR,
      reason: 'needs review',
    });
    expect(before.state).toBe('DRAFT');
    expect(before.events).toHaveLength(1);
  });

  test('a rejection writes an eval label with the reason', () => {
    const decision = evaluateTransition({
      action: 'reject', alert: draft('WATCH'), actor: 'u1',
      reason: 'upazila office reports no flooding',
    });
    expect(decision.ok).toBe(true);
    const after = applyTransition(draft('WATCH'), {
      transition: decision.transition, actor: 'u1', at: NOW.toISOString(),
      rejection_reason: 'upazila office reports no flooding',
      evidence_snapshot: buildEvidenceSnapshot(assessment(), { now: NOW }),
    });
    expect(after.state).toBe('REJECTED');
    expect(after.rejections[0]).toMatchObject({
      reviewer: 'u1',
      reason: 'upazila office reports no flooding',
      label: { decision: 'rejected', level: 'WATCH', hazard_type: 'Flood', district_id: 19 },
    });
  });

  test('an automatic transition is attributed to the pipeline actor', () => {
    const decision = evaluateTransition({
      action: 'auto-publish', alert: draft(), target: assessment(), policy,
    });
    const after = applyTransition(draft(), {
      transition: decision.transition, at: NOW.toISOString(),
    });
    expect(after.events[1].actor).toBe(PIPELINE_ACTOR);
  });
});
