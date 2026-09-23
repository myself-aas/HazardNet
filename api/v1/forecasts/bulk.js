// Vercel Serverless Function — GET /api/v1/forecasts/bulk?horizon=7_days
//
// Closes the API-parity gap: the Express backend always served /bulk, but the
// Vercel deployment had no GET handler for it, so production fell back to the
// static baseline. Thin wrapper over the shared serving logic
// (backend/utils/forecastServe.js) + the forecast store (ADR 0002) — the
// response shape is identical to backend/routes/forecasts.js by construction.
//
// Runtime env (Vercel project settings): the forecast store reads Firestore.
import { parseBulkQuery, metadataDataSource } from '../../../backend/utils/forecastServe.js';
import { getForecastStore } from '../../../backend/forecastStore.js';
import { clientError } from '../../../backend/utils/clientError.js';
import { guardRequest } from '../../../backend/middleware/serverlessGuard.js';

/**
 * @param {import('vercel').Request} req
 * @param {import('vercel').Response} res
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  if (guardRequest(req, res, { bucket: 'read' })) return;

  const parsed = parseBulkQuery(req.query || {});
  if (parsed.error) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    const rows = await getForecastStore().getLatestForecastsByHorizon(parsed.horizon);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({
      horizon: parsed.horizon,
      count: rows.length,
      generated_at: new Date().toISOString(),
      data_source: metadataDataSource(),
      forecasts: rows,
    });
  } catch (err) {
    clientError(res, err, { scope: 'api/v1/forecasts/bulk' });
  }
}
