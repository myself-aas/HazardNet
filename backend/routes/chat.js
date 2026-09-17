import express from 'express';
import { searchRAG, GOVT_OFFICE_DIRECTORY, getAgentInstructions } from '../../rag_pipeline/index.js';
import { generateAdvisoryWithFallback } from '../utils/ai_fallback_engine.js';
import { clientError } from '../utils/clientError.js';

/**
 * Prompt bounds (SEC-11). The per-field numbers existed before this phase but the prompt
 * was assembled from raw input; these are the numbers actually enforced on the model call,
 * and `MAX_PROMPT_CHARS` bounds the whole thing including retrieved context.
 */
const MAX_QUERY_CHARS = 3000;
const MAX_HISTORY_MESSAGE_CHARS = 1500;
const MAX_PROMPT_CHARS = 12_000;


const router = express.Router();

const systemPrompt = `You are the HazardNet RAG Assistant — an expert AI advisor for Bangladesh Agriculture, Disaster Risk Management, Veterinary Care, Livestock, Fisheries, Agricultural Economics, Environmental Protection, and Humanitarian Relief.

YOUR RESPONSIBILITIES:
1. Provide accurate, practical, and action-oriented advice grounded in official Department of Agricultural Extension (DAE), Department of Livestock Services (DLS), Department of Fisheries (DoF), BMD, BWDB, BARC, BRRI, and Ministry of Disaster Management (MoDMR) protocols.
2. Whenever relevant, cite specific stress-tolerant seed varieties (e.g., BRRI dhan51, dhan52, dhan71), veterinary treatments (e.g., Anthrax spore vaccine, foot rot baths), pond protection methods, or disaster protocols.
3. Include official contact helplines (e.g. Krishi Call Centre 16123, Pranishampad 16333, Disaster Warning 1090, Emergency 999) and website links (http://www.dae.gov.bd, http://www.dls.gov.bd, http://www.fisheries.gov.bd, http://www.bmd.gov.bd, http://www.bwdb.gov.bd).
4. Maintain a polite, professional, and clear tone using well-structured Markdown headings, bullet points, and key takeaways.
5. If district context is provided, tailor your response specifically to that district's agro-ecological zone (AEZ) and local hazards.`;

/**
 * POST /api/chat/query
 * Execute RAG Retrieval + Multi-Tier AI Generation
 */
router.post('/query', async (req, res) => {
  try {
    const { query, district, conversationHistory = [] } = req.body;

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    // Input bounds & anti-DoS safeguards (SEC-11). These bounds only count if they reach
    // the prompt: the first version of this route computed `sanitizedQuery` for RAG
    // retrieval but then built the LLM prompt from the raw body, so a caller could send a
    // megabyte of text (cost, latency, and an unbounded prompt-injection surface) while the
    // code still looked bounded. Everything downstream of this block uses the sanitized
    // values, and the assembled prompt is capped as a whole.
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
      contextText += `\n=== DISTRICT BASELINE: ${ragResult.districtBaseline.district} ===\n`;
      contextText += JSON.stringify(ragResult.districtBaseline, null, 2) + '\n';
    }

    contextText += `\n=== OFFICIAL GOVT HELPLINES & WEBSITES ===\n`;
    contextText += JSON.stringify(GOVT_OFFICE_DIRECTORY, null, 2) + '\n';

    // 3. Format Conversation History
    let historyText = '';
    if (safeHistory.length > 0) {
      // Built from the sanitized history, not the raw body (see the note above).
      historyText = `\n=== RECENT CONVERSATION HISTORY ===\n` +
        safeHistory.slice(-4).map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n') + '\n';
    }

    const promptTail = `\n=== USER QUERY ===\n${sanitizedQuery}\n\nProvide a comprehensive, clear, structured Markdown answer utilizing the above retrieved RAG context. Also suggest 3 short follow-up questions at the very end formatted inside a JSON block or clean list.`;

    // The retrieved context is in-repo content, so truncating it is safe — and capping the
    // whole prompt is what makes the per-field bounds meaningful. The note's own length is
    // reserved up front, so the assembled prompt is inside the budget even when it says so.
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
      console.warn('[Chat Router] AI engine fallback error:', e.message);
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

    res.json({
      query,
      // Echoed so a client (and this repo's tests) can see the bound was applied rather
      // than trusting that it was.
      prompt: { chars: fullUserPrompt.length, truncated: promptTruncated },
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
    });

  } catch (err) {
    console.error('Chat Query Error:', err);
    clientError(res, err, { scope: 'backend/chat', fallback: 'Failed to process RAG chat query' });
  }
});

/**
 * GET /api/chat/directory
 * Get complete Directory of Govt Offices, Officers, Helplines & Web Portals
 */
router.get('/directory', (req, res) => {
  res.json(GOVT_OFFICE_DIRECTORY);
});

/**
 * GET /api/chat/sample-questions
 * Return categorized sample queries for quick user exploration
 */
router.get('/sample-questions', (req, res) => {
  res.json({
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
  });
});

export default router;
