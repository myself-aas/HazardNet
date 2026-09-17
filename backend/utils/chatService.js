/**
 * Shared HazardNet RAG chat service (API-parity fix, 2026-09-17).
 *
 * The AI Advisor widget (frontend/src/components/ChatBot.tsx) calls
 * `/api/chat/query` + `/api/chat/sample-questions`. Those routes only existed
 * on the Express backend (`backend/routes/chat.js`), which is NOT what serves
 * the Vercel deployment — so every message in production hit a 404 (HTML) and
 * the widget replied "There was an error communicating with the AI" for every
 * message. This module holds the implementation ONCE so the Express route and
 * the Vercel serverless functions (api/chat/query.js,
 * api/chat/sample-questions.js) behave identically by construction — the same
 * split backend/utils/forecastServe.js already uses for the forecast API.
 */

import { searchRAG, GOVT_OFFICE_DIRECTORY } from '../../rag_pipeline/index.js';
import { generateAdvisoryWithFallback } from './ai_fallback_engine.js';

export { GOVT_OFFICE_DIRECTORY };

const systemPrompt = `You are the HazardNet RAG Assistant — an expert AI advisor for Bangladesh Agriculture, Disaster Risk Management, Veterinary Care, Livestock, Fisheries, Agricultural Economics, Environmental Protection, and Humanitarian Relief.

YOUR RESPONSIBILITIES:
1. Provide accurate, practical, and action-oriented advice grounded in official Department of Agricultural Extension (DAE), Department of Livestock Services (DLS), Department of Fisheries (DoF), BMD, BWDB, BARC, BRRI, and Ministry of Disaster Management (MoDMR) protocols.
2. Whenever relevant, cite specific stress-tolerant seed varieties (e.g., BRRI dhan51, dhan52, dhan71), veterinary treatments (e.g., Anthrax spore vaccine, foot rot baths), pond protection methods, or disaster protocols.
3. Include official contact helplines (e.g. Krishi Call Centre 16123, Pranishampad 16333, Disaster Warning 1090, Emergency 999) and website links (http://www.dae.gov.bd, http://www.dls.gov.bd, http://www.fisheries.gov.bd, http://www.bmd.gov.bd, http://www.bwdb.gov.bd).
4. Maintain a polite, professional, and clear tone using well-structured Markdown headings, bullet points, and key takeaways.
5. If district context is provided, tailor your response specifically to that district's agro-ecological zone (AEZ) and local hazards.`;

/**
 * Categorized sample queries for the widget's quick-start chips.
 * GET /api/chat/sample-questions
 */
export const SAMPLE_QUESTIONS = {
  categories: [
    {
      name: '🌾 Agriculture & Crop Protection',
      icon: '🌾',
      questions: [
        'Which BRRI rice varieties are submergence and flash-flood tolerant?',
        'How do I protect mature Aman rice during pre-cyclone warnings?',
        'What is the Alternate Wetting and Drying (AWD) technique for Boro rice?'
      ]
    },
    {
      name: '🐮 Veterinary & Livestock Care',
      icon: '🐮',
      questions: [
        'What are the post-flood emergency protocols for cattle and Anthrax vaccination?',
        'How to protect poultry flocks during intense heatwaves and floods?',
        'What is the DLS Helpline number for livestock health emergency?'
      ]
    },
    {
      name: '🐟 Fisheries & Aquaculture',
      icon: '🐟',
      questions: [
        'How to prevent fish loss in ponds and shrimp ghers during tidal surges?',
        'What post-flood water treatment is recommended by DoF for beels and ponds?',
        'Which fish species are recommended for rapid post-disaster restocking?'
      ]
    },
    {
      name: '🏛️ Nearest Govt Offices & Officers',
      icon: '🏛️',
      questions: [
        'Where is the nearest Upazila Agriculture Office (DAE) in Sunamganj?',
        'How can I reach the District Disaster Management Control Room in Sirajganj?',
        'What are the official government websites for DAE, DLS, DoF, and BMD?'
      ]
    },
    {
      name: '🤝 Humanitarian & NGO Assistance',
      icon: '🤝',
      questions: [
        'What are the UNDP anticipatory mobile cash transfer criteria before floods?',
        'How do WFP and FAO assist farmers with emergency seed and food supplies?',
        'What is the BDRCS emergency shelter and relief protocol?'
      ]
    }
  ]
};

/**
 * Transport-agnostic handlers for the two GET endpoints. Both the Express
 * router and the Vercel functions call these so the response bodies cannot
 * drift between deployments. sendJson() works on Express responses, Vercel's
 * @vercel/node responses, and plain http.ServerResponse alike.
 */
function sendJson(res, status, body) {
  if (typeof res.status === 'function') res.status(status);
  else res.statusCode = status;
  if (typeof res.json === 'function') {
    res.json(body);
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  }
}

/** GET /api/chat/sample-questions */
export function sampleQuestionsHandler(_req, res) {
  sendJson(res, 200, SAMPLE_QUESTIONS);
}

/** GET /api/chat/directory */
export function directoryHandler(_req, res) {
  sendJson(res, 200, GOVT_OFFICE_DIRECTORY);
}

/**
 * Execute one RAG retrieval + multi-tier AI generation turn.
 * POST /api/chat/query  (Express route + Vercel function both call this)
 *
 * @param {{query: string, district?: string, conversationHistory?: Array}} input
 * @returns {Promise<object>} JSON body identical to the historical contract:
 *   { query, answer, retrieved_sources, district_baseline, district_contacts,
 *     govt_directory, suggested_followups, provider_source, cached }
 * @throws {Error} message is safe to surface; validation errors carry
 *   `statusCode` (400) so transports can map them to HTTP codes.
 */
export async function handleChatQuery(input) {
  const { query, district, conversationHistory = [] } = input || {};

  if (!query || typeof query !== 'string' || query.trim() === '') {
    const err = new Error('Query parameter is required');
    err.statusCode = 400;
    throw err;
  }

  // Input bounds & anti-DoS safeguards
  const sanitizedQuery = query.trim().slice(0, 3000);
  const sanitizedDistrict = typeof district === 'string' ? district.trim().slice(0, 100) : undefined;
  const safeHistory = Array.isArray(conversationHistory)
    ? conversationHistory.slice(-8).map(msg => ({
        role: msg?.role === 'user' ? 'user' : 'assistant',
        content: typeof msg?.content === 'string' ? msg.content.slice(0, 1500) : ''
      }))
    : [];

  // 1. Perform RAG Retrieval from 41+ indexed documents & district baselines
  const ragResult = searchRAG(sanitizedQuery, { district: sanitizedDistrict });

  // 2. Format Context for the LLM Prompt
  let contextText = `=== RETRIEVED RAG KNOWLEDGE BASE DOCUMENTS (${ragResult.results.length} matched) ===\n`;
  ragResult.results.forEach((doc, idx) => {
    contextText += `\n[Doc ${idx + 1}: ${doc.title} (${doc.category})]\n${doc.content}\n`;
  });

  if (ragResult.districtBaseline) {
    contextText += `\n=== DISTRICT BASELINE: ${ragResult.districtBaseline.district} ===\n`;
    contextText += JSON.stringify(ragResult.districtBaseline, null, 2) + '\n';
  }

  contextText += `\n=== OFFICIAL GOVT HELPLINES & WEBSITES ===\n`;
  contextText += JSON.stringify(GOVT_OFFICE_DIRECTORY, null, 2) + '\n';

  // 3. Format Conversation History
  let historyText = '';
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    historyText = `\n=== RECENT CONVERSATION HISTORY ===\n` +
      conversationHistory.slice(-4).map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n') + '\n';
  }

  const fullUserPrompt = `${contextText}${historyText}\n=== USER QUERY ===\n${query}\n\nProvide a comprehensive, clear, structured Markdown answer utilizing the above retrieved RAG context. Also suggest 3 short follow-up questions at the very end formatted inside a JSON block or clean list.`;

  // 4. Generate Answer via Multi-Provider HA Fallback Engine
  const aiParams = {
    district_name: district || ragResult.districtBaseline?.district || 'Bangladesh',
    hazard_type: 'General Agriculture & Hazard Inquiry',
    severity_score: 0.5,
    confidence: 0.90
  };

  let aiResponse;
  try {
    aiResponse = await generateAdvisoryWithFallback(aiParams, systemPrompt, fullUserPrompt);
  } catch (e) {
    console.warn('[Chat Service] AI engine fallback error:', e.message);
  }

  // Extract text answer from response or construct grounded summary
  let answerMarkdown = '';
  let followups = [
    `What are the nearest government agricultural office contacts in ${district || 'my district'}?`,
    'Which BRRI rice varieties are submergence or flood tolerant?',
    'How do I protect fish ponds and shrimp ghers during heavy floods?'
  ];

  if (aiResponse) {
    if (typeof aiResponse === 'string') {
      answerMarkdown = aiResponse;
    } else if (aiResponse.tensor_diagnosis || aiResponse.risk_assessment) {
      // Fallback or structured advisory object response
      answerMarkdown = `### 🛡️ RAG Knowledge Assessment\n\n${aiResponse.tensor_diagnosis || ''}\n\n` +
        `**Risk & Vulnerability:** ${aiResponse.risk_assessment || ''}\n\n` +
        `#### 📋 Immediate Action Steps (48 Hours):\n` +
        (aiResponse.immediate_actions_48h || []).map(a => `- ${a}`).join('\n') + '\n\n' +
        `#### 🌾 Protective & Recovery Measures:\n` +
        (aiResponse.protective_measures_7d || []).map(a => `- ${a}`).join('\n') + '\n\n' +
        `#### 🌾 Recommended Seed Varieties:\n` +
        (aiResponse.recommended_varieties || []).map(v => `- **${v}**`).join('\n') + '\n\n' +
        `*${aiResponse.confidence_caveat || ''}*`;
    } else if (aiResponse.answer) {
      answerMarkdown = aiResponse.answer;
      if (Array.isArray(aiResponse.followups)) followups = aiResponse.followups;
    } else {
      answerMarkdown = JSON.stringify(aiResponse, null, 2);
    }
  }

  if (!answerMarkdown) {
    answerMarkdown = `### 🌾 RAG Knowledge Base Search Results\n\nWe found **${ragResult.results.length} relevant official document(s)** matching your query:\n\n` +
      ragResult.results.map(r => `#### 📄 ${r.title} (${r.category})\n${r.content.slice(0, 300)}...`).join('\n\n') +
      `\n\n---\n**Emergency Helplines:** DAE Krishi Hotline: **16123** | Livestock Helpline: **16333** | Disaster Warning: **1090** | Emergency: **999**`;
  }

  // 5. Gather government contacts for district if available
  let districtContacts = null;
  if (ragResult.districtBaseline) {
    districtContacts = {
      district: ragResult.districtBaseline.district,
      dae_officer: ragResult.districtBaseline.dae_officer || 'Upazila Agriculture Officer (UAO)',
      dls_officer: ragResult.districtBaseline.dls_officer || 'Upazila Livestock Officer (ULO)',
      dof_officer: ragResult.districtBaseline.dof_officer || 'Upazila Fisheries Officer (UFO)',
      dc_control_room: ragResult.districtBaseline.control_room || 'District Disaster Management Control Room',
      contact_lines: ragResult.districtBaseline.contact_lines || ['16123 (Krishi Call Centre)', '1090 (Disaster Hotline)']
    };
  }

  return {
    query,
    answer: answerMarkdown,
    retrieved_sources: ragResult.results.map(r => ({
      id: r.id,
      title: r.title,
      category: r.category,
      relevanceScore: r.score
    })),
    district_baseline: ragResult.districtBaseline,
    district_contacts: districtContacts,
    govt_directory: GOVT_OFFICE_DIRECTORY,
    suggested_followups: followups,
    provider_source: aiResponse?.provider_source || 'HazardNet RAG Knowledge Engine',
    cached: aiResponse?.cached || false
  };
}
