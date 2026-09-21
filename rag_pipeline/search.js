import fs from 'node:fs';
import path from 'node:path';

const RAG_DIR = typeof __dirname !== 'undefined' ? __dirname : path.resolve(process.cwd(), 'rag_pipeline');
const KB_PATH = path.join(RAG_DIR, 'agent_knowledge_base.json');
const BASELINES_PATH = path.join(RAG_DIR, 'district_economic_baselines.json');

let cachedKb = null;
let cachedBaselines = null;

function loadKnowledgeBase() {
  if (cachedKb) return cachedKb;
  try {
    if (fs.existsSync(KB_PATH)) {
      cachedKb = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
      return cachedKb;
    }
  } catch (err) {
    console.warn('[searchRAG] Failed to load knowledge base:', err.message);
  }
  return { documents: [] };
}

function loadBaselines() {
  if (cachedBaselines) return cachedBaselines;
  try {
    if (fs.existsSync(BASELINES_PATH)) {
      const data = JSON.parse(fs.readFileSync(BASELINES_PATH, 'utf8'));
      cachedBaselines = data.districts || [];
      return cachedBaselines;
    }
  } catch (err) {
    console.warn('[searchRAG] Failed to load district baselines:', err.message);
  }
  return [];
}

export const GOVT_OFFICE_DIRECTORY = [
  {
    department: 'Department of Agricultural Extension (DAE)',
    service: 'Krishi Call Centre / Agronomic Advisory & Crop Protection',
    helpline: '16123',
    website: 'http://www.dae.gov.bd',
    officer: 'Upazila Agriculture Officer (UAO) / Sub-Assistant Agriculture Officer (SAAO)'
  },
  {
    department: 'Department of Livestock Services (DLS)',
    service: 'Pranishampad Helpline / Veterinary Emergency & Vaccine Logistics',
    helpline: '16333',
    website: 'http://www.dls.gov.bd',
    officer: 'Upazila Livestock Officer (ULO)'
  },
  {
    department: 'Department of Fisheries (DoF)',
    service: 'National Fisheries Advisory & Aquaculture Disease Response',
    helpline: '02-223382881',
    website: 'http://www.fisheries.gov.bd',
    officer: 'Upazila Fisheries Officer (UFO)'
  },
  {
    department: 'Bangladesh Meteorological Department (BMD)',
    service: 'Weather, Cyclone Early Warning & Marine Bulletins',
    helpline: '1090',
    website: 'http://www.bmd.gov.bd',
    officer: 'Duty Meteorologist'
  },
  {
    department: 'Bangladesh Water Development Board (BWDB)',
    service: 'Flood Forecasting and Warning Centre (FFWC)',
    helpline: '1090',
    website: 'http://www.bwdb.gov.bd',
    officer: 'Executive Engineer, FFWC'
  },
  {
    department: 'Ministry of Disaster Management and Relief (MoDMR)',
    service: 'Disaster Warning & National Emergency Operations',
    helpline: '999 / 1090',
    website: 'http://www.modmr.gov.bd',
    officer: 'District Relief & Rehabilitation Officer (DRRO)'
  }
];

export function searchRAG(query = '', options = {}) {
  const kb = loadKnowledgeBase();
  const baselines = loadBaselines();
  const documents = kb.documents || [];

  const rawQuery = String(query || '').toLowerCase();
  const queryTokens = rawQuery
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);

  // 1. Locate district baseline if specified or mentioned
  let districtBaseline = null;
  const targetDistrict = options.district ? String(options.district).trim().toLowerCase() : null;

  if (targetDistrict) {
    districtBaseline = baselines.find(d => 
      (d.name && d.name.toLowerCase() === targetDistrict) ||
      (d.id && d.id.toLowerCase() === targetDistrict)
    ) || null;
  }

  if (!districtBaseline && queryTokens.length > 0) {
    districtBaseline = baselines.find(d => 
      (d.name && rawQuery.includes(d.name.toLowerCase())) ||
      (d.id && rawQuery.includes(d.id.toLowerCase()))
    ) || null;
  }

  // 2. Score documents
  const scored = [];
  for (const doc of documents) {
    const titleLower = String(doc.title || '').toLowerCase();
    const contentLower = String(doc.content || '').toLowerCase();
    const categoryLower = String(doc.category || '').toLowerCase();
    const idLower = String(doc.id || '').toLowerCase();

    let matches = 0;
    for (const token of queryTokens) {
      if (titleLower.includes(token)) matches += 3;
      if (categoryLower.includes(token)) matches += 2;
      if (idLower.includes(token)) matches += 2;
      if (contentLower.includes(token)) matches += 1;
    }

    if (matches > 0) {
      // Calculate normalized score between 0.50 and 0.98
      const rawScore = matches / Math.max(queryTokens.length, 1);
      const score = Math.min(0.98, Math.max(0.55, 0.5 + rawScore * 0.1));
      scored.push({
        id: doc.id,
        title: doc.title,
        category: doc.category,
        content: doc.content,
        score: Math.round(score * 100) / 100
      });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // If no direct matches, return top 3 default institutional guides
  let results = scored.slice(0, options.topK || 5);
  if (results.length === 0 && documents.length > 0) {
    results = documents.slice(0, 3).map((d, i) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      content: d.content,
      score: 0.60 - i * 0.05
    }));
  }

  return {
    results,
    districtBaseline
  };
}
