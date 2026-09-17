// Vercel Serverless Function — GET /api/chat/sample-questions
//
// Companion to api/chat/query.js (API-parity fix, 2026-09-17): the AI Advisor
// widget fetches these quick-start chips when it opens. Thin wrapper over
// backend/utils/chatService.js so production and the Express backend serve
// identical categories. No middleware → minimal cold start.

import { sampleQuestionsHandler } from '../../backend/utils/chatService.js';

export default function handler(req, res) {
  sampleQuestionsHandler(req, res);
}
