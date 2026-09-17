// Vercel Serverless Function — POST /api/v1/alerts/run
//
// The scheduled engine pass, for a Vercel cron or an external scheduler
// (the GitHub workflow calls the Express route; this exists so a
// Vercel-only deployment is not blind). Pipeline key required, fail-closed.
//
// Body (optional): {"include_alerts": true} to return the full batch,
// {"notify": false} to assess without dispatching SMS/Telegram.

import { verifyApiKey } from '../../../backend/utils/apiKeyAuth.js';
import { runAlertEngine } from '../../../backend/alerts/service.js';
import { notifyAlert } from '../../../backend/alerts/notify.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  const key = verifyApiKey({ headers: req.headers });
  if (!key.ok) {
    res.status(key.status).json({ error: key.error });
    return;
  }

  const body = req.body || {};
  try {
    const result = await runAlertEngine({ notify: body.notify === false ? null : notifyAlert });
    res.status(200).json({
      ...result,
      batch: body.include_alerts === true
        ? result.batch
        : { ...result.batch, alerts: undefined, alerts_omitted: result.batch.alerts.length },
    });
  } catch (error) {
    res.status(500).json({ error: `alert run failed: ${error.message}` });
  }
}
