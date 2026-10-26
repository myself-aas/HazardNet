/**
 * GET /api/v1/alerts/policy — public; the thresholds and caveats in force.
 *
 * The dependency-free entry of the alert family (no store, no auth) — the uptime
 * probe hits this one. The response is identical to the Express twin's
 * (backend/routes/alerts.js GET /policy). Deployed through api/v1/alerts/[action].js;
 * the 12-function budget and the dispatch contract live in serverless/dispatch.js and
 * docs/codebase/ARCHITECTURE.md#vercel-serverless-surface-the-12-function-budget.
 */

import { guardRequest } from '../../../backend/middleware/serverlessGuard.js';
import { ALERT_LEVELS, describePolicy, getPolicy } from '../../../backend/alerts/policy.js';
import { ALERT_STATES } from '../../../backend/alerts/lifecycle.js';
import { describeSmsTransport, getSmsConfig } from '../../../backend/alerts/channels/sms.js';
import { getTelegramConfig } from '../../../backend/alerts/channels/telegram.js';

export default async function handler(req, res) {
  // The alerts bucket (tighter than the dispatcher's read floor) is what the uptime
  // probe and the public consumers share; the guard suite drives this file through
  // the real entry point and asserts the 60/min ceiling then the 429.
  if (guardRequest(req, res, { bucket: 'alerts' })) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({
    ...describePolicy(getPolicy()),
    levels: ALERT_LEVELS,
    states: ALERT_STATES,
    transports: {
      sms: describeSmsTransport(getSmsConfig()),
      telegram: { channel: 'telegram', configured: getTelegramConfig().configured },
    },
  });
}
