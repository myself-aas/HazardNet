/**
 * backend/routes/historical.js
 *
 * Implements Historical API Endpoints (TASK-016, TRD §2.5, §5.2, §6.1, §6.4)
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { generateGlideLinks } from '../utils/glideResolver.js';
import { lookupDistrict } from '../utils/advisoryMapper.js';

const router = express.Router();

// In-memory cache for historical JSON datasets
let cachedHistoricalData = null;

function loadHistoricalDatasets() {
  if (cachedHistoricalData) return cachedHistoricalData;

  const basePath = path.resolve(process.cwd(), 'frontend', 'public', 'data', 'historical');

  const readJson = (filename, fallback = []) => {
    const p = path.join(basePath, filename);
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch (err) {
        console.warn(`[historical] Failed to parse ${filename}:`, err.message);
      }
    }
    return fallback;
  };

  cachedHistoricalData = {
    vulnerability: readJson('districts-vulnerability.json', []),
    trends: readJson('temporal-trends.json', []),
    distribution: readJson('hazard-distribution.json', []),
    masterEvents: readJson('events-master.json', []),
    catalogIndex: readJson('hazard-catalog-index.json', []),
  };

  return cachedHistoricalData;
}

/** Test hook: clear dataset cache */
export function resetHistoricalCache() {
  cachedHistoricalData = null;
}

/**
 * GET /api/v1/historical/summary
 * Headline counts: 3,324 raw occurrences, 3,062 clean rows, 64 districts, 8 divisions, 70 master events.
 */
router.get('/summary', (req, res) => {
  const data = loadHistoricalDatasets();
  res.json({
    ok: true,
    raw_occurrences: 3324,
    clean_occurrences: data.catalogIndex.length || 3062,
    districts_count: data.vulnerability.length || 64,
    divisions_count: 8,
    master_events_count: data.masterEvents.length || 70,
    temporal_range: '2000-2026',
    data_source: 'HazardNet_BGD_climatic_hazards',
  });
});

/**
 * GET /api/v1/historical/vulnerability
 * Returns 64 districts sorted by vulnerability rank.
 */
router.get('/vulnerability', (req, res) => {
  const data = loadHistoricalDatasets();
  res.json({
    ok: true,
    count: data.vulnerability.length,
    districts: data.vulnerability,
  });
});

/**
 * GET /api/v1/historical/trends
 * Returns 2000–2026 annual trend and multi-hazard breakdown.
 */
router.get('/trends', (req, res) => {
  const data = loadHistoricalDatasets();
  res.json({
    ok: true,
    temporal_trends: data.trends,
    hazard_distribution: data.distribution,
  });
});

/**
 * GET /api/v1/historical/hazards
 * Search and filter 3,062 historical disaster records.
 * Query params: district, division, hazard_type, year, glide, page, limit
 */
router.get('/hazards', (req, res) => {
  const data = loadHistoricalDatasets();
  const {
    district,
    division,
    hazard_type,
    year,
    glide,
    page = 1,
    limit = 20,
  } = req.query;

  let results = [...data.catalogIndex];

  if (district) {
    const dLower = String(district).toLowerCase().trim();
    results = results.filter((r) => String(r.district).toLowerCase().includes(dLower));
  }

  if (division) {
    const divLower = String(division).toLowerCase().trim();
    results = results.filter((r) => {
      const match = lookupDistrict(r.district);
      return match && String(match.division).toLowerCase() === divLower;
    });
  }

  if (hazard_type) {
    const hLower = String(hazard_type).toLowerCase().trim();
    results = results.filter((r) => String(r.hazard_type).toLowerCase().includes(hLower));
  }

  if (year) {
    const yInt = parseInt(year, 10);
    if (!Number.isNaN(yInt)) {
      results = results.filter((r) => r.year === yInt);
    }
  }

  if (glide) {
    const gLower = String(glide).toLowerCase().trim();
    results = results.filter((r) => String(r.glide).toLowerCase().includes(gLower));
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const total = results.length;
  const pages = Math.ceil(total / limitNum) || 1;
  const start = (pageNum - 1) * limitNum;
  const paginated = results.slice(start, start + limitNum);

  res.json({
    ok: true,
    total,
    page: pageNum,
    limit: limitNum,
    pages,
    records: paginated,
  });
});

/**
 * GET /api/v1/historical/events/:id
 * Returns disaster narrative and multilateral links for a specific event or GLIDE.
 */
router.get('/events/:id', (req, res) => {
  const data = loadHistoricalDatasets();
  const idOrGlide = String(req.params.id).trim();

  // Search master events first
  const master = data.masterEvents.find(
    (e) => String(e.event_id) === idOrGlide || String(e.glide).toLowerCase() === idOrGlide.toLowerCase()
  );

  if (master) {
    return res.json({
      ok: true,
      event: master,
    });
  }

  // Fallback search in catalog index
  const catalogItem = data.catalogIndex.find(
    (e) => String(e.id) === idOrGlide || String(e.glide).toLowerCase() === idOrGlide.toLowerCase()
  );

  if (catalogItem) {
    let links = null;
    try {
      links = generateGlideLinks(catalogItem.glide);
    } catch {}

    return res.json({
      ok: true,
      event: {
        event_id: catalogItem.id,
        glide: catalogItem.glide,
        date: catalogItem.date,
        year: catalogItem.year,
        hazard_type: catalogItem.hazard_type,
        location_districts: [catalogItem.district],
        full_description: catalogItem.summary,
        gee_start: catalogItem.gee_start,
        gee_end: catalogItem.gee_end,
        validated_affected: catalogItem.validated_affected,
        links,
      },
    });
  }

  return res.status(404).json({
    error: 'Disaster event not found',
    event_id: idOrGlide,
  });
});

export default router;
