import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ragModuleFile = fileURLToPath(import.meta.url);
const ragModuleDir = path.dirname(ragModuleFile);

const RAG_DIR = ragModuleDir;
const KB_PATH = path.join(RAG_DIR, 'agent_knowledge_base.json');
const BASELINES_PATH = path.join(RAG_DIR, 'district_economic_baselines.json');
const SPATIAL_MAP_PATH = path.join(RAG_DIR, 'references', '05_spatial_context', 'district_division_mapping.json');

let cachedKB = null;
let cachedBaselines = null;
let cachedSpatialMap = null;

function loadRAGData() {
  if (!cachedKB) {
    try {
      if (fs.existsSync(KB_PATH)) {
        cachedKB = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
      }
    } catch (e) {
      console.warn('[RAG Search] Error reading KB:', e.message);
      cachedKB = { documents: [] };
    }
  }

  if (!cachedBaselines) {
    try {
      if (fs.existsSync(BASELINES_PATH)) {
        const raw = JSON.parse(fs.readFileSync(BASELINES_PATH, 'utf8'));
        cachedBaselines = raw.districts || raw;
      }
    } catch (e) {
      console.warn('[RAG Search] Error reading baselines:', e.message);
      cachedBaselines = [];
    }
  }

  if (!cachedSpatialMap) {
    try {
      if (fs.existsSync(SPATIAL_MAP_PATH)) {
        cachedSpatialMap = JSON.parse(fs.readFileSync(SPATIAL_MAP_PATH, 'utf8'));
      }
    } catch (e) {
      console.warn('[RAG Search] Error reading spatial map:', e.message);
      cachedSpatialMap = {};
    }
  }
}

/**
 * Perform keyword-tokenized TF-IDF/BM25 style relevance scoring across all RAG documents
 */
function searchRAG(query, options = {}) {
  loadRAGData();
  const limit = options.limit || 6;
  const targetDistrict = options.district ? options.district.toLowerCase() : null;

  if (!query || typeof query !== 'string') {
    return { results: [], districtBaselines: null };
  }

  const tokens = query.toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);

  const docs = cachedKB?.documents || [];
  const scoredDocs = [];

  for (const doc of docs) {
    const textToSearch = `${doc.title || ''} ${doc.category || ''} ${doc.content || ''}`.toLowerCase();
    let score = 0;

    for (const token of tokens) {
      if (textToSearch.includes(token)) {
        score += 1;
        // Exact match in title gets heavy boost
        if ((doc.title || '').toLowerCase().includes(token)) score += 3;
        if ((doc.category || '').toLowerCase().includes(token)) score += 2;
      }
    }

    // Boost if query mentions specific district and document matches
    if (targetDistrict && textToSearch.includes(targetDistrict)) {
      score += 4;
    }

    if (score > 0) {
      scoredDocs.push({
        id: doc.id,
        category: doc.category,
        title: doc.title,
        content: doc.content,
        score
      });
    }
  }

  // Sort descending by score
  scoredDocs.sort((a, b) => b.score - a.score);
  const topDocs = scoredDocs.slice(0, limit);

  // Retrieve District Baseline & Contacts if matching district is mentioned
  let matchingDistrictBaseline = null;
  if (Array.isArray(cachedBaselines)) {
    matchingDistrictBaseline = cachedBaselines.find(d => 
      targetDistrict && (
        (d.district || '').toLowerCase().includes(targetDistrict) ||
        targetDistrict.includes((d.district || '').toLowerCase())
      )
    ) || null;

    // If query didn't explicitly match a district, try to extract one from query tokens
    if (!matchingDistrictBaseline) {
      for (const d of cachedBaselines) {
        const dName = (d.district || '').toLowerCase();
        if (dName && tokens.some(t => t.includes(dName) || dName.includes(t))) {
          matchingDistrictBaseline = d;
          break;
        }
      }
    }
  }

  return {
    query,
    tokens,
    matchedDocumentsCount: scoredDocs.length,
    results: topDocs,
    districtBaseline: matchingDistrictBaseline,
    spatialInfo: targetDistrict && cachedSpatialMap ? cachedSpatialMap[targetDistrict] : null
  };
}

/**
 * Directory of Official Govt Offices, Officers, Emergency Numbers, NGOs & Portals
 */
const GOVT_OFFICE_DIRECTORY = {
  national_websites: [
    { name: 'DAE (Department of Agricultural Extension)', url: 'http://www.dae.gov.bd', service: 'Crops, Seedling, Fertilizer & Farmer Support' },
    { name: 'DLS (Department of Livestock Services)', url: 'http://www.dls.gov.bd', service: 'Cattle, Vaccination, Poultry & Feed Emergency' },
    { name: 'DoF (Department of Fisheries)', url: 'http://www.fisheries.gov.bd', service: 'Fish Farms, Pond Protection & Fingerlings' },
    { name: 'BMD (Bangladesh Meteorological Department)', url: 'http://www.bmd.gov.bd', service: 'Synoptic Weather, Rainfall & Storm Warnings' },
    { name: 'BWDB (Bangladesh Water Development Board)', url: 'http://www.bwdb.gov.bd', service: 'Flood Forecasting & Water Level Telemetry' },
    { name: 'BARRI (Bangladesh Rice Research Institute)', url: 'http://www.brri.gov.bd', service: 'Stress-tolerant BRRI Rice Varieties' },
    { name: 'MoDMR (Ministry of Disaster Management and Relief)', url: 'http://www.modmr.gov.bd', service: 'Disaster Relief, Cash Transfers & Shelters' },
    { name: 'BDRCS (Bangladesh Red Crescent Society)', url: 'http://www.bdrcs.org', service: 'Emergency Humanitarian Relief & Rescue' }
  ],
  emergency_helplines: [
    { service: 'National Emergency Service', number: '999', note: '24/7 Police, Fire, Ambulance & Marine Rescue' },
    { service: 'Disaster Early Warning Info Hotline', number: '1090', note: 'IVR Weather & River Gauge Warnings (Free)' },
    { service: 'Krishi Call Centre (DAE)', number: '16123', note: 'Direct Tele-Consultation with Agricultural Specialist' },
    { service: 'Pranishampad (DLS) Helpline', number: '16333', note: 'Veterinary Emergency & Livestock Consultation' },
    { service: 'National Human Rights & Legal Helpline', number: '109', note: 'Child & Gender Protection during Disasters' }
  ],
  humanitarian_orgs: [
    { name: 'UNDP Bangladesh', role: 'Livelihood Recovery, Anticipatory Cash Transfers & Climate Resilience' },
    { name: 'WFP (World Food Programme)', role: 'Emergency Food Distribution, Nutrition & Vulnerable Group Feeding' },
    { name: 'FAO Bangladesh', role: 'Agricultural Emergency Supplies, Veterinary Vaccines & Restocking' },
    { name: 'BRAC Disaster Management Unit', role: 'Community Shelters, WASH, Emergency Cash & Ultra-poor Support' },
    { name: 'CARE International Bangladesh', role: 'Coastal Polder Resilience, Women Resilience & Shelter Support' }
  ]
};

export {
  searchRAG,
  GOVT_OFFICE_DIRECTORY
};
