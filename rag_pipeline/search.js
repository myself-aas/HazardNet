import fs from 'fs';
import path from 'path';

const RAG_DIR = typeof __dirname !== 'undefined' ? __dirname : path.resolve(process.cwd(), 'rag_pipeline');

export const GOVT_OFFICE_DIRECTORY = [
  {
    agency: 'Department of Agricultural Extension (DAE)',
    helpline: '16123 (Krishi Call Centre)',
    website: 'http://www.dae.gov.bd',
    role: 'Crop protection, seed varieties, agronomic advisories, fertilizer and flood contingency'
  },
  {
    agency: 'Department of Livestock Services (DLS)',
    helpline: '16333 (Pranishampad Seva)',
    website: 'http://www.dls.gov.bd',
    role: 'Veterinary emergency response, vaccination schedules, animal shelter & fodder preservation'
  },
  {
    agency: 'Department of Fisheries (DoF)',
    helpline: '02-223382861',
    website: 'http://www.fisheries.gov.bd',
    role: 'Aquaculture flood safety, pond netting, fish disease management, fingerling replenishment'
  },
  {
    agency: 'Bangladesh Meteorological Department (BMD)',
    helpline: '1090 (Disaster Early Warning)',
    website: 'http://www.bmd.gov.bd',
    role: 'Weather forecasting, cyclone warning signals, rainfall monitoring, heatwave alerts'
  },
  {
    agency: 'Bangladesh Water Development Board (BWDB)',
    helpline: '1090 (Flood Forecasting and Warning Centre)',
    website: 'http://www.ffwc.gov.bd',
    role: 'River gauge monitoring, danger level warnings, flood inundation forecasting'
  },
  {
    agency: 'National Emergency Service',
    helpline: '999',
    website: 'https://nhd.gov.bd',
    role: 'Immediate evacuation, ambulance, rescue and police assistance during catastrophic disasters'
  }
];

let cachedKb = null;
let cachedBaselines = null;

function loadKnowledgeBase() {
  if (cachedKb) return cachedKb;
  try {
    const kbPath = path.join(RAG_DIR, 'agent_knowledge_base.json');
    if (fs.existsSync(kbPath)) {
      cachedKb = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
      return cachedKb;
    }
  } catch (err) {
    console.warn('[searchRAG] Failed to load agent_knowledge_base.json:', err.message);
  }
  return { documents: [] };
}

function loadDistrictBaselines() {
  if (cachedBaselines) return cachedBaselines;
  try {
    const baselinesPath = path.join(RAG_DIR, 'district_economic_baselines.json');
    if (fs.existsSync(baselinesPath)) {
      const data = JSON.parse(fs.readFileSync(baselinesPath, 'utf8'));
      cachedBaselines = data.districts || [];
      return cachedBaselines;
    }
  } catch (err) {
    console.warn('[searchRAG] Failed to load district_economic_baselines.json:', err.message);
  }
  return [];
}

/**
 * Search the RAG knowledge base for relevant documents and district context.
 *
 * @param {string} query - The search query string
 * @param {Object} [options={}] - Search options
 * @param {string} [options.district] - Optional district filter/context
 * @param {number} [options.limit=5] - Maximum number of results
 * @returns {{ results: Array<{ id: string, title: string, category: string, content: string, relevanceScore: number }>, districtBaseline: Object|null }}
 */
export function searchRAG(query = '', options = {}) {
  const safeQuery = typeof query === 'string' ? query.toLowerCase().trim() : '';
  const districtName = typeof options?.district === 'string' ? options.district.trim().toLowerCase() : '';
  const limit = options?.limit || 5;

  const kb = loadKnowledgeBase();
  const baselines = loadDistrictBaselines();

  // Find district baseline by matching name or id
  let districtBaseline = null;
  if (districtName) {
    districtBaseline = baselines.find(
      (d) => (d.name && d.name.toLowerCase() === districtName) ||
             (d.id && d.id.toLowerCase() === districtName)
    ) || null;
  }

  // Tokenize query into search terms (ignore very short stop words)
  const queryTokens = safeQuery
    .split(/[^a-z0-9_-]+/)
    .filter((t) => t.length > 2);

  const scoredDocs = [];

  for (const doc of (kb.documents || [])) {
    const title = (doc.title || '').toLowerCase();
    const category = (doc.category || '').toLowerCase();
    const content = (doc.content || '').toLowerCase();
    const id = (doc.id || '').toLowerCase();

    let score = 0;

    for (const token of queryTokens) {
      if (title.includes(token)) score += 3.0;
      if (id.includes(token)) score += 2.0;
      if (category.includes(token)) score += 1.5;
      if (content.includes(token)) {
        // Count occurrences up to a cap
        const occurrences = content.split(token).length - 1;
        score += Math.min(occurrences * 0.5, 4.0);
      }
    }

    // Boost if district matches in content
    if (districtName && (content.includes(districtName) || title.includes(districtName))) {
      score += 2.0;
    }

    if (score > 0) {
      const scoreVal = Math.round(score * 100) / 100;
      scoredDocs.push({
        id: doc.id,
        title: doc.title || doc.id,
        category: doc.category || 'General',
        content: doc.content || '',
        score: scoreVal,
        relevanceScore: scoreVal
      });
    }
  }

  // Sort by score descending
  scoredDocs.sort((a, b) => b.score - a.score);

  // If no matches found but query exists, return top documents as fallback
  let results = scoredDocs.slice(0, limit);
  if (results.length === 0 && (kb.documents || []).length > 0) {
    results = (kb.documents || []).slice(0, 3).map((d) => ({
      id: d.id,
      title: d.title || d.id,
      category: d.category || 'General',
      content: d.content || '',
      score: 0.1,
      relevanceScore: 0.1
    }));
  }

  return {
    results,
    districtBaseline
  };
}
