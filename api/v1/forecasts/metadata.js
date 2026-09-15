// Vercel Serverless Function — GET /api/v1/forecasts/metadata
//
// Freshness endpoint for the "Peak Hazard Window" / "Incident Ingestion"
// cards: newest ingested Kaggle prediction_date + ingestion timestamp +
// dataset provenance. Same shape as backend/routes/forecasts.js GET /metadata.

import { metadataDatasets, readForecastMetadata } from '../../../backend/utils/forecastServe.js';
import { getForecastStore } from '../../../backend/forecastStore.js';

/**
 * @param {import('vercel').Request} req
 * @param {import('vercel').Response} res
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const store = getForecastStore();
    const metadata = await readForecastMetadata(store);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({
      ...metadata,
      datasets: metadataDatasets(),
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
