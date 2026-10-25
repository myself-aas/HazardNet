/**
 * POST /api/ingest — the forecast pipeline's write path, deployed through
 * api/[endpoint].js. Chunks arrive from the nightly forecast job (or a backfill) as
 * `{ chunk: [rows…] }`; the rows must already satisfy the public.forecasts shape —
 * horizon is the domain enum ('7_days' | '15_days'), matching the CSV path and the
 * table's CHECK constraint.
 *
 * Persistence goes through backend/forecastPersistence.js so Firestore and the PG
 * fallback stay in lockstep, and failures surface as a 500: a pipeline run whose rows
 * never landed must exit red, not log-and-succeed. The guard runs on the `pipeline`
 * bucket — the keyed ceiling is the runaway guard, not the anti-probing limit
 * (see backend/middleware/serverlessGuard.js).
 */

import { persistForecasts } from '../backend/forecastPersistence.js';
import { verifyApiKey } from '../backend/utils/apiKeyAuth.js';
import { guardRequest } from '../backend/middleware/serverlessGuard.js';

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'pipeline' })) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const auth = verifyApiKey(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return res.status(400).json({ error: 'body must be valid JSON' });
    }
  }
  const chunk = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.chunk : undefined;
  if (!Array.isArray(chunk) || chunk.length === 0) {
    return res.status(400).json({ error: 'body must carry a non-empty chunk array' });
  }

  try {
    const result = await persistForecasts(chunk);
    return res.status(200).json({ count: result?.written ?? chunk.length });
  } catch {
    // The workflow reads only the status + this error; the store's own logs hold detail.
    return res.status(500).json({ error: 'Forecast store write failed' });
  }
}
