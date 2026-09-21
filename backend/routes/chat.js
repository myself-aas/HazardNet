import express from 'express';
import {
  handleChatQuery,
  sampleQuestionsHandler,
  directoryHandler,
} from '../utils/chatService.js';

const router = express.Router();

/**
 * POST /api/chat/query
 * Execute RAG Retrieval + Multi-Tier AI Generation.
 * Implementation lives in backend/utils/chatService.js so the Vercel
 * serverless twin (api/chat/query.js) behaves identically.
 */
router.post('/query', async (req, res) => {
  try {
    const { query, district, conversationHistory, groundingMode, userCoordinates } = req.body || {};
    const payload = await handleChatQuery({ query, district, conversationHistory, groundingMode, userCoordinates });
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
