// Vercel Serverless Function
// Handles CSV uploads, generates advisories via Gemini, and writes to Firebase Firestore
// ESM: the root package.json declares "type": "module" — CJS `require` fails here.

import { createReadStream } from 'node:fs';
import csv from 'csv-parser';
import { generateAdvisory } from '../backend/services/advisoryAgent.js';
import { db, collection, getDocs, query, where, doc, setDoc, deleteDoc, writeBatch } from '../backend/db.js';
import Busboy from 'busboy';

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

  // Validate Bearer authorization token before processing upload stream
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const requiredKey = process.env.BACKEND_API_KEY;
  if (requiredKey && (!token || token !== requiredKey)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
  }

  const busboy = new Busboy({ headers: req.headers });
  const results = [];
  const errors = [];
  let fileProcessed = false;

  busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
    if (fieldname !== 'file') {
      file.resume();
      return;
    }
    fileProcessed = true;
    file
      .pipe(csv())
      .on('data', (row) => {
        // Validation similar to backend/routes/forecasts.js
        const VALID_HORIZONS = ['7_days', '15_days'];
        const VALID_HAZARDS = [
          'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
          'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone'
        ];
        if (!VALID_HORIZONS.includes(row.horizon)) {
          errors.push(`Invalid horizon "${row.horizon}"`);
          return;
        }
        if (!VALID_HAZARDS.includes(row.hazard_type)) {
          errors.push(`Invalid hazard "${row.hazard_type}"`);
          return;
        }
        const severity = parseFloat(row.severity_score);
        const confidence = parseFloat(row.confidence);
        if (isNaN(severity) || severity < 0 || severity > 1) {
          errors.push(`Invalid severity ${row.severity_score}`);
          return;
        }
        if (isNaN(confidence) || confidence < 0 || confidence > 1) {
          errors.push(`Invalid confidence ${row.confidence}`);
          return;
        }
        results.push({
          district_id: parseInt(row.district_id),
          district_name: row.district_name,
          horizon: row.horizon,
          hazard_type: row.hazard_type,
          severity_score: severity,
          confidence: confidence,
          target_date: row.target_date,
          prediction_date: row.prediction_date
        });
      })
      .on('end', async () => {
        if (results.length === 0) {
          res.status(422).json({ error: 'No valid rows', validation_errors: errors });
          return;
        }
        // Write to Firestore
        try {
          const predictionDate = results[0].prediction_date;
          const forecastsRef = collection(db, 'forecasts');
          const qOld = query(forecastsRef, where('prediction_date', '==', predictionDate));
          const oldSnap = await getDocs(qOld);
          const batch = writeBatch(db);
          oldSnap.forEach((d) => {
            batch.delete(d.ref);
          });
          for (const row of results) {
            const newDocRef = doc(collection(db, 'forecasts'));
            batch.set(newDocRef, {
              district_id: row.district_id,
              district_name: row.district_name,
              horizon: row.horizon,
              hazard_type: row.hazard_type,
              severity_score: row.severity_score,
              confidence: row.confidence,
              target_date: row.target_date,
              prediction_date: row.prediction_date,
              created_at: new Date().toISOString()
            });
          }
          await batch.commit();
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

