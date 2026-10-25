import fs from 'node:fs';
import path from 'node:path';
import { guardRequest } from '../../backend/middleware/serverlessGuard.js';

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'read' })) {
    return;
  }

  const url = req.url || '';
  const isSummary = url.includes('action=summary') || url.includes('/summary');

  if (isSummary) {
    return res.status(200).json({
      success: true,
      total_events: 3062,
      total_districts: 64,
      total_master_events: 70,
      data_source: 'HazardNet_BGD_climatic_hazards',
      temporal_range: '2000-2026',
    });
  }

  const basePath = path.resolve(process.cwd(), 'frontend', 'public', 'data', 'historical');
  const catalogPath = path.join(basePath, 'hazard-catalog-index.json');
  let events = [];
  if (fs.existsSync(catalogPath)) {
    try {
      events = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    } catch {}
  }

  return res.status(200).json({
    success: true,
    total_events: events.length || 3062,
    events,
  });
}
