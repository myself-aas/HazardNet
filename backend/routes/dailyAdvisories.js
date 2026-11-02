/** Express read path for the approved public asset; private research data is never loaded. */
import express from 'express';
import { queryPublicDaily } from '../utils/dailyAdvisoryServe.js';
import { readPublishedDailySnapshot } from '../utils/dailyAdvisoryNode.js';

const router = express.Router();

router.get(['/', '/latest', '/timeline', '/peak', '/summary'], async (req, res) => {
  const scope = req.path === '/' ? (req.query.scope || 'latest') : req.path.slice(1);
  const snapshot = await readPublishedDailySnapshot();
  const { code, body } = queryPublicDaily(snapshot, { ...req.query, scope });
  res.set('Cache-Control', 'no-store');
  return res.status(code).json(body);
});

export default router;
