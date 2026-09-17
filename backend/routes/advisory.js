import express from 'express';
import { routeSkills, getAgentInstructions, getKnowledgeBase, getSpatialMap } from '../../rag_pipeline/index.js';
import { generateAdvisoryWithFallback, getEngineStatus } from '../utils/ai_fallback_engine.js';

const router = express.Router();

const agentInstructions = getAgentInstructions();
const knowledgeBase = getKnowledgeBase();
const spatialMap = getSpatialMap();

// AI Fallback Engine Status & Telemetry Route
router.get('/status', (req, res) => {
  res.json(getEngineStatus());
});

router.post('/', async (req, res) => {
  try {
    const { district_name, hazard_type, severity_score, confidence, target_date, crop_context } = req.body || {};
    
    // Sanitize and clamp numeric scores
    const safeDistrict = typeof district_name === 'string' ? district_name.trim().slice(0, 100) : 'National';
    const safeHazard = typeof hazard_type === 'string' ? hazard_type.trim().slice(0, 100) : 'General Hazard';
    const safeSeverity = typeof severity_score === 'number' && !isNaN(severity_score)
      ? Math.max(0, Math.min(1, severity_score))
      : 0.5;
    const safeConfidence = typeof confidence === 'number' && !isNaN(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : 0.85;
    const safeTargetDate = typeof target_date === 'string' ? target_date.slice(0, 30) : new Date().toISOString().split('T')[0];

    const currentMonth = new Date().toLocaleString('default', { month: 'long' });
    const spatialContext = spatialMap[safeDistrict] || { profile: "Unknown", aez: "Unknown" };

    let relevantDocs = [];
    const hazardLower = safeHazard.toLowerCase().replace(/ /g, '_');
    
    const validatedBody = {
      ...req.body,
      district_name: safeDistrict,
      hazard_type: safeHazard,
      severity_score: safeSeverity,
      confidence: safeConfidence,
      target_date: safeTargetDate
    };

    // Use the dynamic skill router
    const dynamicSkillsText = routeSkills(validatedBody);

    for (const doc of knowledgeBase.documents) {
      if (doc.category !== '06_agent_skills') {
        const docIdStr = typeof doc.id === 'string' ? doc.id : String(doc.id || '');
        if (docIdStr.toLowerCase().includes(hazardLower)) {
          relevantDocs.push(doc.content);
        }
        if (docIdStr.includes('calendar') || docIdStr.includes('variety') || docIdStr.includes('vulnerability') || docIdStr.includes('aez')) {
          relevantDocs.push(doc.content);
        }
      }
    }
    
    const contextText = relevantDocs.join('\n\n---\n\n') + '\n\n---\n\n' + dynamicSkillsText;

    const userPrompt = `
    SPATIAL CONTEXT:
    - District: ${safeDistrict}
    - Agro-Ecological Zone (AEZ): ${spatialContext.aez}
    - Regional Vulnerability Profile: ${spatialContext.profile}

    CONTEXT KNOWLEDGE BASE:
    ${contextText}
    
    HAZARDNET PREDICTION:
    - District: ${safeDistrict}
    - Hazard: ${safeHazard}
    - Severity: ${safeSeverity}
    - Confidence: ${safeConfidence}
    - Target Date: ${safeTargetDate}
    - Current Month: ${currentMonth}
    
    Generate the JSON advisory based on your protocols and the provided context.
    `;

    // Execute via multi-provider high-availability fallback engine
    const advisoryJson = await generateAdvisoryWithFallback(
      validatedBody,
      agentInstructions,
      userPrompt
    );

    res.json(advisoryJson);
  } catch (error) {
    console.error('Advisory Engine Error:', error);
    res.status(500).json({
      error: 'Failed to generate advisory',
      fallback: 'Monitor local weather and contact Union Parishad Agriculture Officer.'
    });
  }
});

export default router;
