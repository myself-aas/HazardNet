/**
 * Alert store — persistence for alert lifecycle records (PRODUCT_SPEC §1.6).
 *
 * Firestore (`alerts` collection) is the only backend, same as the forecast store
 * (ADR 0002 / firestore.rules). The store is deliberately dumb: it appends
 * immutable *events* to one document per alert and serves reads. Every rule about
 * which transition is legal lives in `backend/alerts/lifecycle.js`, so the tests
 * can pin the state machine without a database and the store cannot be talked into
 * an illegal write by a caller.
 *
 * Design notes that matter for the Phase 4 acceptance criteria:
 *
 *   - **Event log, not last-write-wins.** `events` is an append-only array on the
 *     alert document. `alertFromDocument()` reconstructs the current state from
 *     the log, so a published alert keeps its whole review history — including
 *     rejections with their reason, which are the eval labels §1.6 asks for.
 *   - **No deletes.** There is no `deleteAlert`; a wrong alert is superseded or
 *     rejected, never erased. That is what makes the archive usable as ground truth.
 *   - **Query-safe fields.** `level`, `level_rank`, `state`, `district_id`,
 *     `horizon`, `hazard_type`, `generated_at` are copied onto the document root
 *     as a denormalised `summary` so the API can list without reading every log.
 */

import { db, collection, getDocs, query, where, orderBy, limit, doc, setDoc, getDoc } from '../db.js';

export const ALERT_DOC_VERSION = 'alert-doc/1.0.0';
export const ALERT_COLLECTION = 'alerts';

export function getAlertStoreMode() {
  return 'firestore';
}

let cachedStore = null;

export function getAlertStore() {
  if (!cachedStore) cachedStore = createFirestoreAlertStore();
  return cachedStore;
}

export function resetAlertStore() {
  cachedStore = null;
}

const slug = (value, fallback) => String(value === undefined || value === null || value === ''
  ? fallback : value).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

/**
 * The alert *key*: one key per (district, horizon, hazard, target date). A key can
 * have several issues over time — one per prediction date.
 */
export function alertKeyFor({ district_id: districtId, horizon, hazard_type: hazardType,
  target_date: targetDate } = {}) {
  return [
    targetDate || 'undated',
    horizon || 'unknown-horizon',
    districtId ?? 'unknown-district',
    slug(hazardType, 'unknown-hazard'),
  ].join('__');
}

/**
 * Document id for one **issue** of an alert. The prediction date is part of the id
 * on purpose: re-forecasting the same target on a later day must not overwrite the
 * earlier issue, because the earlier issue's review history (and any rejection)
 * is what the evaluation labels are built from.
 */
export function alertIdFor({ district_id: districtId, horizon, hazard_type: hazardType,
  target_date: targetDate, prediction_date: predictionDate } = {}) {
  const key = alertKeyFor({ district_id: districtId, horizon, hazard_type: hazardType,
    target_date: targetDate });
  return `${key}__p${predictionDate || 'undated'}`;
}

/**
 * Rebuild the current alert state from its event log.
 *
 * The returned object is what the API and the evaluator consume:
 *   { id, state, level, level_rank, published, history, review }
 * `history` is the raw log — reviewer identity, timestamps and reasons included.
 */
export function alertFromDocument(docData = {}) {
  const events = Array.isArray(docData.events) ? docData.events : [];
  const created = events.find((e) => e.type === 'created') || null;
  const transitions = events.filter((e) => e.type === 'transition');

  let state = docData.state || 'DRAFT';
  let level = docData.level || (created && created.level) || null;
  let history = [];
  let review = null;
  let published = null;
  let supersededBy = null;

  for (const event of transitions) {
    const from = event.from || state;
    const to = event.to || state;
    history.push({
      at: event.at || null,
      actor: event.actor || null,
      from,
      to,
      level: event.level || level,
      reason: event.reason ?? null,
      rejection_reason: event.rejection_reason ?? null,
      evidence_snapshot: event.evidence_snapshot ?? null,
    });
    state = to;
    if (event.level) level = event.level;
    if (to === 'REJECTED') review = {
      decision: 'rejected',
      reviewer: event.actor || null,
      at: event.at || null,
      reason: event.rejection_reason || event.reason || null,
      evidence_snapshot: event.evidence_snapshot ?? null,
      // A rejection is a label: "this alert should not have fired".
      label: { alert_id: docData.id || null, decision: 'rejected', level: event.level || level,
        reason: event.rejection_reason || event.reason || null, hazard_type: docData.hazard_type,
        district_id: docData.district_id, horizon: docData.horizon },
    };
    if (to === 'PUBLISHED') {
      published = {
        at: event.at || null,
        level: event.level || level,
        reviewer: event.actor && event.actor !== 'alert-pipeline' ? event.actor : null,
        mode: event.actor === 'alert-pipeline' ? 'auto' : 'human',
        model_version: event.model_version ?? null,
        dataset_version: event.dataset_version ?? null,
        data_cutoff: event.data_cutoff ?? null,
        evidence_snapshot: event.evidence_snapshot ?? null,
      };
    }
    if (to === 'SUPERSEDED') supersededBy = event.reason || null;
  }

  const lastRejection = events.filter(
    (e) => e.type === 'transition' && e.to === 'REJECTED'
  ).pop();

  return {
    id: docData.id || null,
    alert_key: docData.alert_key || null,
    doc_version: docData.doc_version || ALERT_DOC_VERSION,
    state,
    level,
    level_rank: Number.isFinite(docData.level_rank) ? docData.level_rank : null,
    district_id: docData.district_id ?? null,
    district_name: docData.district_name ?? null,
    division: docData.division ?? null,
    pcode: docData.pcode ?? null,
    horizon: docData.horizon ?? null,
    hazard_type: docData.hazard_type ?? null,
    target_date: docData.target_date ?? null,
    prediction_date: docData.prediction_date ?? null,
    severity_score: docData.severity_score ?? null,
    confidence: docData.confidence ?? null,
    confidence_kind: docData.confidence_kind ?? null,
    policy_version: docData.policy_version ?? null,
    reasons: docData.reasons || [],
    blockers: docData.blockers || [],
    evidence: docData.evidence || null,
    freshness: docData.freshness || null,
    provenance: docData.provenance || null,
    requires_human_review: docData.requires_human_review === true,
    auto_publishable: docData.auto_publishable === true,
    assessment: docData.assessment || null,
    review,
    last_rejection: lastRejection ? {
      at: lastRejection.at || null,
      reviewer: lastRejection.actor || null,
      reason: lastRejection.rejection_reason || lastRejection.reason || null,
    } : null,
    published,
    superseded_by: supersededBy,
    history,
    has_review_history: history.some((h) => h.actor && h.actor !== 'alert-pipeline'),
    disclaimer: docData.disclaimer || null,
  };
}

function createFirestoreAlertStore() {
  return {
    mode: 'firestore',

    /** Create-or-append. `docData` is the merged document; never a partial. */
    async putDocument(docData) {
      await setDoc(doc(db, ALERT_COLLECTION, docData.id), docData);
      return docData;
    },

    async getDocument(id) {
      const snap = await getDoc(doc(db, ALERT_COLLECTION, id));
      return snap.exists() ? { id, ...snap.data() } : null;
    },

    /**
     * The most recent issue for an alert key, excluding superseded ones. Used to
     * mark the previous issue SUPERSEDED when a newer forecast arrives.
     */
    async getLatestDocumentForAlertKey(alertKey) {
      const q = query(collection(db, ALERT_COLLECTION), where('alert_key', '==', alertKey));
      const snap = await getDocs(q);
      const docs = [];
      snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
      const live = docs
        .filter((document) => document.state !== 'SUPERSEDED')
        .sort((a, b) => String(b.prediction_date || '').localeCompare(String(a.prediction_date || '')));
      return live[0] || null;
    },

    async listDocuments({ state, level, horizon, districtId, max = 200 } = {}) {
      const clauses = [];
      if (state) clauses.push(where('state', '==', state));
      if (level) clauses.push(where('level', '==', level));
      if (horizon) clauses.push(where('horizon', '==', horizon));
      if (districtId !== undefined && districtId !== null) {
        clauses.push(where('district_id', '==', Number(districtId)));
      }
      const q = clauses.length
        ? query(collection(db, ALERT_COLLECTION), ...clauses, limit(max))
        : query(collection(db, ALERT_COLLECTION), orderBy('generated_at', 'desc'), limit(max));
      const snap = await getDocs(q);
      const docs = [];
      snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
      return docs;
    },
  };
}
