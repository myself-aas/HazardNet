/**
 * GET /api/v1/forecasts/bulk — latest row per district for one horizon (the map's
 * heatmap payload), deployed through api/v1/forecasts/[action].js.
 *
 * Query validation and the response envelope are shared with the Express route so the
 * two runtimes stay byte-identical (backend/utils/forecastServe.js); this file only adds
 * the serverless-side method gate, guard, and the SEC-13 5xx mapping (never echo the
 * store error to the client — log it, answer generically).
 */

import { guardRequest } from '../../../backend/middleware/serverlessGuard.js';
import { getForecastStore } from '../../../backend/forecastStore.js';
import { parseBulkQuery, metadataDataSource } from '../../../backend/utils/forecastServe.js';

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'read' })) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const parsed = parseBulkQuery(req.query);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  try {
    const rows = await getForecastStore().getLatestForecastsByHorizon(parsed.horizon);
    res.setHeader('cache-control', 'no-store, max-age=0');
    return res.status(200).json({
      horizon: parsed.horizon,
      count: rows.length,
      generated_at: new Date().toISOString(),
      data_source: metadataDataSource(),
      forecasts: rows,
    });
  } catch (error) {
    console.error('[forecasts/bulk] store failed:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
