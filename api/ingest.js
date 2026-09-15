// Vercel serverless function to ingest forecast chunks
// Expected payload: { chunk: Array<{...}> }

import { getForecastStore } from '../backend/forecastStore.js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { verifyApiKey } from '../backend/utils/apiKeyAuth.js';
import { ingestForecastCsv } from '../backend/utils/csvIngestion.js';

// Validation schema for a single forecast row
const ForecastSchema = z.object({
  district_id: z.union([z.string(), z.number()]),
  district_name: z.string(),
  // Keep in sync with backend/utils/forecastRow.js VALID_HORIZONS and the
  // public.forecasts CHECK constraint (scripts/db/002_forecasts_supabase.sql).
  horizon: z.enum(['7_days', '15_days']),
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
  temperature_mean: z.number().optional(),
  temperature_max: z.number().optional(),
  temperature_min: z.number().optional(),
  precipitation_mm: z.number().optional(),
  wind_max_kmh: z.number().optional(),
  dewpoint_mean: z.number().optional(),
  solar_radiation_mj_m2: z.number().optional(),
  evapotranspiration_mm: z.number().optional(),
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
    body = typeof req.body === 'string' ? req.body : req.body;
  } catch {
    body = req.body;
  }

  // Check if body is raw CSV string or object with csv field
  let csvString = null;
  if (typeof body === 'string' && (body.includes(',') || body.includes('\n'))) {
    csvString = body;
  } else if (body && typeof body === 'object' && typeof body.csv === 'string') {
    csvString = body.csv;
  }

  if (csvString) {
    try {
      const mode = req.query?.mode === 'append' ? 'append' : 'replace';
      const result = await ingestForecastCsv(csvString, { mode });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'success', ...result }));
      return;
    } catch (e) {
      logger.error('CSV Ingest error', e);
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  // Otherwise handle JSON chunk payload
  let parsedJson = body;
  if (typeof body === 'string') {
    try {
      parsedJson = JSON.parse(body);
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid JSON or CSV body' }));
      return;
    }
  }

  const parseResult = PayloadSchema.safeParse(parsedJson);
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

