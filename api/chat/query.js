// Vercel Serverless Function — POST /api/chat/query
//
// API-parity fix (2026-09-17): the AI Advisor widget calls /api/chat/query,
// but that route only existed on the Express backend — which is not what
// serves the Vercel deployment. Every production message 404'd (HTML) and the
// widget replied "There was an error communicating with the AI. Please try
// again later."
//
// Thin wrapper over backend/utils/chatService.js (same contract as
// backend/routes/chat.js) mounted on a micro Express app so the identity /
// dynamic rate-limiting middlewares apply here exactly as on the Express
// backend (anonymous 10 req/min, signed-in 60 req/min — SEC-01).

import express from 'express';
import { attachFirebaseAuthUser, dynamicAiLimiter } from '../../backend/middleware/firebaseAuth.js';
import { guardRequest } from '../../backend/middleware/serverlessGuard.js';
import { handleChatQuery } from '../../backend/utils/chatService.js';

const app = express();

// Vercel terminates TLS at its edge; express-rate-limit needs the client IP
// from the forwarded headers rather than the proxy's.
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(attachFirebaseAuthUser, dynamicAiLimiter);

async function queryHandler(req, res) {
  // Serverless-suite guard (SEC-07): the static scan in
  // __tests__/api/serverlessGuard.test.js requires every handler under api/
  // to apply the api-level guard; 'read' keeps it above the identity-aware
  // dynamicAiLimiter ceilings (10/min anonymous, 60/min signed-in) so the
  // real rationing stays with the limiter written for this endpoint.
  if (guardRequest(req, res, { bucket: 'read' })) return;
  try {
    const { query, district, conversationHistory } = req.body || {};
    const payload = await handleChatQuery({ query, district, conversationHistory });
    res.json(payload);
  } catch (err) {
    if (err.statusCode) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    console.error('Chat Query Error (serverless):', err);
    res.status(500).json({
      error: 'Failed to process RAG chat query',
      message: err.message
    });
  }
}

// Vercel passes the original URL (/api/chat/query). The duplicate mount also
// covers the relative form (/query) in case the runtime rewrites req.url.
app.post('/api/chat/query', queryHandler);
app.post('/query', queryHandler);

export default app;
