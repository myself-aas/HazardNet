/**
 * POST /api/chat/query — the AI Advisor question endpoint (RAG retrieval + multi-tier
 * generation).
 *
 * The implementation lives in backend/utils/chatService.js so this twin behaves
 * identically to the Express route (backend/routes/chat.js POST /query), including the
 * error contract: a thrown statusCode is answered as-is, anything else becomes a
 * generic 500 with the message. Metered on the AI bucket — generation is the
 * expensive surface anonymous callers must not run away with.
 *
 * Deployed through api/chat/[action].js; see docs/codebase/ARCHITECTURE.md#vercel-serverless-surface-the-12-function-budget.
 */

import { guardRequest } from '../../backend/middleware/serverlessGuard.js';

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'ai' })) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  // Lazy: the chat service graph (Gemini clients, grounding) never cold-starts for a
  // sample-questions request on the sibling route.
  const { handleChatQuery } = await import('../../backend/utils/chatService.js');

  try {
    const { query, district, conversationHistory, groundingMode, userCoordinates } = req.body || {};
    const payload = await handleChatQuery({
      query, district, conversationHistory, groundingMode, userCoordinates,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(payload);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Chat Query Error:', err);
    return res.status(500).json({
      error: 'Failed to process RAG chat query',
      message: err.message,
    });
  }
}
