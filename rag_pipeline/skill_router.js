import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILLS_DIR = path.join(__dirname, 'skills');
const REFS_DIR = path.join(__dirname, 'references');

// Load District Economic Baselines
let districtBaselines = [];
try {
  const jsonPath = path.join(__dirname, 'district_economic_baselines.json');
  if (fs.existsSync(jsonPath)) {
    const rawData = fs.readFileSync(jsonPath, 'utf8');
    districtBaselines = JSON.parse(rawData).districts || [];
  }
} catch (err) {
  console.warn('Could not load district economic baselines:', err.message);
}

function loadSkillFile(category, filename) {
  const filePath = path.join(SKILLS_DIR, category, filename);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  return "";
}

function loadRefFile(category, filename) {
  const filePath = path.join(REFS_DIR, category, filename);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  return "";
}

function routeSkills(hazardnetPrediction = {}) {
  const rawHazard = hazardnetPrediction.hazard_type;
  const hazard = typeof rawHazard === 'string' ? rawHazard : String(rawHazard || '');
  const severity = typeof hazardnetPrediction.severity_score === 'number'
    ? hazardnetPrediction.severity_score
    : parseFloat(hazardnetPrediction.severity_score) || 0.5;
  const confidence = typeof hazardnetPrediction.confidence === 'number'
    ? hazardnetPrediction.confidence
    : parseFloat(hazardnetPrediction.confidence) || 0.8;
  const districtName = hazardnetPrediction.district_name || '';

  let contextWindow = [];

  // 1. ALWAYS INCLUDE: Tensor Interpretation & Severity Logic
  contextWindow.push(loadSkillFile("01_tensor_interpretation", "15_band_tensor_logic.md"));
  contextWindow.push(loadSkillFile("02_severity_quantification", "severity_binning.md"));

  // 2. ROUTE BY HAZARD TYPE
  const hazardMap = {
    "Flood": "flood_flash_flood.md",
    "Flash Flood": "flood_flash_flood.md",
    "Tropical Cyclone": "tropical_cyclone.md",
    "Drought": "drought_heat_wave.md",
    "Heat Wave": "drought_heat_wave.md",
    "Cold Wave": "cold_wave.md"
  };

  if (hazardMap[hazard]) {
    let protocol = loadSkillFile("03_hazard_protocols", hazardMap[hazard]);
    if (!protocol) {
      protocol = loadRefFile("02_hazard_protocols", hazardMap[hazard]);
    }
    if (protocol) contextWindow.push(protocol);
  }

  // 3. SECTORAL ROUTING BASED ON DISTRICT ECONOMIC BASELINES
  const districtObj = districtBaselines.find(
    (d) => d.name.toLowerCase() === districtName.toLowerCase() || d.id === districtName.toLowerCase()
  );

  const primarySector = districtObj ? districtObj.primary_sector : 'crops';
  const secondarySectors = districtObj ? (districtObj.secondary_sectors || []) : [];

  // Include Fisheries protocol if district is fisheries-centric or coastal/haor
  if (
    primarySector === 'fisheries' ||
    secondarySectors.includes('fisheries') ||
    ['satkhira', 'khulna', 'bagerhat', 'coxs_bazar', 'sunamganj', 'netrokona', 'bhola', 'barguna', 'patuakhali'].includes(districtName.toLowerCase())
  ) {
    const fisheriesDoc = loadRefFile("02_fisheries_profiles", "inland_coastal_fisheries.md");
    if (fisheriesDoc) {
      contextWindow.push(fisheriesDoc);
      contextWindow.push("[Institutional Source: Department of Fisheries (DoF) & BFRI]");
    }
  }

  // Include Livestock protocol if district is livestock-centric or affected by severe flood/cyclone
  if (
    primarySector === 'livestock' ||
    secondarySectors.includes('livestock') ||
    ['sirajganj', 'kurigram', 'gaibandha', 'jamalpur', 'pabna', 'chuadanga'].includes(districtName.toLowerCase())
  ) {
    const livestockDoc = loadRefFile("03_livestock_poultry_profiles", "cattle_poultry_protocols.md");
    if (livestockDoc) {
      contextWindow.push(livestockDoc);
      contextWindow.push("[Institutional Source: Department of Livestock Services (DLS) & BLRI]");
    }
  }

  // Include Veterinary Emergency SOPs if high severity (>=0.65) or poultry risk
  if (severity >= 0.65 || primarySector === 'poultry') {
    const vetDoc = loadRefFile("04_veterinary_emergency", "post_disaster_disease_sops.md");
    if (vetDoc) {
      contextWindow.push(vetDoc);
      contextWindow.push("[Emergency Protocol: DLS Post-Disaster Epidemiological Control]");
    }
  }

  // 4. ROUTE BY SEVERITY (Humanitarian / Health / WASH)
  if (severity >= 0.65) {
    contextWindow.push(loadSkillFile("06_humanitarian_development", "who_post_disaster_health.md"));
    contextWindow.push(loadSkillFile("06_humanitarian_development", "unicef_child_nutrition.md"));
    contextWindow.push(loadSkillFile("06_humanitarian_development", "undp_livelihood_recovery.md"));
  }

  // 5. ROUTE BY CONFIDENCE
  if (confidence < 0.70) {
    contextWindow.push(loadSkillFile("02_severity_quantification", "uncertainty_routing.md"));
    contextWindow.push(loadSkillFile("05_meteorological_institutions", "wmo_seasonal_outlook.md"));
  } else {
    contextWindow.push(loadSkillFile("05_meteorological_institutions", "bmd_warning_signals.md"));
  }

  // 6. ROUTE AGRICULTURAL PROTOCOLS (DAE & BRRI)
  contextWindow.push(loadSkillFile("04_agricultural_institutions", "brri_rice_protocols.md"));
  let daeSop = loadSkillFile("04_agricultural_institutions", "dae_extension_sop.md");
  if (!daeSop) {
    daeSop = loadRefFile("06_agent_skills", "skill_04_dae_agricultural_sop.md");
  }
  if (daeSop) contextWindow.push(daeSop);

  return contextWindow.filter(Boolean).join("\n\n---\n\n");
}

export { routeSkills };
