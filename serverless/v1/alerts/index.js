/**
 * GET /api/v1/alerts — the deployed alert list.
 *
 * Anonymous callers see PUBLISHED alerts only; a duty-officer token or the pipeline
 * key unlocks the operational states and reviewer contact details (§1.6: the reviewer
 * identity is *stored* on every alert, never *published*). The projection logic and
 * response envelope are kept byte-identical to the Express twin in
 * backend/routes/alerts.js. Since 2026-10-26 the projection itself is not duplicated:
 * both runtimes, and the Cloudflare Pages Function, import
 * `backend/alerts/publicView.js` — a dependency-free module, so it costs this cold start
 * nothing (the reason the copy existed).
 *
 * Deployed through api/v1/[resource].js; see serverless/dispatch.js and
 * docs/codebase/ARCHITECTURE.md#the-node-function-surface-api.
 */

import { guardRequest } from '../../../backend/middleware/serverlessGuard.js';
import { authenticateAlertRequest } from '../../../backend/utils/alertAuth.js';
import { ALERT_LEVELS, getPolicy } from '../../../backend/alerts/policy.js';
import {
  getAlertStore, listAlerts, stateCounts,
} from '../../../backend/alerts/service.js';
import { ALERT_STATES } from '../../../backend/alerts/lifecycle.js';
import { publicAlertView } from '../../../backend/alerts/publicView.js';

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
