// backend/routes/agent.js (Gemini Function Calling Integration)
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { routeSkills } from '../../rag_pipeline/index.js';
import { generateDeterministicHeuristicAdvisory } from '../utils/ai_fallback_engine.js';
import { clientError } from '../utils/clientError.js';

const router = express.Router();

// 1. Define Gemini Tool Specifications
const bwdbGaugeTool = {
  name: 'get_bwdb_danger_level',
  description: 'Fetches real-time river water levels and danger status from BWDB for a specific district in Bangladesh.',
  parameters: {
    type: 'OBJECT',
    properties: {
      district_name: {
        type: 'STRING',
        description: 'Name of the district e.g. Sirajganj, Sunamganj',
      },
    },
    required: ['district_name'],
  },
};

const smsAlertTool = {
  name: 'trigger_emergency_sms',
  description: 'Triggers emergency broadcast SMS to regional Bangladesh disaster management officers when severity >= 0.8.',
  parameters: {
    type: 'OBJECT',
    properties: {
      district_name: { type: 'STRING', description: 'District name' },
      hazard: { type: 'STRING', description: 'Hazard type e.g. Tropical Cyclone' },
      severity: { type: 'NUMBER', description: 'Continuous severity score 0.0 to 1.0' },
    },
    required: ['district_name', 'hazard', 'severity'],
  },
};

// 2. Generate Advisory with Function Tool Declarations
async function generateMultiSectoralAdvisory(prediction) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[Agent Route] GEMINI_API_KEY not configured, using offline heuristic advisory');
    return generateDeterministicHeuristicAdvisory(prediction || {});
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const dynamicContext = routeSkills(prediction);
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: `Generate multi-sectoral advisory for: ${JSON.stringify(prediction)}` }] }
      ],
      config: {
        systemInstruction: `${dynamicContext}\n\nYou are the HazardNet Multi-Sectoral Decision Support System. Synthesize DAE, DoF, and DLS protocols into JSON advisories.`,
        tools: [{ functionDeclarations: [bwdbGaugeTool, smsAlertTool] }],
        responseMimeType: 'application/json',
      },
    });

    return JSON.parse(response.text);
  } catch (err) {
    console.warn('[Agent Route] Gemini function call failed, falling back to deterministic engine:', err.message);
    return generateDeterministicHeuristicAdvisory(prediction || {});
  }
}

router.post('/advisory', async (req, res) => {
  try {
    const advisory = await generateMultiSectoralAdvisory(req.body);
    res.json(advisory);
  } catch (err) {
    console.error('Agent Function Calling Error:', err);
    clientError(res, err, { scope: 'backend/agent', fallback: 'Failed to generate advisory via Agent function calling' });
  }
});

export { generateMultiSectoralAdvisory };
export default router;
