import express from 'express';
import { getKaggleAdvisories } from '../services/kaggleAdvisoryClient.js';

const router = express.Router();

/**
 * GET /api/v1/kaggle/advisories?horizon=7_days
 *
 * The advisory forecast rows as last fetched from the Kaggle Dataset API, with the fetch
 * time, the dataset's own generated_at, and the status:
 *   fresh        fetched inside the refresh window
 *   stale        Kaggle could not be reached now; rows are the last successful fetch
 *   unavailable  no successful fetch yet; no rows (HTTP 503)
 * No credentials appear in the response.
 */
router.get('/advisories', async (req, res) => {
  const horizon = typeof req.query.horizon === 'string' && req.query.horizon ? req.query.horizon : '7_days';
  if (!['7_days', '15_days'].includes(horizon)) {
    return res.status(400).json({ error: 'horizon must be 7_days or 15_days' });
  }
  const snapshot = await getKaggleAdvisories();
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
  res.set('Cache-Control', 'no-store');
  return res.status(snapshot.status === 'unavailable' ? 503 : 200).json(body);
});

export default router;
