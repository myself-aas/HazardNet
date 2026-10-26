/**
 * GET /api/v1/alerts — the deployed alert list.
 *
 * Anonymous callers see PUBLISHED alerts only; a duty-officer token or the pipeline
 * key unlocks the operational states and reviewer contact details (§1.6: the reviewer
 * identity is *stored* on every alert, never *published*). The projection logic and
 * response envelope are kept byte-identical to the Express twin in
 * backend/routes/alerts.js (publicAlertView is duplicated here deliberately — pulling
 * the Express module in would drag multer and the route graph into this cold start).
 *
 * Deployed through api/v1/[resource].js; see serverless/dispatch.js and
 * docs/codebase/ARCHITECTURE.md#vercel-serverless-surface-the-12-function-budget.
 */

import { guardRequest } from '../../../backend/middleware/serverlessGuard.js';
import { authenticateAlertRequest } from '../../../backend/utils/alertAuth.js';
import { ALERT_LEVELS, getPolicy } from '../../../backend/alerts/policy.js';
import {
  getAlertStore, listAlerts, stateCounts,
} from '../../../backend/alerts/service.js';
import { ALERT_STATES } from '../../../backend/alerts/lifecycle.js';

/**
 * Public projection of a stored alert — mirror of the export in
 * backend/routes/alerts.js (keep them in lockstep if either changes).
 */
const redactActor = (actor) => {
  if (!actor) return actor;
  const value = String(actor);
  if (value === 'alert-pipeline') return value;
  if (value.includes('@')) return 'reviewer (contact redacted)';
  return value;
};

const publicAlertView = (alert, { includeReviewerContact = false } = {}) => {
  const view = { ...alert };
  delete view.assessment;
  if (!includeReviewerContact) {
    view.history = (alert.history || []).map((entry) => ({
      at: entry.at,
      from: entry.from,
      to: entry.to,
      level: entry.level,
      automatic: entry.actor === 'alert-pipeline',
      actor: redactActor(entry.actor),
      reason: entry.reason,
      rejection_reason: entry.rejection_reason,
    }));
    if (view.review) view.review = { ...view.review, reviewer: redactActor(view.review.reviewer) };
    if (view.published) {
      view.published = {
        ...view.published,
        reviewer: redactActor(view.published.reviewer),
        contact_redacted: 'reviewer email is available to duty officers only',
      };
    }
  }
  return view;
};

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'alerts' })) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const store = getAlertStore();
  const policy = getPolicy();
  const { privileged } = await authenticateAlertRequest(req);

  const requestedState = req.query?.state ? String(req.query.state).toUpperCase() : null;
  if (requestedState && !ALERT_STATES.includes(requestedState)) {
    return res.status(400).json({ error: `unknown state ${requestedState}` });
  }
  const level = req.query?.level ? String(req.query.level).toUpperCase() : null;
  if (level && !ALERT_LEVELS.includes(level)) {
    return res.status(400).json({ error: `unknown level ${level}` });
  }
  const state = privileged ? (requestedState || null) : 'PUBLISHED';

  try {
    const alerts = await listAlerts({
      store,
      state,
      level,
      horizon: req.query?.horizon ? String(req.query.horizon) : undefined,
      districtId: req.query?.district_id || req.query?.districtId || undefined,
      max: Math.min(Number(req.query?.limit) > 0 ? Number(req.query.limit) : 200, 500),
    });
    const view = alerts.map((alert) => publicAlertView(alert, {
      includeReviewerContact: privileged,
    }));
    /* The level ledger, in the shape the web client reads from the committed snapshot.
       `state_counts` answers a different question (how many rows sit in each lifecycle state,
       including the ones nobody may see) and the client has no use for it. Without `counts`,
       an empty-but-successful answer was indistinguishable from an unreadable artifact — see
       `loadAlerts` in frontend/src/lib/alerts.ts, and the 2026-10-26 www.hazardnet.live
       incident it documents. */
    const counts = view.reduce((acc, alert) => {
      const level = String(alert.level || '');
      if (level) acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {});

    res.setHeader('Cache-Control', privileged ? 'no-store' : 'public, max-age=60');
    return res.status(200).json({
      generated_at: new Date().toISOString(),
      policy_version: policy.version,
      count: view.length,
      counts,
      state_counts: stateCounts(alerts),
      states_visible: privileged ? 'all' : ['PUBLISHED'],
      filters: {
        state, level, horizon: req.query?.horizon || null,
        district_id: req.query?.district_id || null,
      },
      max_auto_publish_level: policy.max_auto_publish_level,
      disclaimer: policy.disclaimer,
      alerts: view,
    });
  } catch (error) {
    // SEC-13: never echo the store error verbatim to the client.
    console.error('[alerts] list failed:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
