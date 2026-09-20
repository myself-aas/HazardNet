import express from 'express';
import {
  getEventsSummary,
  getDistrictEvents,
  getDivisionEvents,
  getHazardEvents,
  getLatestForecastsData,
  ALL_DIVISIONS_LIST,
  ALL_HAZARDS_LIST
} from '../services/eventsService.js';
import { clientError } from '../utils/clientError.js';

const router = express.Router();

/**
 * GET /api/v1/events/summary
 * National summary of 2000-2026 climatic hazards
 */
router.get('/summary', async (req, res) => {
  try {
    const summary = await getEventsSummary();
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      status: 'success',
      data: summary,
    });
  } catch (error) {
    clientError(res, error, { scope: 'backend/events/summary' });
  }
});

/**
 * GET /api/v1/events/divisions
 * List all divisions with metadata
 */
router.get('/divisions', async (req, res) => {
  try {
    res.json({
      status: 'success',
      divisions: ALL_DIVISIONS_LIST,
    });
  } catch (error) {
    clientError(res, error, { scope: 'backend/events/divisions' });
  }
});

/**
 * GET /api/v1/events/hazards
 * List all hazards with metadata
 */
router.get('/hazards', async (req, res) => {
  try {
    res.json({
      status: 'success',
      hazards: ALL_HAZARDS_LIST,
    });
  } catch (error) {
    clientError(res, error, { scope: 'backend/events/hazards' });
  }
});

/**
 * GET /api/v1/events/district/:id
 * Historical events and forecast for a specific district
 */
router.get('/district/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'District parameter required' });
    const data = await getDistrictEvents(id);
    res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    clientError(res, error, { scope: 'backend/events/district' });
  }
});

/**
 * GET /api/v1/events/division/:id
 * Historical events and forecasts for all districts in a division
 */
router.get('/division/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Division parameter required' });
    const data = await getDivisionEvents(id);
    res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    clientError(res, error, { scope: 'backend/events/division' });
  }
});

/**
 * GET /api/v1/events/hazard/:id
 * Historical events and active forecasts for a specific hazard
 */
router.get('/hazard/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Hazard parameter required' });
    const data = await getHazardEvents(id);
    res.json({
      status: 'success',
      data,
    });
  } catch (error) {
    clientError(res, error, { scope: 'backend/events/hazard' });
  }
});

/**
 * GET /api/v1/events/forecasts-latest
 * Raw parsed rows from data/hazardnet_forecasts_latest.csv
 */
router.get('/forecasts-latest', async (req, res) => {
  try {
    const forecasts = await getLatestForecastsData();
    res.json({
      status: 'success',
      count: forecasts.length,
      forecasts,
    });
  } catch (error) {
    clientError(res, error, { scope: 'backend/events/forecasts-latest' });
  }
});

export default router;
