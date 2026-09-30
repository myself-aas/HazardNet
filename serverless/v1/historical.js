// Vercel Serverless Function — GET /api/v1/historical
import fs from 'node:fs';
import path from 'node:path';
import { generateGlideLinks } from '../../backend/utils/glideResolver.js';
import { lookupDistrict } from '../../backend/utils/advisoryMapper.js';
import { guardRequest } from '../../backend/middleware/serverlessGuard.js';

let cache = null;

function loadData() {
  if (cache) return cache;
  const basePath = path.resolve(process.cwd(), 'frontend', 'public', 'data', 'historical');
  const read = (f) => {
    const p = path.join(basePath, f);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
  };

  cache = {
    vulnerability: read('districts-vulnerability.json'),
    trends: read('temporal-trends.json'),
    distribution: read('hazard-distribution.json'),
    masterEvents: read('events-master.json'),
    catalogIndex: read('hazard-catalog-index.json'),
  };
  return cache;
}

export function serveHistorical(req, res) {
  const data = loadData();
  const query = req.query || (req.url && req.url.includes('?') ? Object.fromEntries(new URL(req.url, 'http://localhost').searchParams) : {});
  const { district, division, hazard_type, year, glide, page = 1, limit = 20, id } = query;
  const targetResource = query.resource || query.action || 'hazards';

  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');

  if (targetResource === 'summary') {
    return res.status(200).json({
      ok: true,
      success: true,
      raw_occurrences: 3324,
      total_events: data.catalogIndex.length || 3062,
      clean_occurrences: data.catalogIndex.length || 3062,
      total_districts: data.vulnerability.length || 64,
      districts_count: data.vulnerability.length || 64,
      divisions_count: 8,
      total_master_events: data.masterEvents.length || 70,
      master_events_count: data.masterEvents.length || 70,
      temporal_range: '2000-2026',
      year_span: '2000-2026',
    });
  }

  if (targetResource === 'vulnerability') {
    return res.status(200).json({
      ok: true,
      count: data.vulnerability.length,
      districts: data.vulnerability,
    });
  }

  if (targetResource === 'trends') {
    return res.status(200).json({
      ok: true,
      temporal_trends: data.trends,
      hazard_distribution: data.distribution,
    });
  }

  if (targetResource === 'events' || id) {
    const queryId = String(id || req.query.event_id || '').trim();
    const event = data.masterEvents.find(
      (e) => String(e.event_id) === queryId || String(e.glide).toLowerCase() === queryId.toLowerCase()
    );
    if (event) return res.status(200).json({ ok: true, event });

    const cat = data.catalogIndex.find(
      (e) => String(e.id) === queryId || String(e.glide).toLowerCase() === queryId.toLowerCase()
    );
    if (cat) {
      return res.status(200).json({
        ok: true,
        event: {
          event_id: cat.id,
          glide: cat.glide,
          date: cat.date,
          year: cat.year,
          hazard_type: cat.hazard_type,
          location_districts: [cat.district],
          full_description: cat.summary,
          links: generateGlideLinks(cat.glide),
        },
      });
    }
    return res.status(404).json({ error: 'Event not found', id: queryId });
  }

  // Default: hazards catalog search
  let records = [...data.catalogIndex];
  if (district) {
    const dLower = String(district).toLowerCase().trim();
    records = records.filter((r) => String(r.district).toLowerCase().includes(dLower));
  }
  if (division) {
    const divLower = String(division).toLowerCase().trim();
    records = records.filter((r) => {
      const match = lookupDistrict(r.district);
      return match && String(match.division).toLowerCase() === divLower;
    });
  }
  if (hazard_type) {
    const hLower = String(hazard_type).toLowerCase().trim();
    records = records.filter((r) => String(r.hazard_type).toLowerCase().includes(hLower));
  }
  if (year) {
    const yInt = parseInt(year, 10);
    if (!Number.isNaN(yInt)) records = records.filter((r) => r.year === yInt);
  }
  if (glide) {
    const gLower = String(glide).toLowerCase().trim();
    records = records.filter((r) => String(r.glide).toLowerCase().includes(gLower));
  }

  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const total = records.length;
  const pages = Math.ceil(total / l) || 1;
  const paginated = records.slice((p - 1) * l, p * l);

  return res.status(200).json({
    ok: true,
    total,
    page: p,
    limit: l,
    pages,
    records: paginated,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (guardRequest(req, res, { bucket: 'read' })) return;
  return serveHistorical(req, res);
}
