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

import { searchRAG, routeSkills, GOVT_OFFICE_DIRECTORY } from '../../rag_pipeline/index.js';
import { generateAdvisoryWithFallback } from './ai_fallback_engine.js';
import { detectGroundingIntent, executeMapsGrounding, executeSearchGrounding } from './gemini_grounding.js';

export { GOVT_OFFICE_DIRECTORY };

/**
 * Infer primary hazard theme from query & district baseline for institutional skill routing.
 */
function inferHazardTheme(query = '', baseline = null) {
  const q = String(query).toLowerCase();
  if (/flood|submerg|flash flood|water log|inundat|haor|surma|kushiyara|jamuna|brahmaputra/i.test(q)) {
    return 'Flood';
  }
  if (/cyclone|storm|surge|salin|tidal|coastal|wind gust|depression|super cyclone/i.test(q)) {
    return 'Cyclone';
  }
  if (/drought|heat|arid|dry spell|water stress|scarcity|awd/i.test(q)) {
    return 'Drought';
  }
  if (/cold|fog|frost|late blight|dense fog/i.test(q)) {
    return 'Cold Wave';
  }
  if (baseline?.predominant_hazards && baseline.predominant_hazards.length > 0) {
    const first = baseline.predominant_hazards[0];
    if (/flood/i.test(first)) return 'Flood';
    if (/cyclone/i.test(first)) return 'Cyclone';
    if (/drought/i.test(first)) return 'Drought';
    if (/cold/i.test(first)) return 'Cold Wave';
  }
  return 'Multi-Hazard';
}

const systemPrompt = `You are the HazardNet RAG Assistant — an expert AI advisor for Bangladesh Agriculture, Disaster Risk Management, Veterinary Care, Livestock, Fisheries, Agricultural Economics, Environmental Protection, and Humanitarian Relief.

YOUR RESPONSIBILITIES:
1. Provide accurate, practical, and action-oriented advice grounded in official Department of Agricultural Extension (DAE), Department of Livestock Services (DLS), Department of Fisheries (DoF), BMD, BWDB, BARC, BRRI, and Ministry of Disaster Management (MoDMR) protocols.
2. Whenever relevant, cite specific stress-tolerant seed varieties (e.g., BRRI dhan51, dhan52, dhan71), veterinary treatments (e.g., Anthrax spore vaccine, foot rot baths), pond protection methods, or disaster protocols.
3. Include official contact helplines (e.g. Krishi Call Centre 16123, Pranishampad 16333, Disaster Warning 1090, Emergency 999) and website links (http://www.dae.gov.bd, http://www.dls.gov.bd, http://www.fisheries.gov.bd, http://www.bmd.gov.bd, http://www.bwdb.gov.bd).
4. Maintain a polite, professional, and clear tone using well-structured Markdown headings, bullet points, and key takeaways.
5. If district context is provided, tailor your response specifically to that district's agro-ecological zone (AEZ) and local hazards.`;

/**
 * Prompt bounds (SEC-11). The per-field numbers existed before this phase but the prompt
 * was assembled from raw input; these are the numbers actually enforced on the model call,
 * and `MAX_PROMPT_CHARS` bounds the whole thing including retrieved context. The bounds
 * only count if they reach the prompt: an earlier version computed `sanitizedQuery` for
 * RAG retrieval but built the LLM prompt from the raw body, so a caller could send a
 * megabyte of text (cost, latency, prompt-injection surface) while the code still looked
 * bounded. Everything downstream of the sanitize block uses the sanitized values, and the
 * assembled prompt is capped as a whole — on BOTH transports, since the Express route and
 * the Vercel twin share this module.
 */
const MAX_QUERY_CHARS = 3000;
const MAX_HISTORY_MESSAGE_CHARS = 1500;
const MAX_PROMPT_CHARS = 12_000;

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

function getDistrictContacts(baseline) {
  if (!baseline) return null;
  return {
    district: baseline.district || baseline.name,
    dae_officer: baseline.dae_officer || 'Upazila Agriculture Officer (UAO)',
    dls_officer: baseline.dls_officer || 'Upazila Livestock Officer (ULO)',
    dof_officer: baseline.dof_officer || 'Upazila Fisheries Officer (UFO)',
    dc_control_room: baseline.control_room || 'District Disaster Management Control Room',
    contact_lines: baseline.contact_lines || ['16123 (Krishi Call Centre)', '1090 (Disaster Hotline)']
  };
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
  const { query, district, conversationHistory = [], groundingMode = 'auto', userCoordinates } = input || {};

  if (!query || typeof query !== 'string' || query.trim() === '') {
    const err = new Error('Query parameter is required');
    err.statusCode = 400;
    throw err;
  }

  // Input bounds & anti-DoS safeguards (SEC-11 — see the constants above)
  const sanitizedQuery = query.trim().slice(0, MAX_QUERY_CHARS);
  const sanitizedDistrict = typeof district === 'string' ? district.trim().slice(0, 100) : undefined;
  const safeHistory = Array.isArray(conversationHistory)
    ? conversationHistory.slice(-8).map(msg => ({
        role: msg?.role === 'user' ? 'user' : 'assistant',
        content: typeof msg?.content === 'string' ? msg.content.slice(0, MAX_HISTORY_MESSAGE_CHARS) : ''
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
    const baselineName = ragResult.districtBaseline.district || ragResult.districtBaseline.name;
    contextText += `\n=== DISTRICT BASELINE: ${baselineName} ===\n`;
    contextText += JSON.stringify(ragResult.districtBaseline, null, 2) + '\n';
  }

  contextText += `\n=== OFFICIAL GOVT HELPLINES & WEBSITES ===\n`;
  contextText += JSON.stringify(GOVT_OFFICE_DIRECTORY, null, 2) + '\n';

  // 3. Detect Grounding Intent (Maps vs Search vs Standard RAG)
  const intent = detectGroundingIntent(sanitizedQuery, groundingMode);

  // If Maps Grounding is explicitly selected or auto-detected and GEMINI_API_KEY is present
  if (intent === 'maps' && process.env.GEMINI_API_KEY) {
    try {
      const mapsRes = await executeMapsGrounding({
        query: sanitizedQuery,
        district: sanitizedDistrict || ragResult.districtBaseline?.district || ragResult.districtBaseline?.name,
        userCoordinates,
        contextText
      });

      if (mapsRes && mapsRes.answer) {
        return {
          query,
          answer: mapsRes.answer,
          grounding_type: 'maps',
          facilities: mapsRes.facilities || [],
          coordinates: mapsRes.coordinates,
          retrieved_sources: ragResult.results.map(r => ({
            id: r.id,
            title: r.title,
            category: r.category,
            relevanceScore: r.score
          })),
          district_baseline: ragResult.districtBaseline,
          district_contacts: getDistrictContacts(ragResult.districtBaseline),
          govt_directory: GOVT_OFFICE_DIRECTORY,
          suggested_followups: [
            `Show emergency shelters in ${sanitizedDistrict || 'my district'} on Google Maps`,
            'What is the hotline for livestock emergency?',
            'Find nearest DAE Upazila Agriculture Office'
          ],
          provider_source: mapsRes.provider,
          cached: false,
          prompt: { chars: sanitizedQuery.length, truncated: false }
        };
      }
    } catch (mapsErr) {
      console.warn('[Chat Service] Maps Grounding error, cascading to standard engine:', mapsErr.message);
    }
  }

  // If Search Grounding is explicitly selected or auto-detected and GEMINI_API_KEY is present
  if (intent === 'search' && process.env.GEMINI_API_KEY) {
    try {
      const searchRes = await executeSearchGrounding({
        query: sanitizedQuery,
        district: sanitizedDistrict || ragResult.districtBaseline?.district || ragResult.districtBaseline?.name,
        contextText
      });

      if (searchRes && searchRes.answer) {
        return {
          query,
          answer: searchRes.answer,
          grounding_type: 'search',
          grounding_sources: searchRes.sources || [],
          search_queries: searchRes.searchQueries || [],
          retrieved_sources: ragResult.results.map(r => ({
            id: r.id,
            title: r.title,
            category: r.category,
            relevanceScore: r.score
          })),
          district_baseline: ragResult.districtBaseline,
          district_contacts: getDistrictContacts(ragResult.districtBaseline),
          govt_directory: GOVT_OFFICE_DIRECTORY,
          suggested_followups: [
            `What is the latest BMD weather warning for ${sanitizedDistrict || 'Bangladesh'}?`,
            'What are the active flood danger levels from FFWC?',
            'Recommended recovery steps for submerged crops'
          ],
          provider_source: searchRes.provider,
          cached: false,
          prompt: { chars: sanitizedQuery.length, truncated: false }
        };
      }
    } catch (searchErr) {
      console.warn('[Chat Service] Search Grounding error, cascading to standard engine:', searchErr.message);
    }
  }

  // 3. Format Conversation History (the sanitized copy — capped above — so a
  //    hostile/oversized history cannot bloat the prompt)
  let historyText = '';
  if (safeHistory.length > 0) {
    historyText = `\n=== RECENT CONVERSATION HISTORY ===\n` +
      safeHistory.slice(-4).map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n') + '\n';
  }

  // Every LLM tier in the fallback engine is invoked in JSON mode
  // (Gemini responseMimeType / OpenRouter+Groq response_format), so the
  // response contract must be ONE explicit JSON object. The old free-form
  // "Markdown answer + JSON block at the end" instruction made JSON-locked
  // models improvise and the parser miss the answer.
  const promptTail = `\n=== USER QUERY ===\n${sanitizedQuery}\n\nAnswer the user's query using the retrieved RAG knowledge above (plus the
district baseline and official helplines whenever relevant). Ground every
claim in that context; if it does not cover something, say so plainly.
Respond with a single valid JSON object and nothing else — no markdown
fences, no surrounding prose:
{"answer": "<your complete answer as well-structured Markdown: headings, bullets, specific varieties/protocols/dosages/helplines from the context>", "followups": ["<short follow-up question 1>", "<short follow-up question 2>", "<short follow-up question 3>"]}`;

  // SEC-11: the per-field bounds only count if the assembled prompt is capped
  // as a whole. The retrieved context is in-repo content, so truncating it is
  // safe — the note's own length is reserved up front, so the final string is
  // inside the budget even when it says so.
  const TRUNCATION_NOTE = '\n[retrieved context truncated: prompt budget reached]\n';
  const tailBudget = MAX_PROMPT_CHARS - promptTail.length - TRUNCATION_NOTE.length;
  if (historyText.length > tailBudget) historyText = historyText.slice(0, Math.max(0, tailBudget));

  const contextBudget = tailBudget - historyText.length;
  let promptTruncated = false;
  if (contextText.length > contextBudget) {
    contextText = contextBudget > 0
      ? `${contextText.slice(0, contextBudget)}${TRUNCATION_NOTE}`
      : '';
    promptTruncated = true;
  }

  const fullUserPrompt = `${contextText}${historyText}${promptTail}`;

  // Diagnostics the transports return as `prompt`: tests (and operators) can
  // verify the bound is enforced rather than merely computed.
  const promptStats = { chars: fullUserPrompt.length, truncated: promptTruncated };

  // 4. Generate Answer via Multi-Provider HA Fallback Engine with RAG Skills Routing
  const targetDistrict = district || ragResult.districtBaseline?.district || ragResult.districtBaseline?.name || 'Bangladesh';
  const detectedHazard = inferHazardTheme(sanitizedQuery, ragResult.districtBaseline);

  let routedSkillsPrompt = '';
  try {
    routedSkillsPrompt = routeSkills({
      district_name: targetDistrict,
      hazard_type: detectedHazard,
      severity_score: 0.65,
      confidence: 0.90
    });
  } catch (skillErr) {
    console.warn('[Chat Service] routeSkills routing warning:', skillErr.message);
  }

  const effectiveSystemPrompt = routedSkillsPrompt
    ? `${routedSkillsPrompt}\n\n=== ADDITIONAL ADVISOR DIRECTIVES ===\n${systemPrompt}`
    : systemPrompt;

  const aiParams = {
    district_name: targetDistrict,
    hazard_type: detectedHazard,
    severity_score: 0.65,
    confidence: 0.90
  };

  let aiResponse;
  try {
    aiResponse = await generateAdvisoryWithFallback(aiParams, effectiveSystemPrompt, fullUserPrompt);
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
      district: ragResult.districtBaseline.district || ragResult.districtBaseline.name,
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
    routed_skills: {
      hazard_category: detectedHazard,
      routed: Boolean(routedSkillsPrompt),
      institutional_protocols: ['DAE', 'BRRI', 'BARI', 'DLS', 'DoF', 'BMD', 'BWDB']
    },
    suggested_followups: followups,
    provider_source: aiResponse?.provider_source || 'HazardNet RAG Knowledge Engine',
    cached: aiResponse?.cached || false,
    prompt: promptStats
  };
}
