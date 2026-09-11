// Vercel serverless function to ingest forecast chunks
// Expected payload: { chunk: Array<{...}> }

import { getForecastStore } from '../backend/forecastStore.js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { verifyApiKey } from '../backend/utils/apiKeyAuth.js';

// Validation schema for a single forecast row
const ForecastSchema = z.object({
  district_id: z.union([z.string(), z.number()]),
  district_name: z.string(),
  // Keep in sync with backend/utils/forecastRow.js VALID_HORIZONS and the
  // public.forecasts CHECK constraint (scripts/db/002_forecasts_supabase.sql).
  horizon: z.enum(['10_days', '20_days', '30_days']),
  hazard_type: z.string(),
  confidence: z.number(),
  severity_score: z.number(),
  target_date: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date' }),
  prediction_date: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date' }),
  // Dual-track severity + admin context (weekly Kaggle pipeline CSV shape) — optional.
  model_severity: z.number().min(0).max(1).optional(),
  physics_severity: z.number().min(0).max(1).optional(),
  division: z.string().optional(),
  pcode: z.string().optional(),
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
  } catch {
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
    // Upsert through the forecast store (Firestore batch or Supabase upsert,
    // per FORECAST_STORE — ADR 0002).
    await getForecastStore().appendForecasts(chunk);

    logger.info(`Ingested ${chunk.length} forecast rows into the ${getForecastStore().mode} forecast store`);
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

