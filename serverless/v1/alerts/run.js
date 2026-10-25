/**
 * POST /api/v1/alerts/run — run the detector pipeline over the current forecast store.
 *
 * Write-only: keyed (BACKEND_API_KEY, fail-closed) and metered on the pipeline bucket,
 * which raises the ceiling for the keyed caller so a backfill cannot trip the
 * anti-probing limit mid-run (see backend/middleware/serverlessGuard.js). Behavior and
 * the batch-omission envelope mirror the Express twin (backend/routes/alerts.js POST
 * /run): `include_alerts: true` keeps the full assessment batch in the response.
 *
 * Deployed through api/v1/alerts/[action].js.
 */

import { guardRequest } from '../../../backend/middleware/serverlessGuard.js';
import { verifyApiKey } from '../../../backend/utils/apiKeyAuth.js';
import { runAlertEngine } from '../../../backend/alerts/service.js';
import { notifyAlert } from '../../../backend/alerts/notify.js';

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'pipeline' })) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  // Timing-safe Bearer key verification (SEC-06); fail-closed when unset.
  const key = verifyApiKey(req);
  if (!key.ok) {
    return res.status(key.status).json({ error: key.error });
  }

  const notify = req.body && req.body.notify === false ? null : notifyAlert;
  try {
    const result = await runAlertEngine({ notify });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ...result,
      batch: req.body && req.body.include_alerts === true
        ? result.batch
        : { ...result.batch, alerts: undefined, alerts_omitted: result.batch.alerts.length },
    });
  } catch (error) {
    console.error('[alerts/run] failed:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
