/**
 * `POST /api/predict` — Cloudflare Pages Function serving stored district predictions
 * from `/data/daily-advisories-v1.json` (when present/newer) and `/data/forecasts-latest.json`.
 */

import {
  loadForecastOrDailySnapshot,
  storedPredictionFromSnapshot,
} from '../../backend/utils/forecastSnapshotServe.js';
import { respond, respondError, type PagesContext } from '../../backend/edge/response';

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const started = Date.now();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return respond({ error: 'District payload required' }, { status: 422 });
  }

  const loaded = await loadForecastOrDailySnapshot(env, request);
  if ('error' in loaded) {
    return respondError(new Error(loaded.error), {
      scope: 'api/predict',
      status: 503,
      fallback: 'Stored forecast unavailable',
    });
  }

  try {
    const result = storedPredictionFromSnapshot(loaded.snapshot, payload, {
      storeLatencyMs: Date.now() - started,
    });
    return respond(result.body, { status: result.status });
  } catch (error) {
    return respondError(error, {
      scope: 'api/predict',
      status: 500,
      fallback: 'Stored forecast unavailable',
    });
  }
}
