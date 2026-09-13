import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { routeSkills } from './skill_router.js';
import { searchRAG, GOVT_OFFICE_DIRECTORY } from './search.js';

const ragModuleFile = fileURLToPath(import.meta.url);
const ragModuleDir = path.dirname(ragModuleFile);

const RAG_DIR = ragModuleDir;
const AGENT_MD_PATH = path.join(RAG_DIR, 'agent.md');
const KB_PATH = path.join(RAG_DIR, 'agent_knowledge_base.json');
const SPATIAL_MAP_PATH = path.join(RAG_DIR, 'references', '05_spatial_context', 'district_division_mapping.json');
const BASELINES_PATH = path.join(RAG_DIR, 'district_economic_baselines.json');

function getAgentInstructions() {
  try {
    if (fs.existsSync(AGENT_MD_PATH)) {
      return fs.readFileSync(AGENT_MD_PATH, 'utf8');
    }
  } catch (err) {
    console.warn('[RAG Pipeline] Could not read agent.md:', err.message);
  }
  return '';
}

function getKnowledgeBase() {
  try {
    if (fs.existsSync(KB_PATH)) {
      return JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
    }
  } catch (err) {
    console.warn('[RAG Pipeline] Could not read agent_knowledge_base.json:', err.message);
  }
  return { metadata: {}, documents: [] };
}

function getSpatialMap() {
  try {
    if (fs.existsSync(SPATIAL_MAP_PATH)) {
      return JSON.parse(fs.readFileSync(SPATIAL_MAP_PATH, 'utf8'));
    }
  } catch (err) {
    console.warn('[RAG Pipeline] Could not read district_division_mapping.json:', err.message);
  }
  return {};
}

function getDistrictBaselines() {
  try {
    if (fs.existsSync(BASELINES_PATH)) {
      const data = JSON.parse(fs.readFileSync(BASELINES_PATH, 'utf8'));
      return data.districts || [];
    }
  } catch (err) {
    console.warn('[RAG Pipeline] Could not read district_economic_baselines.json:', err.message);
  }
  return [];
}

export {
  RAG_DIR,
  getAgentInstructions,
  getKnowledgeBase,
  getSpatialMap,
  getDistrictBaselines,
  routeSkills,
  searchRAG,
  GOVT_OFFICE_DIRECTORY
};

