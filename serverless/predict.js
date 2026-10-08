// POST /api/predict — stored prediction lookup.
// Deployed by the Vercel entry point api/[endpoint].js.
import { serveStoredPrediction } from '../backend/utils/storedPrediction.js';
import { guardRequest } from '../backend/middleware/serverlessGuard.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (guardRequest(req, res, { bucket: 'read' })) return;
  return serveStoredPrediction(req, res);
}
