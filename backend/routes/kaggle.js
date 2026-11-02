import express from 'express';
import { getKaggleAdvisories } from '../services/kaggleAdvisoryClient.js';
import { queryPublicDaily } from '../utils/dailyAdvisoryServe.js';

const router = express.Router();

/**
 * GET /api/v1/kaggle/advisories?horizon=7_days|15_days|daily
 *
 * The advisory forecast rows as last fetched from the Kaggle Dataset API, with the fetch
 * time, the dataset's own generated_at, and the status:
 *   fresh        fetched inside the refresh window
 *   stale        Kaggle could not be reached now; rows are the last successful fetch
 *   unavailable  no successful fetch yet; no rows (HTTP 503)
 * No credentials appear in the response.
 */
router.get(['/', '/advisories'], async (req, res) => {
  const horizon = typeof req.query.horizon === 'string' && req.query.horizon ? req.query.horizon : '7_days';
  if (!['7_days', '15_days', 'daily'].includes(horizon)) {
    return res.status(400).json({ error: 'horizon must be 7_days, 15_days, or daily' });
  }
  const snapshot = await getKaggleAdvisories();
  res.set('Cache-Control', 'no-store');

  if (horizon === 'daily') {
    if (!snapshot.dailySnapshot) {
      return res.status(503).json({ error: 'Published district advisories are unavailable' });
    }
    const district = typeof req.query.district === 'string' ? req.query.district : undefined;
    const daily = queryPublicDaily(snapshot.dailySnapshot, { scope: 'timeline', days: '15', ...(district ? { district } : {}) });
    return res.status(daily.code).json(daily.body);
  }

  const rows = (snapshot.rows || []).filter((row) => row.horizon === horizon);
  const body = {
    status: snapshot.status,
    source: snapshot.source,
    dataset: snapshot.dataset,
    file: snapshot.file,
    horizon,
    fetchedAt: snapshot.fetchedAt,
    generatedAt: snapshot.generatedAt,
    sha256: snapshot.sha256 ?? null,
    rowCount: rows.length,
    lastError: snapshot.lastError ?? null,
    data: rows,
  };
  return res.status(snapshot.status === 'unavailable' ? 503 : 200).json(body);
});

export default router;
