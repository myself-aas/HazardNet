import express from 'express';
import path from 'path';
import multer from 'multer';
import { verifyApiKey } from '../utils/apiKeyAuth.js';
import csv from 'csv-parser';
import fs from 'fs';
import { db, collection, getDocs, query, where, doc, setDoc, deleteDoc, writeBatch } from '../db.js';
import { generateAdvisory } from '../services/advisoryAgent.js';
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


const VALID_HORIZONS = ['7_days', '15_days'];
const VALID_HAZARDS = [
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone'
];

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
                    // Validate each row
                    if (!VALID_HORIZONS.includes(row.horizon)) {
                        errors.push(`Row ${results.length + 1}: Invalid horizon "${row.horizon}"`);
                        return;
                    }
                    if (!VALID_HAZARDS.includes(row.hazard_type)) {
                        errors.push(`Row ${results.length + 1}: Invalid hazard "${row.hazard_type}"`);
                        return;
                    }

                    const severity = parseFloat(row.severity_score);
                    const confidence = parseFloat(row.confidence);

                    if (isNaN(severity) || severity < 0 || severity > 1) {
                        errors.push(`Row ${results.length + 1}: Invalid severity ${row.severity_score}`);
                        return;
                    }
                    if (isNaN(confidence) || confidence < 0 || confidence > 1) {
                        errors.push(`Row ${results.length + 1}: Invalid confidence ${row.confidence}`);
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
        const forecastsRef = collection(db, 'forecasts');

        // Delete old predictions for this prediction_date
        const qOld = query(forecastsRef, where('prediction_date', '==', predictionDate));
        const oldSnap = await getDocs(qOld);
        const batch = writeBatch(db);
        oldSnap.forEach((d) => {
            batch.delete(d.ref);
        });

        // Insert new records
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
        res.status(500).json({ error: 'Internal server error', detail: error.message });
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
        const q = query(
            collection(db, 'forecasts'),
            where('district_id', '==', parseInt(district_id)),
            where('horizon', '==', horizon)
        );
        const querySnapshot = await getDocs(q);
        const rows = [];
        querySnapshot.forEach((doc) => {
            rows.push(doc.data());
        });

        if (rows.length === 0) {
            return res.status(404).json({ error: 'No forecast found' });
        }

        // Sort descending by prediction_date
        rows.sort((a, b) => new Date(b.prediction_date) - new Date(a.prediction_date));
        const forecast = rows[0];

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
        res.status(500).json({ error: error.message });
    }
});

// ─────────────────────────────────────────────────────────
// GET /api/v1/forecasts/bulk?horizon=7_days
// Returns forecasts for ALL 64 districts (for Mapbox heatmap)
// ─────────────────────────────────────────────────────────
router.get('/bulk', async (req, res) => {
    const { horizon } = req.query;

    if (!horizon || !VALID_HORIZONS.includes(horizon)) {
        return res.status(400).json({ error: `Invalid horizon. Use: ${VALID_HORIZONS.join(', ')}` });
    }

    try {
        const q = query(
            collection(db, 'forecasts'),
            where('horizon', '==', horizon)
        );
        const querySnapshot = await getDocs(q);
        const allRows = [];
        querySnapshot.forEach((doc) => {
            allRows.push(doc.data());
        });

        // Group by district_id, keeping latest prediction_date
        const districtMap = new Map();
        for (const row of allRows) {
            const existing = districtMap.get(row.district_id);
            if (!existing || new Date(row.prediction_date) > new Date(existing.prediction_date)) {
                districtMap.set(row.district_id, row);
            }
        }
        const rows = Array.from(districtMap.values());

        res.json({
            horizon: horizon,
            count: rows.length,
            generated_at: new Date().toISOString(),
            forecasts: rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;

