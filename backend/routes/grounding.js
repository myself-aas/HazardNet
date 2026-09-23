import express from 'express';
import { executeMapsGrounding, executeSearchGrounding } from '../utils/gemini_grounding.js';
import { getDistrictCoordinates } from '../utils/districtCoordinates.js';

const router = express.Router();

/**
 * POST /api/grounding/maps
 * Uses gemini-3.5-flash with googleMaps tool
 */
router.post('/maps', async (req, res) => {
  try {
    const { query, district, userCoordinates, contextText } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query string is required' });
    }

    const result = await executeMapsGrounding({
      query: query.trim(),
      district: district ? String(district).trim() : undefined,
      userCoordinates,
      contextText
    });

    res.json(result);
  } catch (err) {
    console.error('[Grounding Route] Maps Error:', err);
    res.status(500).json({ error: 'Failed to execute Maps Grounding', details: err.message });
  }
});

/**
 * POST /api/grounding/search
 * Uses gemini-3.5-flash with googleSearch tool
 */
router.post('/search', async (req, res) => {
  try {
    const { query, district, contextText } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query string is required' });
    }

    const result = await executeSearchGrounding({
      query: query.trim(),
      district: district ? String(district).trim() : undefined,
      contextText
    });

    res.json(result);
  } catch (err) {
    console.error('[Grounding Route] Search Error:', err);
    res.status(500).json({ error: 'Failed to execute Search Grounding', details: err.message });
  }
});

/**
 * GET /api/grounding/district-facilities/:id
 * Retrieve Google Maps grounded emergency and agronomic facilities for a district
 */
router.get('/district-facilities/:id', async (req, res) => {
  try {
    const districtId = req.params.id;
    const coords = getDistrictCoordinates(districtId);
    const query = `Find nearest Upazila Agriculture Office (DAE), veterinary hospital, and cyclone/flood shelters in ${coords.name || districtId}, Bangladesh`;

    const result = await executeMapsGrounding({
      query,
      district: coords.name || districtId,
      userCoordinates: { latitude: coords.latitude, longitude: coords.longitude }
    });

    res.json(result);
  } catch (err) {
    console.error('[Grounding Route] District Facilities Error:', err);
    res.status(500).json({ error: 'Failed to retrieve district facilities', details: err.message });
  }
});

/**
 * GET /api/grounding/district-updates/:id
 * Retrieve Google Search grounded live alerts and weather bulletins for a district
 */
router.get('/district-updates/:id', async (req, res) => {
  try {
    const districtId = req.params.id;
    const coords = getDistrictCoordinates(districtId);
    const query = `Latest flood status, rainfall warnings, and agricultural advisories for ${coords.name || districtId}, Bangladesh`;

    const result = await executeSearchGrounding({
      query,
      district: coords.name || districtId
    });

    res.json(result);
  } catch (err) {
    console.error('[Grounding Route] District Updates Error:', err);
    res.status(500).json({ error: 'Failed to retrieve district updates', details: err.message });
  }
});

export default router;
