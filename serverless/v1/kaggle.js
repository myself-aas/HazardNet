/**
 * GET /api/v1/kaggle[/advisories]?horizon=7_days — advisory forecast rows as last
 * fetched from the Kaggle Dataset API, with fetch status (fresh / stale /
 * unavailable→503) and metadata; no credentials ever appear in the response.
 *
 * Row selection and envelope are shared with the Express twin
 * (backend/routes/kaggle.js) so the two runtimes answer identically. Deployed through
 * api/v1/[resource].js; see docs/codebase/ARCHITECTURE.md#the-node-function-surface-api.
 */

import { guardRequest } from '../../backend/middleware/serverlessGuard.js';
import { getKaggleAdvisories } from '../../backend/services/kaggleAdvisoryClient.js';
import { queryPublicDaily } from '../../backend/utils/dailyAdvisoryServe.js';

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'read' })) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const horizon = typeof req.query?.horizon === 'string' && req.query.horizon
    ? req.query.horizon
    : '7_days';
  if (!['7_days', '15_days', 'daily'].includes(horizon)) {
    return res.status(400).json({ error: 'horizon must be 7_days, 15_days, or daily' });
  }

  try {
    const snapshot = await getKaggleAdvisories();
    res.setHeader('Cache-Control', 'no-store');
    if (horizon === 'daily') {
      if (!snapshot.dailySnapshot) {
        return res.status(503).json({ error: 'Published district advisories are unavailable' });
      }
      const district = typeof req.query?.district === 'string' ? req.query.district : undefined;
      const daily = queryPublicDaily(snapshot.dailySnapshot, { scope: 'timeline', days: '15', ...(district ? { district } : {}) });
      return res.status(daily.code).json(daily.body);
    }

    const rows = (snapshot.rows || []).filter((row) => row.horizon === horizon);
    return res.status(snapshot.status === 'unavailable' ? 503 : 200).json({
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
    });
  } catch (error) {
    console.error('[kaggle] advisory read failed:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
