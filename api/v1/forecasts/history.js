// Vercel Serverless Function — GET /api/v1/forecasts/history
// (see backend/routes/forecasts.js for the query contract:
// ?from=YYYY-MM-DD&to=YYYY-MM-DD&horizon=7_days|15_days&district_id=N&format=json|csv)

import { parseHistoryQuery, historyRowsToCsv } from '../../../backend/utils/forecastServe.js';
import { getForecastStore } from '../../../backend/forecastStore.js';
import { clientError } from '../../../backend/utils/clientError.js';

/**
 * @param {import('vercel').Request} req
 * @param {import('vercel').Response} res
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const parsed = parseHistoryQuery(req.query || {});
  if (parsed.error) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const { from: fromDate, to: toDate, horizon, districtId, format } = parsed;

  try {
    const rows = await getForecastStore().getForecastHistory({
      from: fromDate,
      to: toDate,
      horizon,
      districtId,
    });

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="hazardnet_forecasts_${fromDate}_${toDate}.csv"`,
      );
      res.status(200).send(historyRowsToCsv(rows));
      return;
    }

    res.status(200).json({
      from: fromDate,
      to: toDate,
      horizon,
      district_id: districtId,
      count: rows.length,
      generated_at: new Date().toISOString(),
      forecasts: rows,
    });
  } catch (err) {
    clientError(res, err, { scope: 'api/v1/forecasts/history' });
  }
}
