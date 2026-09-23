// Vercel Serverless Function — GET /api/v1/forecasts/metadata
//
// Freshness endpoint for the "Peak Hazard Window" / "Incident Ingestion"
// cards: newest ingested production prediction_date + ingestion timestamp +
// dataset provenance. Same shape as backend/routes/forecasts.js GET /metadata.

import { metadataDatasets, metadataDataSource } from '../../../backend/utils/forecastServe.js';
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

  try {
    const store = getForecastStore();
    const predictionDate = await store.getLatestPredictionDate();
    const ingestionTimestamp = await store.getLatestIngestionTimestamp();
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({
      prediction_date: predictionDate,
      ingestion_timestamp: ingestionTimestamp,
      data_source: metadataDataSource(),
      notebook_source: 'hazardnet/forecast-pipeline',
      datasets: metadataDatasets(),
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    clientError(res, err, { scope: 'api/v1/forecasts/metadata' });
  }
}
