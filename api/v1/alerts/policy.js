// Vercel Serverless Function — GET /api/v1/alerts/policy
//
// The thresholds in force, the human-in-the-loop ceiling and the calibration
// caveat, as served by the Express route. No credentials, no auth: this is the
// document that lets a reader check why an alert was or was not issued.

import { describePolicy, getPolicy, ALERT_LEVELS } from '../../../backend/alerts/policy.js';
import { ALERT_STATES } from '../../../backend/alerts/lifecycle.js';
import { describeSmsTransport, getSmsConfig } from '../../../backend/alerts/channels/sms.js';
import { getTelegramConfig } from '../../../backend/alerts/channels/telegram.js';
import { guardRequest } from '../../../backend/middleware/serverlessGuard.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  if (guardRequest(req, res, { bucket: 'alerts' })) return;
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({
    ...describePolicy(getPolicy()),
    levels: ALERT_LEVELS,
    states: ALERT_STATES,
    transports: {
      sms: describeSmsTransport(getSmsConfig()),
      telegram: { channel: 'telegram', configured: getTelegramConfig().configured },
    },
  });
}
