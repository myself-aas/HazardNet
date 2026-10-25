/**
 * POST /api/predict — the public inference surface, deployed through api/[endpoint].js.
 *
 * The handwritten tensor/runtime path is retired (see __tests__/predict.test.js, which
 * pins this file's delegation): prediction is served from the durable forecast store —
 * same rows the map and advisory surfaces read — via serveStoredPrediction. The serverless
 * wrapper adds the guard (the Express rate limiter never runs here) and the method gate;
 * all validation, the retired-envelope 400 for legacy `tensor`/`rasterName` clients, and
 * the hazardnet-predict-envelope/v1 shape live in backend/utils/storedPrediction.js.
 */

import { serveStoredPrediction } from '../backend/utils/storedPrediction.js';
import { guardRequest } from '../backend/middleware/serverlessGuard.js';

export default async function handler(req, res) {
  // `ai`-tier: prompt-sized request rate against a store read, unauthenticated by design.
  if (guardRequest(req, res, { bucket: 'ai' })) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  return serveStoredPrediction(req, res);
}
