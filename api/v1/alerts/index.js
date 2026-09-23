// Vercel Serverless Function — GET /api/v1/alerts
//
// Public read of published alerts (PRODUCT_SPEC §1.3); the review queue requires
// duty-officer standing or the pipeline API key. Same access rules as the Express
// route (backend/routes/alerts.js) via the shared backend/utils/alertAuth.js, so a
// Vercel deployment cannot serve a different policy than the Express one.
//
// Runtime env (Vercel project settings): FORECAST_STORE / Firestore credentials as
// for the other endpoints, plus BACKEND_API_KEY and ALERT_DUTY_OFFICERS for the
// privileged paths.

import { authenticateAlertRequest } from '../../../backend/utils/alertAuth.js';
import { listAlerts, stateCounts } from '../../../backend/alerts/service.js';
import { getPolicy, ALERT_LEVELS } from '../../../backend/alerts/policy.js';
import { ALERT_STATES } from '../../../backend/alerts/lifecycle.js';
import { publicAlertView } from '../../../backend/routes/alerts.js';
import { guardRequest } from '../../../backend/middleware/serverlessGuard.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  if (guardRequest(req, res, { bucket: 'alerts' })) return;
  const policy = getPolicy();
  const { privileged } = await authenticateAlertRequest(req);

  const requestedState = req.query.state ? String(req.query.state).toUpperCase() : null;
  if (requestedState && !ALERT_STATES.includes(requestedState)) {
    res.status(400).json({ error: `unknown state ${requestedState}` });
    return;
  }
  const level = req.query.level ? String(req.query.level).toUpperCase() : null;
  if (level && !ALERT_LEVELS.includes(level)) {
    res.status(400).json({ error: `unknown level ${level}` });
    return;
  }

  try {
    const alerts = await listAlerts({
      state: privileged ? (requestedState || null) : 'PUBLISHED',
      level,
      horizon: req.query.horizon ? String(req.query.horizon) : undefined,
      districtId: req.query.district_id || req.query.districtId || undefined,
      max: Math.min(Number(req.query.limit) > 0 ? Number(req.query.limit) : 200, 500),
    });
    res.setHeader('Cache-Control', privileged ? 'no-store, max-age=0' : 'public, max-age=60');
    res.status(200).json({
      generated_at: new Date().toISOString(),
      policy_version: policy.version,
      count: alerts.length,
      state_counts: stateCounts(alerts),
      states_visible: privileged ? 'all' : ['PUBLISHED'],
      max_auto_publish_level: policy.max_auto_publish_level,
      disclaimer: policy.disclaimer,
      alerts: alerts.map((alert) => publicAlertView(alert, { includeReviewerContact: privileged })),
    });
  } catch (error) {
    res.status(500).json({ error: `could not list alerts: ${error.message}` });
  }
}
