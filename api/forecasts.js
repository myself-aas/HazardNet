// Vercel Serverless Function
// Handles CSV uploads, generates advisories via Gemini, and writes through the forecast store (ADR 0002)
// ESM: the root package.json declares "type": "module" — CJS `require` fails here.

import csv from 'csv-parser';
import { generateAdvisory } from '../backend/services/advisoryAgent.js';
import { getForecastStore } from '../backend/forecastStore.js';
import { parseCsvForecastRow } from '../backend/utils/forecastRow.js';
import Busboy from 'busboy';
import { verifyApiKey } from '../backend/utils/apiKeyAuth.js';

/**
 * Vercel expects an async function with (req, res) signature.
 * @param {import('vercel').Request} req
 * @param {import('vercel').Response} res
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Timing-safe Bearer key verification (SEC-06); fail-closed when unset.
  const auth = verifyApiKey(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const busboy = new Busboy({ headers: req.headers });
  const results = [];
  const errors = [];
  let fileProcessed = false;

  busboy.on('file', (fieldname, file, _filename, _encoding, _mimetype) => {
    if (fieldname !== 'file') {
      file.resume();
      return;
    }
    fileProcessed = true;
    file
      .pipe(csv())
      .on('data', (row) => {
        // Shared parser (accepts legacy severity_score + notebook dual-track
        // model_severity/physics_severity shapes) — same contract as the
        // backend route's CSV ingest.
        const parsed = parseCsvForecastRow(row, results.length + errors.length + 1);
        if (!parsed.ok) {
          errors.push(parsed.error);
          return;
        }
        results.push(parsed.value);
      })
      .on('end', async () => {
        if (results.length === 0) {
          res.status(422).json({ error: 'No valid rows', validation_errors: errors });
          return;
        }
        // Write through the forecast store (Firestore or Supabase per
        // FORECAST_STORE — ADR 0002): replace-all for this prediction_date.
        try {
          const predictionDate = results[0].prediction_date;
          await getForecastStore().replaceForecastsForPredictionDate(predictionDate, results);
        } catch (dbErr) {
          res.status(500).json({ error: 'DB error', detail: dbErr.message });
          return;
        }
        // Generate advisories
        const advisories = [];
        for (const row of results) {
          try {
            const advisory = await generateAdvisory({
              hazard: row.hazard_type,
              probability: row.severity_score,
              metadata: {
                district_id: row.district_id,
                horizon: row.horizon,
                target_date: row.target_date
              }
            });
            advisories.push({ district_id: row.district_id, advisory });
          } catch (e) {
            console.warn(`Advisory generation failed for district ${row.district_id}: ${e.message}`);
          }
        }
        res.json({
          status: 'success',
          records_updated: results.length,
          prediction_date: results[0].prediction_date,
          advisories
        });
      })
      .on('error', (err) => {
        res.status(500).json({ error: 'CSV parse error', detail: err.message });
      });
  });

  busboy.on('finish', () => {
    if (!fileProcessed) {
      res.status(400).json({ error: 'No file field named "file" in form data' });
    }
  });

  req.pipe(busboy);
}

