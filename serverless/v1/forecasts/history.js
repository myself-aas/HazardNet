/**
 * GET /api/v1/forecasts/history — a window of accumulated forecast rows (backlog #6:
 * history lives in the forecast store + the weekly GitHub-Release CSV archive), deployed
 * through api/v1/forecasts/[action].js.
 *
 * Windowing (default 30 days ending today, max 90) and the CSV export are shared with
 * the Express route via backend/utils/forecastServe.js — the same ingest-compatible
 * dual-track column set, so an archived window can be re-ingested byte-for-byte.
 */

import { guardRequest } from '../../../backend/middleware/serverlessGuard.js';
import { getForecastStore } from '../../../backend/forecastStore.js';
import { parseHistoryQuery, historyRowsToCsv } from '../../../backend/utils/forecastServe.js';

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'read' })) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const parsed = parseHistoryQuery(req.query);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }
  const { from: fromDate, to: toDate, horizon, districtId, format } = parsed;

  try {
    const rows = await getForecastStore().getForecastHistory({
      from: fromDate, to: toDate, horizon, districtId,
    });

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="hazardnet_forecasts_${fromDate}_${toDate}.csv"`);
      return res.status(200).send(historyRowsToCsv(rows));
    }

    return res.status(200).json({
      from: fromDate,
      to: toDate,
      horizon,
      district_id: districtId,
      count: rows.length,
      generated_at: new Date().toISOString(),
      forecasts: rows,
    });
  } catch (error) {
    console.error('[forecasts/history] store failed:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
