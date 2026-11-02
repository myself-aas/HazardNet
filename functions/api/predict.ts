/**
 * `POST /api/predict` — Cloudflare Pages Function serving stored district predictions
 * from `/data/daily-advisories-v1.json` (when present/newer) and `/data/forecasts-latest.json`.
 */

import {
  loadForecastOrDailySnapshot,
  storedPredictionFromSnapshot,
} from '../../backend/utils/forecastSnapshotServe.js';

interface PagesContext {
  request: Request;
  env: { ASSETS?: { fetch: (input: Request) => Promise<Response> } };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const started = Date.now();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'District payload required' }, 422);
  }

  const loaded = await loadForecastOrDailySnapshot(env, request);
  if ('error' in loaded) {
    console.error('[predict] snapshot unavailable:', loaded.error);
    return json({ error: 'Stored forecast unavailable', detail: loaded.error }, 503);
  }

  try {
    const result = storedPredictionFromSnapshot(loaded.snapshot, payload, {
      storeLatencyMs: Date.now() - started,
    });
    return json(result.body, result.status);
  } catch (error) {
    console.error('[predict] envelope error:', error instanceof Error ? error.message : error);
    return json({ error: 'Stored forecast unavailable' }, 500);
  }
}
