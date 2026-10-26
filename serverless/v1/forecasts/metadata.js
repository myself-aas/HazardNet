/**
 * GET /api/v1/forecasts/metadata — the freshness headline: newest ingested prediction
 * date, ingestion stamp, and Kaggle provenance, deployed through
 * api/v1/forecasts/[action].js. Nulls on an empty store are the honest answer (SLO
 * monitors treat absent freshness as an alarm); envelope shared with the Express route
 * via backend/utils/forecastServe.js.
 */

import { guardRequest } from '../../../backend/middleware/serverlessGuard.js';
import { getForecastStore } from '../../../backend/forecastStore.js';
import { metadataDatasets, metadataDataSource } from '../../../backend/utils/forecastServe.js';

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'read' })) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const store = getForecastStore();
    const predictionDate = await store.getLatestPredictionDate();
    const ingestionTimestamp = await store.getLatestIngestionTimestamp();
    const rowCount = typeof store.getLatestRowCount === 'function' ? await store.getLatestRowCount() : 0;

    res.setHeader('cache-control', 'no-store, max-age=0');
    return res.status(200).json({
      prediction_date: predictionDate,
      ingestion_timestamp: ingestionTimestamp,
      data_source: metadataDataSource(),
      row_count: rowCount,
      notebook_source: 'hazardnet/forecast-pipeline',
      datasets: metadataDatasets(),
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[forecasts/metadata] store failed:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
