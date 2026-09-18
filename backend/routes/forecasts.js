import express from 'express';
import path from 'path';
import multer from 'multer';
import { verifyApiKey } from '../utils/apiKeyAuth.js';
import { parseCsvForecastRow, VALID_HORIZONS } from '../utils/forecastRow.js';
import { ingestForecastCsv } from '../utils/csvIngestion.js';
import {
    parseBulkQuery,
    parseHistoryQuery,
    historyRowsToCsv,
    metadataDatasets,
    metadataDataSource,
} from '../utils/forecastServe.js';
import { getForecastStore } from '../forecastStore.js';
import csv from 'csv-parser';
import fs from 'fs';
import { generateAdvisory } from '../services/advisoryAgent.js';
import { clientError } from '../utils/clientError.js';
const router = express.Router();

// Ensure upload directory exists
const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
    } catch (e) {
        console.warn('Could not create uploads directory:', e.message);
    }
}

const upload = multer({
    dest: uploadDir,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});


// ─────────────────────────────────────────────────────────
// POST /api/v1/forecasts/update
// Receives CSV from GitHub Actions, upserts into Firestore
// ─────────────────────────────────────────────────────────
router.post('/update', upload.single('file'), (req, res, next) => {
    // Timing-safe Bearer key verification (SEC-06); fail-closed when unset.
    const result = verifyApiKey(req);
    if (!result.ok) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        return res.status(result.status).json({ error: result.error });
    }
    return next();
}, async (req, res) => {

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const results = [];
    const errors = [];

    try {
        await new Promise((resolve, reject) => {
            fs.createReadStream(req.file.path)
                .pipe(csv())
                .on('data', (row) => {
                    // Validate each row (shared parser accepts both the legacy
                    // `severity_score` column and the notebook's dual-track
                    // `model_severity` / `physics_severity` columns).
                    const parsed = parseCsvForecastRow(row, results.length + errors.length + 1);
                    if (!parsed.ok) {
                        errors.push(parsed.error);
                        return;
                    }
                    results.push(parsed.value);
                })
                .on('end', resolve)
                .on('error', reject);
        });

        if (results.length === 0) {
            fs.unlinkSync(req.file.path);
            return res.status(422).json({ 
                error: 'No valid rows found in CSV', 
                validation_errors: errors 
            });
        }

        const predictionDate = results[0].prediction_date;

        // Replace all rows for this prediction_date (delete + insert in one
        // store-level operation; Supabase runs it in a transaction).
        await getForecastStore().replaceForecastsForPredictionDate(predictionDate, results);

        // Generate advisories for each inserted row
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
                advisories.push({
                    district_id: row.district_id,
                    advisory
                });
            } catch (e) {
                console.warn(`⚠️ Advisory generation failed for district ${row.district_id}: ${e.message}`);
            }
        }

        // Cleanup uploaded file
        fs.unlinkSync(req.file.path);

        console.log(`✅ Forecast update: ${results.length} records ingested (${predictionDate})`);
        if (errors.length > 0) {
            console.warn(`⚠️ ${errors.length} rows skipped due to validation`);
        }

        res.json({
            status: 'success',
            message: 'Forecasts updated successfully',
            records_updated: results.length,
            records_skipped: errors.length,
            prediction_date: predictionDate,
            validation_errors: errors.slice(0, 10),
            advisories
        });

    } catch (error) {
        // Cleanup on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        console.error('❌ Forecast update failed:', error.message);
        clientError(res, error, { scope: 'backend/forecasts', fallback: 'Internal server error' });
    }
});

// ─────────────────────────────────────────────────────────
// POST /api/v1/forecasts/ingest-csv
// Directly ingests CSV data from raw request body or JSON payload
// ─────────────────────────────────────────────────────────
router.post('/ingest-csv', async (req, res) => {
    const auth = verifyApiKey(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error });
    }

    try {
        let csvData = '';
        if (typeof req.body === 'string') {
            csvData = req.body;
        } else if (req.body && typeof req.body.csv === 'string') {
            csvData = req.body.csv;
        } else if (Buffer.isBuffer(req.body)) {
            csvData = req.body.toString('utf-8');
        }

        if (!csvData || !csvData.trim()) {
            return res.status(400).json({ error: 'Missing or empty CSV payload in body' });
        }

        const mode = req.query.mode === 'append' ? 'append' : 'replace';
        const strict = req.query.strict !== 'false';

        const result = await ingestForecastCsv(csvData, { mode, strict });
        res.json({
            status: 'success',
            message: 'CSV forecast ingested into Firestore successfully',
            ...result
        });
    } catch (error) {
        clientError(res, error, { status: 400, scope: 'backend/forecasts', fallback: 'CSV ingestion failed' });
    }
});

// ─────────────────────────────────────────────────────────
// GET /api/v1/forecasts/metadata
// Returns the newest ingested Kaggle prediction date and source.
// ─────────────────────────────────────────────────────────
router.get('/metadata', async (req, res) => {
    try {
        const predictionDate = await getForecastStore().getLatestPredictionDate();
        const ingestionTimestamp = await getForecastStore().getLatestIngestionTimestamp();
        const now = new Date();
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.json({
            prediction_date: predictionDate,
            ingestion_timestamp: ingestionTimestamp,
            data_source: metadataDataSource(),
            notebook_source: 'ashifahmedshuvo/hazardnet-auto-forecast-pipeline',
            datasets: metadataDatasets(),
            generated_at: now.toISOString(),
        });
    } catch (error) {
        clientError(res, error, { scope: 'backend/forecasts' });
    }
});

// ─────────────────────────────────────────────────────────
// GET /api/v1/forecasts?district_id=1&horizon=7_days
// Returns the latest forecast for a specific district
// ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    const { district_id, horizon } = req.query;

    if (!district_id || !horizon) {
        return res.status(400).json({ error: 'Missing district_id or horizon parameter' });
    }
    if (!VALID_HORIZONS.includes(horizon)) {
        return res.status(400).json({ error: `Invalid horizon. Use: ${VALID_HORIZONS.join(', ')}` });
    }

    try {
        const forecast = await getForecastStore().getLatestForecastByDistrict(parseInt(district_id), horizon);

        if (!forecast) {
            return res.status(404).json({ error: 'No forecast found' });
        }

        // Apply severity binning (from 3-hazardnet-with-severity.ipynb)
        let severity_bin, severity_color;
        if (forecast.severity_score >= 0.67) {
            severity_bin = 'High'; severity_color = '#EF4444';
        } else if (forecast.severity_score >= 0.34) {
            severity_bin = 'Moderate'; severity_color = '#F59E0B';
        } else {
            severity_bin = 'Low'; severity_color = '#10B981';
        }

        // Apply confidence binning
        let confidence_bin;
        if (forecast.confidence >= 0.85) confidence_bin = 'Certain';
        else if (forecast.confidence >= 0.70) confidence_bin = 'Probable';
        else confidence_bin = 'Uncertain';

        res.json({
            prediction: {
                district_id: forecast.district_id,
                district_name: forecast.district_name,
                hazard_type: forecast.hazard_type,
                confidence: forecast.confidence,
                confidence_bin: confidence_bin,
                severity_score: forecast.severity_score,
                severity_bin: severity_bin,
                severity_color: severity_color,
                target_date: forecast.target_date,
                prediction_date: forecast.prediction_date
            },
            metadata: {
                horizon: forecast.horizon,
                model_version: 'HazardNet_FP32_v1.0',
                data_source: 'GEE + Open-Meteo Deterministic Forecast'
            }
        });
    } catch (error) {
        clientError(res, error, { scope: 'backend/forecasts' });
    }
});

// ─────────────────────────────────────────────────────────
// GET /api/v1/forecasts/bulk?horizon=7_days
// Returns forecasts for ALL 64 districts (for Mapbox heatmap)
// ──────────────────────────────��──────────────────────────
router.get('/bulk', async (req, res) => {
    // Shared with the Vercel handler (api/v1/forecasts/bulk.js) — identical
    // validation and response shape on both runtimes.
    const parsed = parseBulkQuery(req.query);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }
    const { horizon } = parsed;

    try {
        // Latest row per district for this horizon (grouping happens in the
        // store: JS grouping on Firestore, DISTINCT ON in Supabase).
        const rows = await getForecastStore().getLatestForecastsByHorizon(horizon);

        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.json({
            horizon: horizon,
            count: rows.length,
            generated_at: new Date().toISOString(),
            data_source: metadataDataSource(),
            forecasts: rows
        });
    } catch (error) {
        clientError(res, error, { scope: 'backend/forecasts' });
    }
});

// ─────────────────────────────────────────────────────────
// GET /api/v1/forecasts/history?from=YYYY-MM-DD&to=YYYY-MM-DD
//   &horizon=7_days|15_days (optional) &district_id=N (optional)
//   &format=json|csv (optional, default json)
// Serves the forecast history accumulating in the store (backlog #6 — the
// guide's Phase 6, adapted: history lives in the forecast store + the weekly
// GitHub-Release CSV archive instead of backend/data/ snapshots).
// Defaults: last 30 days ending today. Max window: 90 days (bounds cost).
// format=csv emits the ingest-compatible dual-track column set, so any window
// can be re-exported as an archive artifact.
// ─────────────────────────────────────────────────────────
router.get('/history', async (req, res) => {
    // Shared with the Vercel handler (api/v1/forecasts/history.js) —
    // identical windowing, validation, and CSV export on both runtimes.
    const parsed = parseHistoryQuery(req.query);
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }
    const { from: fromDate, to: toDate, horizon, districtId, format } = parsed;

    try {
        const rows = await getForecastStore().getForecastHistory({
            from: fromDate, to: toDate, horizon, districtId
        });

        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="hazardnet_forecasts_${fromDate}_${toDate}.csv"`);
            return res.status(200).send(historyRowsToCsv(rows));
        }

        res.json({
            from: fromDate,
            to: toDate,
            horizon,
            district_id: districtId,
            count: rows.length,
            generated_at: new Date().toISOString(),
            forecasts: rows
        });
    } catch (error) {
        clientError(res, error, { scope: 'backend/forecasts' });
    }
});

export default router;

