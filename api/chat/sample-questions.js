// Vercel Serverless Function — GET /api/chat/sample-questions
//
// Companion to api/chat/query.js (API-parity fix, 2026-09-17): the AI Advisor
// widget fetches these quick-start chips when it opens. Thin wrapper over
// backend/utils/chatService.js so production and the Express backend serve
// identical categories. No middleware → minimal cold start.

import { guardRequest } from '../../backend/middleware/serverlessGuard.js';
import { sampleQuestionsHandler } from '../../backend/utils/chatService.js';

export default function handler(req, res) {
  // Serverless-suite guard (SEC-07): every handler under api/ must apply the
  // api-level guard (static scan in __tests__/api/serverlessGuard.test.js).
  if (guardRequest(req, res, { bucket: 'read' })) return;
  sampleQuestionsHandler(req, res);
}
