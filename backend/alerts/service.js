/**
 * Alert service — the orchestration layer behind `/api/v1/alerts` and the
 * `daily_forecast` / `alerts` workflow step.
 *
 * Composition, top to bottom:
 *
 *   forecastStore ──▶ assessBatch (§1.3) ──▶ one alert document per
 *   (district, horizon, target_date, hazard) ──▶ DRAFT ──▶ auto-publish (≤ WATCH)
 *                                                   └──▶ PENDING_REVIEW (> WATCH)
 *   reviewAlert (this module) ──▶ PUBLISHED / REJECTED, with §1.6 fields enforced
 *   notifyAlert (./notify) ──▶ SMS/Telegram to matching subscribers
 *
 * Three behaviours are deliberate and worth stating where they can be reviewed:
 *
 *   - **Re-running the engine is idempotent per (key, prediction_date).** A cron
 *     that fires twice with the same forecast does not create a second alert; it
 *     reports `unchanged`. A *new* forecast for the same key supersedes the old
 *     document (never deletes it) so the review history survives.
 *   - **`NO_ALERT` assessments are stored, not published.** The record of "we
 *     looked and saw nothing" is what makes a false-alarm rate computable later;
 *     it stays in DRAFT.
 *   - **Auto-publication has its own window.** §1.3 sets a 2×/day cadence; the
 *     engine additionally refuses to auto-publish the same key more than once per
 *     `ALERT_AUTO_PUBLISH_MINUTES` (default 720) so a manual re-run cannot spam a
 *     subscriber list. Held alerts stay DRAFT and are reported as `held`.
 */

import { getForecastStore } from '../forecastStore.js';
import { getPolicy } from './policy.js';
import { assessBatch, assessRow, isAutoPublishable } from './assess.js';
import {
  alertFromDocument, alertIdFor, alertKeyFor, getAlertStore, resetAlertStore, ALERT_DOC_VERSION,
} from './store.js';
import {
  applyTransition, buildEvidenceSnapshot, canAutoPublish, evaluateTransition,
  isDutyOfficer, reviewerIdentity, toPublishRecord, PIPELINE_ACTOR,
} from './lifecycle.js';

export { alertFromDocument, alertIdFor, alertKeyFor, getAlertStore, resetAlertStore };

/** Horizon list is the single source of truth from the row contract. */
const HORIZONS = ['7_days', '15_days'];
const META_DOC_ID = '_meta';

const minutes = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/**
 * Notification must never hold the engine open. The alert records are already
 * written by the time this runs, so a slow Firestore/subscription lookup or an
 * unreachable SMS gateway is reported as a timed-out notification leg — not as a
 * failed run, and not as a request that hangs until a proxy kills it.
 */
const notifyTimeoutMs = (env) => (Number(env.ALERT_NOTIFY_TIMEOUT_MS) > 0
  ? Number(env.ALERT_NOTIFY_TIMEOUT_MS) : 10000);

function withNotifyTimeout(promise, env = process.env) {
  const ms = notifyTimeoutMs(env);
  return Promise.race([
    Promise.resolve(promise).catch((error) => ({
      error: `notification failed: ${error.message}`, sent: 0, failed: 0,
    })),
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve({
        timed_out: true,
        sent: 0,
        failed: 0,
        error: `notification leg exceeded ${ms} ms and was abandoned; the alerts are stored`,
      }), ms);
      timer.unref?.();
    }),
  ]);
}

const autoPublishEnabled = (env) => !/^(0|false|no|off)$/i.test(String(env.ALERT_AUTO_PUBLISH ?? 'true'));

/** The alert document stored for one assessment (no events yet). */
export function buildAlertDocument(assessment, { policy, now = new Date() } = {}) {
  const id = alertIdFor(assessment);
  const at = now.toISOString();
  return {
    id,
    alert_key: alertKeyFor(assessment),
    doc_version: ALERT_DOC_VERSION,
    created_at: at,
    updated_at: at,
    state: 'DRAFT',
    level: assessment.level,
    level_rank: assessment.level_rank,
    district_id: assessment.district_id,
    district_name: assessment.district_name,
    division: assessment.division,
    pcode: assessment.pcode,
    horizon: assessment.horizon,
    hazard_type: assessment.hazard_type,
    target_date: assessment.target_date,
    prediction_date: assessment.prediction_date,
    severity_score: assessment.severity_score,
    confidence: assessment.confidence,
    confidence_kind: assessment.confidence_kind,
    policy_version: assessment.policy_version,
    reasons: assessment.reasons,
    blockers: assessment.blockers,
    evidence: assessment.evidence,
    freshness: assessment.freshness,
    provenance: assessment.provenance,
    requires_human_review: assessment.requires_human_review,
    auto_publishable: assessment.auto_publishable,
    // Kept so a reviewer (and the evidence card) can re-render the exact
    // assessment that produced the alert, months later.
    assessment: {
      level: assessment.level,
      level_rank: assessment.level_rank,
      hazard_type: assessment.hazard_type,
      district_id: assessment.district_id,
      district_name: assessment.district_name,
      division: assessment.division,
      pcode: assessment.pcode,
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
      policy_version: assessment.policy_version,
      requires_human_review: assessment.requires_human_review,
      auto_publishable: assessment.auto_publishable,
      review_rule: assessment.review_rule,
      disclaimer: assessment.disclaimer,
    },
    disclaimer: assessment.disclaimer,
    rejections: [],
    events: [{
      type: 'created',
      action: 'create',
      at,
      actor: PIPELINE_ACTOR,
      from: null,
      to: 'DRAFT',
      level: assessment.level,
      reason: 'assessed from the latest forecast rows',
      policy_version: assessment.policy_version,
    }],
  };
}

/** Persist one assessment, honouring the keyset/state rules above. */
export async function persistAssessment(assessment, {
  store = getAlertStore(), policy = getPolicy(), now = new Date(), autoPublish = true,
  lastAutoPublishAt = null,
} = {}) {
  const id = alertIdFor(assessment);
  const key = alertKeyFor(assessment);
  const existingRaw = await store.getDocument(id);
  const existing = existingRaw ? alertFromDocument(existingRaw) : null;

  // Same issue, same level: nothing changed. Re-running the engine must not create
  // a second alert or a second review request.
  if (existing && existing.level === assessment.level && existing.state !== 'SUPERSEDED') {
    return { action: 'unchanged', id, state: existing.state, level: existing.level };
  }

  // Same issue, different level: update the record in place and — if the new level
  // is above the auto-publish ceiling — pull it back for review. The history is
  // kept; nothing is deleted.
  if (existing && existing.state !== 'SUPERSEDED') {
    const refreshed = {
      ...existingRaw,
      level: assessment.level,
      level_rank: assessment.level_rank,
      severity_score: assessment.severity_score,
      confidence: assessment.confidence,
      confidence_kind: assessment.confidence_kind,
      reasons: assessment.reasons,
      blockers: assessment.blockers,
      evidence: assessment.evidence,
      freshness: assessment.freshness,
      provenance: assessment.provenance,
      requires_human_review: assessment.requires_human_review,
      auto_publishable: assessment.auto_publishable,
      assessment: buildAlertDocument(assessment, { policy, now }).assessment,
      disclaimer: assessment.disclaimer,
      updated_at: now.toISOString(),
    };
    refreshed.events = [...(existingRaw.events || []), {
      type: 'event',
      action: 'reassessed',
      at: now.toISOString(),
      actor: PIPELINE_ACTOR,
      from: existing.state,
      to: existing.state,
      previous_level: existing.level,
      level: assessment.level,
      reason: `re-scored on the same issue: ${existing.level} → ${assessment.level}`,
    }];
    const escalation = assessment.requires_human_review
      ? evaluateTransition({
        action: 'escalate', alert: existing, target: assessment, policy,
        reason: `${assessment.level} now exceeds the auto-publish ceiling ` +
          `(${policy.max_auto_publish_level})`,
      })
      : { ok: false };
    if (escalation.ok) {
      const escalated = applyTransition(refreshed, {
        transition: escalation.transition,
        at: now.toISOString(),
        reason: `${existing.level} → ${assessment.level}: §1.6 requires a named duty officer`,
        level: assessment.level,
      });
      escalated.updated_at = now.toISOString();
      await store.putDocument(escalated);
      return { action: 'escalated-for-review', id, state: escalated.state, level: assessment.level };
    }
    await store.putDocument(refreshed);
    return { action: 'reassessed', id, state: refreshed.state, level: assessment.level };
  }

  // A newer issue for the same key: the previous one is superseded, never deleted.
  let superseded = null;
  if (typeof store.getLatestDocumentForAlertKey === 'function') {
    const previousRaw = await store.getLatestDocumentForAlertKey(key);
    if (previousRaw && previousRaw.id !== id && previousRaw.state !== 'SUPERSEDED') {
      const previous = alertFromDocument(previousRaw);
      const transition = evaluateTransition({
        action: 'supersede', alert: previous,
        reason: `replaced by the ${assessment.prediction_date} issue of the same alert`,
      });
      if (transition.ok) {
        const next = applyTransition(previousRaw, {
          transition: transition.transition,
          reason: `replaced by the ${assessment.prediction_date} issue of the same alert`,
          level: previous.level,
          at: now.toISOString(),
        });
        next.updated_at = now.toISOString();
        await store.putDocument(next);
        superseded = previousRaw.id;
      }
    }
  }

  let document = buildAlertDocument(assessment, { policy, now });
  let action = superseded ? 'superseded-and-created' : 'created';

  // §1.6: WATCH-equivalent alerts may be published automatically; everything else
  // waits for a named duty officer.
  const eligible = autoPublish && canAutoPublish(assessment, policy) && assessment.level !== 'NO_ALERT';
  if (eligible) {
    const windowMinutes = minutes(process.env.ALERT_AUTO_PUBLISH_MINUTES, 720);
    const lastAt = lastAutoPublishAt ? new Date(lastAutoPublishAt).getTime() : null;
    const sinceLast = lastAt === null ? Infinity : (now.getTime() - lastAt) / 60000;
    if (sinceLast >= windowMinutes) {
      const snapshot = buildEvidenceSnapshot(assessment, { now });
      const record = toPublishRecord(assessment, {
        reviewer: { id: PIPELINE_ACTOR, email: null, name: 'alert pipeline', role: 'pipeline' },
        at: now, evidenceSnapshot: snapshot, mode: 'auto',
      });
      if (!record.ok) {
        // Eligible for automatic publication, but §1.6 requires fields the row does
        // not carry (typically a model version from a pre-Phase-2 snapshot). Say so
        // on the record instead of quietly leaving an unexplained DRAFT.
        document.events = [...document.events, {
          type: 'event',
          action: 'publication_blocked',
          at: now.toISOString(),
          actor: PIPELINE_ACTOR,
          from: 'DRAFT',
          to: 'DRAFT',
          level: assessment.level,
          reason: record.error,
        }];
        document.publication_blocked_reason = record.error;
        action = `${action}-publication-blocked`;
      } else {
        const publishTransition = evaluateTransition({
          action: 'auto-publish', alert: alertFromDocument(document), target: assessment, policy,
        });
        if (publishTransition.ok) {
          document = applyTransition(document, {
            transition: publishTransition.transition,
            at: now.toISOString(),
            level: assessment.level,
            reason: `§1.6 auto-publication at ${assessment.level}`,
            extra: {
              model_version: assessment.provenance.model_version,
              dataset_version: assessment.provenance.dataset_version,
              data_cutoff: assessment.freshness.data_cutoff,
              evidence_snapshot: snapshot,
              reviewer_identity: null,
              mode: 'auto',
            },
          });
          action = action === 'created' ? 'created-and-published' : `${action}-published`;
        }
      }
    } else {
      action = `${action}-held-for-window`;
    }
  } else if (assessment.requires_human_review) {
    const submit = evaluateTransition({
      action: 'submit-for-review', alert: alertFromDocument(document), actor: PIPELINE_ACTOR,
    });
    if (submit.ok) {
      document = applyTransition(document, {
        transition: submit.transition,
        at: now.toISOString(),
        actor: PIPELINE_ACTOR,
        level: assessment.level,
        reason: `${assessment.level} is above the auto-publish ceiling ` +
          `(${policy.max_auto_publish_level}) — §1.6 requires a named duty officer`,
      });
      action = `${action}-pending-review`;
    }
  }

  document.updated_at = now.toISOString();
  await store.putDocument(document);
  return {
    action,
    id,
    state: document.state,
    level: document.level,
    ...(document.publication_blocked_reason
      ? { publication_blocked_reason: document.publication_blocked_reason } : {}),
  };
}

/** Read the engine's own bookkeeping (last run / last auto-publication). */
export async function getAlertRunState({ store = getAlertStore() } = {}) {
  const meta = await store.getDocument(META_DOC_ID);
  return meta || { id: META_DOC_ID, last_run_at: null, last_auto_publish_at: null };
}

export async function setAlertRunState(patch, { store = getAlertStore(), now = new Date() } = {}) {
  const current = await getAlertRunState({ store });
  const next = { ...current, ...patch, id: META_DOC_ID, updated_at: now.toISOString() };
  await store.putDocument(next);
  return next;
}

/**
 * Run the engine over the latest forecast rows and persist the results.
 *
 * @returns an object with the assessment batch, persisted counts, and the
 *          notification summaries for anything auto-published.
 */
export async function runAlertEngine({
  forecastStore = getForecastStore(), store = getAlertStore(), policy = getPolicy(),
  now = new Date(), env = process.env, horizons = HORIZONS, rows = null,
  subscribers, fetchImpl = fetch, notify = null,
} = {}) {
  const collected = rows || await collectForecastRows({ forecastStore, horizons });
  const batch = assessBatch(collected, { policy, now });

  const runState = await getAlertRunState({ store });
  const autoPublish = autoPublishEnabled(env);
  const persisted = {
    created: 0, unchanged: 0, superseded: 0, published: 0, pending_review: 0,
    held: 0, blocked: 0, blocked_reasons: {}, skipped: 0, errors: [],
  };
  const publishable = [];

  for (const assessment of batch.alerts) {
    try {
      const result = await persistAssessment(assessment, {
        store, policy, now, autoPublish,
        lastAutoPublishAt: runState.last_auto_publish_at,
      });
      if (result.action === 'unchanged') persisted.unchanged += 1;
      else persisted.created += 1;
      if (result.action.includes('superseded')) persisted.superseded += 1;
      if (result.state === 'PUBLISHED') {
        persisted.published += 1;
        publishable.push({ ...assessment, id: result.id, state: 'PUBLISHED' });
      } else if (result.state === 'PENDING_REVIEW') persisted.pending_review += 1;
      else if (result.action.includes('held')) persisted.held += 1;
      if (result.action.includes('publication-blocked')) {
        persisted.blocked += 1;
        const reason = result.publication_blocked_reason || 'publication requirements not met';
        persisted.blocked_reasons[reason] = (persisted.blocked_reasons[reason] || 0) + 1;
      }
    } catch (error) {
      persisted.errors.push({ district_id: assessment.district_id, error: error.message });
    }
  }

  const notifications = [];
  if (notify && publishable.length > 0) {
    for (const alert of publishable) {
      notifications.push(await withNotifyTimeout(
        notify(alert, { subscribers, fetchImpl, env, now }), env,
      ));
    }
  }

  const nextRunState = await setAlertRunState({
    last_run_at: now.toISOString(),
    ...(persisted.published > 0 ? { last_auto_publish_at: now.toISOString() } : {}),
    last_counts: batch.counts,
    last_policy_version: policy.version,
  }, { store, now });

  return {
    ok: true,
    ran_at: now.toISOString(),
    policy_version: policy.version,
    auto_publish_enabled: autoPublish,
    max_auto_publish_level: policy.max_auto_publish_level,
    horizons,
    rows: collected.length,
    batch,
    persisted,
    // The rows this run actually published, in the same shape the snapshot builder
    // consumes. `batch.alerts` cannot serve that purpose: those are the pre-persistence
    // assessments (state DRAFT until persisted), so a consumer filtering them for
    // PUBLISHED would find nothing even on a run that published alerts. The run report
    // is the only place that knows the post-persistence state, so it carries it.
    published_alerts: publishable,
    notifications,
    run_state: {
      last_run_at: nextRunState.last_run_at,
      last_auto_publish_at: nextRunState.last_auto_publish_at,
      auto_publish_window_minutes: minutes(env.ALERT_AUTO_PUBLISH_MINUTES, 720),
    },
  };
}

/** Flatten the latest rows across horizons; a store failure surfaces as an error. */
export async function collectForecastRows({ forecastStore = getForecastStore(), horizons = HORIZONS } = {}) {
  const rows = [];
  for (const horizon of horizons) {
    const horizonRows = await forecastStore.getLatestForecastsByHorizon(horizon);
    for (const row of horizonRows || []) rows.push({ ...row, horizon: row.horizon || horizon });
  }
  return rows;
}

/** Assess rows without persisting anything (dry run / preview). Synchronous by
 * design: the route serialises the result straight to JSON, and a promise would
 * serialise to `{}` — the kind of bug that only shows up in production. */
export function previewAssessments({ rows, policy = getPolicy(), now = new Date() } = {}) {
  return assessBatch(rows || [], { policy, now });
}

export { assessBatch, assessRow, isAutoPublishable };

/**
 * The §1.6 human-in-the-loop entry point: approve, reject, submit or supersede.
 *
 * @param {object} options
 * @param {string} options.id        alert document id
 * @param {string} options.action    'approve' | 'reject' | 'submit-for-review' | 'supersede'
 * @param {object} options.user      authenticated caller ({id, email, role}) — required
 * @param {string} [options.reason]  required to reject (recorded as an eval label)
 * @param {string} [options.authVia] how the caller was authenticated: 'firebase' | 'api-key'
 */
export async function reviewAlert({
  id, action, user, reason = null, store = getAlertStore(), policy = getPolicy(),
  now = new Date(), env = process.env, authVia = 'firebase', notify = null,
  subscribers, fetchImpl = fetch,
} = {}) {
  if (!id) return { ok: false, code: 400, error: 'alert id is required' };
  const raw = await store.getDocument(id);
  if (!raw) return { ok: false, code: 404, error: `alert ${id} not found` };
  const alert = alertFromDocument(raw);

  const actorIdentity = user ? reviewerIdentity(user, { via: authVia }) : null;
  const actor = actorIdentity ? (actorIdentity.id || actorIdentity.email) : null;

  if (action === 'approve' || action === 'reject') {
    if (!actor) {
      return {
        ok: false,
        code: 401,
        error: `a named reviewer is required to ${action} an alert (§1.6)`,
      };
    }
    // A rejection is also a decision about the public record — it may not be taken
    // by a passer-by with an account, only by a duty officer (or the pipeline key
    // acting for one).
    if (!isDutyOfficer(user, env)) {
      return {
        ok: false,
        code: 403,
        error: `only a duty officer may ${action} an alert (§1.6): set ALERT_DUTY_OFFICERS ` +
          'or give the reviewer an admin/duty_officer role or claim',
      };
    }
  }

  const assessment = raw.assessment ? { ...raw.assessment, alert_id: id, status: 'assessed' } : null;
  const snapshot = action === 'approve' && assessment
    ? buildEvidenceSnapshot(assessment, { now }) : null;

  const decision = evaluateTransition({
    action, alert, actor, reason, target: assessment, policy, evidence_snapshot: snapshot,
  });
  if (!decision.ok) {
    return { ok: false, code: decision.code, error: decision.error, state: alert.state };
  }

  // §1.6 requires reviewer identity, timestamp, model version, data cutoff and the
  // evidence snapshot on a published alert. Refuse here rather than store a gap.
  let publishRecord = null;
  if (action === 'approve') {
    const built = toPublishRecord(assessment, {
      reviewer: actorIdentity, at: now, evidenceSnapshot: snapshot, mode: 'human',
    });
    if (!built.ok) return { ok: false, code: 422, error: built.error, state: alert.state };
    publishRecord = built.record;
  }

  const next = applyTransition(raw, {
    transition: decision.transition,
    actor,
    at: now.toISOString(),
    reason: reason || (action === 'approve' ? 'reviewed and approved by a duty officer' : null),
    rejection_reason: action === 'reject' ? reason : null,
    level: action === 'reject' ? alert.level : (assessment ? assessment.level : alert.level),
    extra: action === 'approve'
      ? {
        evidence_snapshot: snapshot,
        reviewer_identity: actorIdentity,
        model_version: assessment.provenance ? assessment.provenance.model_version : null,
        dataset_version: assessment.provenance ? assessment.provenance.dataset_version : null,
        data_cutoff: assessment.freshness ? assessment.freshness.data_cutoff : null,
        policy_version: policy.version,
        publish_record: publishRecord,
      }
      : (action === 'reject' ? { evidence_snapshot: snapshot } : {}),
  });
  next.updated_at = now.toISOString();
  if (action === 'reject') next.rejected_at = now.toISOString();
  if (action === 'approve') next.published_at = now.toISOString();
  await store.putDocument(next);

  const updated = alertFromDocument(next);
  const result = {
    ok: true,
    code: 200,
    action,
    actor: actorIdentity,
    state: updated.state,
    level: updated.level,
    alert: updated,
    published: action === 'approve' ? publishRecord : null,
  };

  if (notify && updated.state === 'PUBLISHED') {
    result.notification = await withNotifyTimeout(
      notify(updated, { subscribers, fetchImpl, env, now }), env,
    );
  }
  return result;
}

/**
 * List alerts for the API: newest first, filtered, meta document excluded.
 *
 * `maxAgeHours` filters to alerts whose data cutoff is inside the freshness SLO.
 * Alerts are keyed per (district, horizon, hazard, target_date), so an unfiltered
 * list is a history, not a "what is live now" view — which is what the public map
 * and the review queue both need.
 */
export async function listAlerts({
  store = getAlertStore(), state, level, horizon, districtId, max = 200,
  maxAgeHours = null, now = new Date(),
} = {}) {
  const docs = await store.listDocuments({ state, level, horizon, districtId, max });
  const alerts = docs
    .filter((document) => document.id !== META_DOC_ID)
    .map(alertFromDocument)
    .map((alert) => {
      const cutoff = alert.freshness && alert.freshness.data_cutoff
        ? new Date(alert.freshness.data_cutoff) : null;
      const ageHours = cutoff && !Number.isNaN(cutoff.getTime())
        ? Math.round(((now.getTime() - cutoff.getTime()) / 36e5) * 100) / 100
        : null;
      return {
        ...alert,
        freshness_at_read: {
          as_of: now.toISOString(),
          age_hours: ageHours,
          max_age_hours: maxAgeHours,
          within_slo: ageHours === null ? null : ageHours <= (maxAgeHours ?? Infinity),
        },
      };
    })
    .sort((a, b) => {
      const left = String(b.published_at || b.created_at || '');
      const right = String(a.published_at || a.created_at || '');
      return left.localeCompare(right);
    });
  if (maxAgeHours === null) return alerts;
  return alerts.filter((alert) => alert.freshness_at_read.within_slo !== false);
}

/** Counts for the API/run report: how many alerts sit in each state. */
export function stateCounts(alerts = []) {
  const counts = {};
  for (const alert of alerts) counts[alert.state] = (counts[alert.state] || 0) + 1;
  return counts;
}

export { canAutoPublish, isDutyOfficer, buildEvidenceSnapshot, reviewerIdentity, toPublishRecord };
