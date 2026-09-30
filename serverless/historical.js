import { serveHistorical } from './v1/historical.js';
import { guardRequest } from '../backend/middleware/serverlessGuard.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  if (guardRequest(req, res, { bucket: 'read' })) return;
  return serveHistorical(req, res);
}
