/**
 * GET /api/chat/sample-questions — categorized quick-start chips for the AI Advisor
 * widget.
 *
 * Deliberately the lightest endpoint in the family: a static, dependency-free answer
 * (no middleware chain, minimal cold start) so the widget renders even when the rest
 * of the chat surface is down. Same payload as the Express twin
 * (backend/utils/chatService.js sampleQuestionsHandler). Deployed through
 * api/chat/[action].js.
 */

import { guardRequest } from '../../backend/middleware/serverlessGuard.js';
import { sampleQuestionsHandler } from '../../backend/utils/chatService.js';

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'read' })) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  return sampleQuestionsHandler(req, res);
}
