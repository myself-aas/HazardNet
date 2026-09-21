import fs from 'node:fs';
import path from 'node:path';

const RAG_DIR = typeof __dirname !== 'undefined' ? __dirname : path.resolve(process.cwd(), 'rag_pipeline');
const AGENT_MD_PATH = path.join(RAG_DIR, 'agent.md');

let cachedAgentMd = null;

function getAgentInstructions() {
  if (cachedAgentMd) return cachedAgentMd;
  try {
    if (fs.existsSync(AGENT_MD_PATH)) {
      cachedAgentMd = fs.readFileSync(AGENT_MD_PATH, 'utf8');
      return cachedAgentMd;
    }
  } catch (err) {
    console.warn('[skill_router] Could not load agent.md:', err.message);
  }
  return '';
}

/**
 * Routes domain skills and institutional protocols according to input prediction parameters.
 * @param {Object} input - Contains district_name, hazard_type, severity_score, confidence, etc.
 * @returns {string} Dynamic context string for LLM system prompt / advisory generation.
 */
export function routeSkills(input = {}) {
  const hazard = String(input.hazard_type || input.hazard || 'General Hazard').toLowerCase();
  const severity = typeof input.severity_score === 'number' ? input.severity_score : 0.5;
  const district = input.district_name || input.district || 'Bangladesh';
  const confidence = typeof input.confidence === 'number' ? input.confidence : 0.85;

  let urgencyTier = 'ROUTINE';
  if (severity >= 0.8) urgencyTier = 'EMERGENCY';
  else if (severity >= 0.6) urgencyTier = 'WARNING';
  else if (severity >= 0.4) urgencyTier = 'WATCH';

  const baseInstructions = getAgentInstructions();

  const dynamicProtocols = [];

  // 1. Hazard-specific routing
  if (hazard.includes('flood') || hazard.includes('submergence') || hazard.includes('water')) {
    dynamicProtocols.push(`
=== ACTIVE PROTOCOL: FLOOD & SUBMERGENCE MANAGEMENT ===
- DAE: Deploy rapid drainage; suspend nitrogen top-dressing; advise early harvest if grain maturity >= 80%.
- BRRI: Recommend submergence-tolerant rice varieties: BRRI dhan51, BRRI dhan52 (survives 10-14 days underwater).
- DLS: Immediate livestock evacuation to raised platforms ('Machrang') and community killas; ring vaccination for Anthrax and FMD; protect dry fodder stockpiles (UMS).
- DOF: Reinforce pond dykes with nylon nets and bamboo barriers; pre-flood harvest of table fish; install overflow screens.
- BWDB / FFWC: Monitor river danger levels and embankments.`);
  } else if (hazard.includes('cyclone') || hazard.includes('storm') || hazard.includes('wind') || hazard.includes('surge')) {
    dynamicProtocols.push(`
=== ACTIVE PROTOCOL: TROPICAL CYCLONE & TIDAL SURGE ===
- BMD: Align alert with national Maritime Warning Signals (1-10); trigger 72h anticipatory evacuation.
- DAE: Harvest standing crops (Aman/Boro/Maize) if >= 75% mature; tie fruit trees; clear shelterbelts.
- DOF: Lower shrimp gher and coastal pond water levels by 20%; apply agricultural gypsum (2 t/ha) for salinity buffering.
- DLS: Transfer cattle to cyclone shelters; provide clean drinking water and oral rehydration.`);
  } else if (hazard.includes('drought') || hazard.includes('heat') || hazard.includes('dry')) {
    dynamicProtocols.push(`
=== ACTIVE PROTOCOL: DROUGHT & HEAT STRESS MITIGATION ===
- DAE: Implement Alternate Wetting and Drying (AWD) using perforated observation pipes (30% water savings).
- BRRI: Promote drought-resistant rice: BRRI dhan56, BRRI dhan65, BRRI dhan82.
- DLS: Provide shaded enclosures; clean water ad libitum; prevent heat stroke in commercial broiler/layer units.`);
  } else if (hazard.includes('cold') || hazard.includes('fog')) {
    dynamicProtocols.push(`
=== ACTIVE PROTOCOL: COLD WAVE & DENSE FOG ===
- DAE: Cover Boro nursery seedbeds with clear polythene sheets from evening to 10 AM; flush cold standing water and irrigate with tubewell water.
- BARI: Spray Mancozeb / Ridomil Gold against potato late blight (Phytophthora infestans) during persistent fog.
- DLS: Shield livestock from direct cold winds; supply dry straw bedding; provide warm drinking water.`);
  } else {
    dynamicProtocols.push(`
=== ACTIVE PROTOCOL: GENERAL MULTI-SECTORAL DISASTER MANAGEMENT ===
- DAE / DLS / DoF joint contingency protocols active.
- Verify district Agro-Ecological Zone (AEZ) characteristics and seasonal crop calendar.`);
  }

  // 2. Urgency and Severity Routing
  dynamicProtocols.push(`
=== CURRENT DISPATCH METRICS ===
- Target District: ${district}
- Hazard Category: ${input.hazard_type || 'General'}
- Severity Score: ${severity.toFixed(2)} (${urgencyTier})
- Model Confidence: ${(confidence * 100).toFixed(1)}%`);

  return `${baseInstructions}\n\n${dynamicProtocols.join('\n\n')}`;
}
