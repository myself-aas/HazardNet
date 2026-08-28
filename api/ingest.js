// Vercel serverless function to ingest forecast chunks
// Expected payload: { chunk: Array<{...}> }

import { db, collection, doc, setDoc, writeBatch } from '../backend/db.js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { verifyApiKey } from '../backend/utils/apiKeyAuth.js';

// Validation schema for a single forecast row
const ForecastSchema = z.object({
  district_id: z.union([z.string(), z.number()]),
  district_name: z.string(),
  horizon: z.number(),
  hazard_type: z.string(),
  confidence: z.number(),
  severity_score: z.number(),
  target_date: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date' }),
  prediction_date: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date' }),
});

// Payload schema
const PayloadSchema = z.object({
  chunk: z.array(ForecastSchema),
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Timing-safe Bearer key verification (SEC-06); fail-closed when unset.
  const auth = verifyApiKey(req);
  if (!auth.ok) {
    res.statusCode = auth.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: auth.error }));
    return;
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const parseResult = PayloadSchema.safeParse(body);
  if (!parseResult.success) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid payload', details: parseResult.error.errors }));
    return;
  }

  const { chunk } = parseResult.data;

  try {
    const batch = writeBatch(db);
    const forecastsRef = collection(db, 'forecasts');

    for (const row of chunk) {
      const docRef = doc(forecastsRef);
      batch.set(docRef, {
        district_id: row.district_id,
        district_name: row.district_name,
        horizon: row.horizon,
        hazard_type: row.hazard_type,
        confidence: row.confidence,
        severity_score: row.severity_score,
        target_date: row.target_date,
        prediction_date: row.prediction_date,
        created_at: new Date().toISOString()
      });
    }

    await batch.commit();

    logger.info(`Ingested ${chunk.length} forecast rows into Firestore`);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'success', count: chunk.length }));
  } catch (e) {
    logger.error('Ingest error', e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: e.message }));
  }
}

