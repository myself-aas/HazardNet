import express from 'express';
import {
  handleChatQuery,
  sampleQuestionsHandler,
  directoryHandler,
} from '../utils/chatService.js';
import { createNodeAssetReader } from '../mcp/nodeAdapter.js';

const router = express.Router();

/**
 * Express has no Cloudflare `ASSETS` binding, so the agent's tool pack gets the
 * equivalent allow-listed reader: the same `PUBLIC_ASSET_PATHS`, served from the
 * built frontend when present and `frontend/public` otherwise. Without it the
 * agent reports itself disabled rather than failing — the answer then rests on
 * the knowledge base alone and says so.
 */
const assets = createNodeAssetReader(process.cwd());

/**
 * POST /api/chat/query
 * Execute RAG Retrieval + Multi-Tier AI Generation.
 * Implementation lives in backend/utils/chatService.js so the Node-function
 * twin (serverless/chat/query.js) behaves identically.
 */
router.post('/query', async (req, res) => {
  try {
    const { query, district, conversationHistory, groundingMode, userCoordinates } = req.body || {};
    const payload = await handleChatQuery({ query, district, conversationHistory, groundingMode, userCoordinates }, undefined, { assets });
    res.json(payload);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Chat Query Error:', err);
    res.status(500).json({
      error: 'Failed to process RAG chat query',
      message: err.message
    });
  }
});

/**
 * GET /api/chat/directory
 * Get complete Directory of Govt Offices, Officers, Helplines & Web Portals
 */
router.get('/directory', directoryHandler);

/**
 * GET /api/chat/sample-questions
 * Return categorized sample queries for quick user exploration
 */
router.get('/sample-questions', sampleQuestionsHandler);

export default router;
