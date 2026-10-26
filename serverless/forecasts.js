/**
 * POST /api/forecasts — one-shot CSV ingestion into the forecast store.
 *
 * The legacy top-level route served by api/[endpoint].js: the daily workflow may post
 * the advisory CSV straight here instead of /api/v1/forecasts/update. Keyed (SEC-06,
 * fail-closed) and pipeline-metered at its own budget. The body is the raw CSV
 * (text/csv); parsing, row validation and the replace/append write are entirely
 * delegated to backend/utils/csvIngestion.js, the same lane the Express upload route
 * uses, so both runtimes feed the store identically.
 */

import { guardRequest } from '../backend/middleware/serverlessGuard.js';
import { verifyApiKey } from '../backend/utils/apiKeyAuth.js';
import { ingestForecastCsv } from '../backend/utils/csvIngestion.js';

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'pipeline' })) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const key = verifyApiKey(req);
  if (!key.ok) {
    return res.status(key.status).json({ error: key.error });
  }

  const body = req.body;
  const csvText = Buffer.isBuffer(body) ? body.toString('utf8')
    : typeof body === 'string' ? body
      : null;
  if (!csvText || !csvText.trim()) {
    return res.status(400).json({
      error: 'expected the raw advisory CSV as a text body (text/csv) — a multipart ' +
        'upload is not accepted on this route',
    });
  }

  const mode = req.query?.mode === 'append' ? 'append' : 'replace';
  try {
    const report = await ingestForecastCsv(csvText, { mode });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json(report);
  } catch (error) {
    console.error('[forecasts] CSV ingestion failed:', error.message);
    return res.status(422).json({ error: `CSV ingestion failed: ${error.message}` });
  }
}
