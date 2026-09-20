import fs from 'fs';
import path from 'path';

const RAG_DIR = typeof __dirname !== 'undefined' ? __dirname : path.resolve(process.cwd(), 'rag_pipeline');

let agentInstructions = '';
try {
  const agentMdPath = path.join(RAG_DIR, 'agent.md');
  if (fs.existsSync(agentMdPath)) {
    agentInstructions = fs.readFileSync(agentMdPath, 'utf8');
  }
} catch (e) {
  console.warn('[skill_router] Could not load agent.md:', e.message);
}

/**
 * Dynamically routes skills and contextual guidance based on prediction inputs.
 *
 * @param {Object} prediction - Prediction details including hazard_type, severity_score, district_name, etc.
 * @returns {string} Contextualized directives and instructions
 */
export function routeSkills(prediction = {}) {
  const hazard = (prediction.hazard_type || prediction.hazard || '').toLowerCase();
  const severity = typeof prediction.severity_score === 'number'
    ? prediction.severity_score
    : (typeof prediction.severity === 'number' ? prediction.severity : 0.5);
  const district = prediction.district_name || prediction.district || 'National';

  const directives = [];

  directives.push(`[Hazard Context: ${prediction.hazard_type || 'General Hazard'} | District: ${district} | Severity: ${severity.toFixed(2)}]`);

  if (severity >= 0.7) {
    directives.push('URGENT DISASTER PROTOCOL: Trigger immediate emergency livestock relocation to killas/machrang, shock-chlorination of tube-wells via DPHE, and emergency drainage canal clearance.');
  }

  if (hazard.includes('flood') || hazard.includes('inundation')) {
    directives.push('BRRI / DAE PROTOCOL: Recommend submergence-tolerant rice varieties (BRRI dhan51, BRRI dhan52 for up to 14 days inundation). Move livestock to elevated community killas.');
    directives.push('DOF PROTOCOL: Protect haor fisheries; install synthetic perimeter netting around culture ponds to prevent fish escapement.');
  } else if (hazard.includes('cyclone') || hazard.includes('storm')) {
    directives.push('BMD / DMB PROTOCOL: Align advisories with BMD coastal warning signals. Lower shrimp gher water levels by 20% and reinforce earthen polders with geo-textiles.');
  } else if (hazard.includes('drought') || hazard.includes('dry')) {
    directives.push('BRRI / BARI PROTOCOL: Recommend drought-tolerant varieties (BRRI dhan56, BRRI dhan65, BRRI dhan82) and AWD (Alternate Wetting and Drying) irrigation.');
  } else if (hazard.includes('cold') || hazard.includes('fog')) {
    directives.push('DAE PROTOCOL: Protect Boro seedbeds using polythene sheet covers during cold waves. Manage potato late blight with prophylactic fungicides.');
  }

  const baseInstructions = agentInstructions || 'You are the HazardNet Multi-Sectoral Decision Support System for Bangladesh.';
  return `${directives.join('\n')}\n\n${baseInstructions}`;
}

export default routeSkills;
