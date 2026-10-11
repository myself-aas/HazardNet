// GET /api/v1/kaggle (and /api/v1/kaggle/advisories) — deployed by the Vercel entry point
// api/v1/[resource].js.
//
// Advisory forecast rows as last fetched from the Kaggle Dataset API, with the fetch
// time, the dataset's own generated_at, and the status:
//   fresh        fetched inside the refresh window
//   stale        Kaggle could not be reached now; rows are the last successful fetch
//   unavailable  no successful fetch yet; no rows (HTTP 503)
// No credentials appear in the response.

import { getKaggleAdvisories } from '../../backend/services/kaggleAdvisoryClient.js';
import { guardRequest } from '../../backend/middleware/serverlessGuard.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  if (guardRequest(req, res, { bucket: 'read' })) return;

  const horizon = typeof req.query.horizon === 'string' && req.query.horizon ? req.query.horizon : '7_days';
  if (!['7_days', '15_days'].includes(horizon)) {
    res.status(400).json({ error: 'horizon must be 7_days or 15_days' });
    return;
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

  res.setHeader('Cache-Control', 'no-store');
  res.status(snapshot.status === 'unavailable' ? 503 : 200).json(body);
}
