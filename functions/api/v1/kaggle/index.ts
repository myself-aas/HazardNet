/**
 * `GET /api/v1/kaggle?horizon=7_days|15_days` — Cloudflare Pages Function serving
 * Kaggle advisory rows from the published daily snapshot (`/data/daily-advisories-v1.json`)
 * or fallback forecast snapshot (`/data/forecasts-latest.json`).
 */

import {
  kaggleEnvelopeFromSnapshot,
  loadForecastOrDailySnapshot,
} from '../../../../backend/utils/forecastSnapshotServe.js';
import { loadPublicDailyAsset, queryPublicDaily } from '../../../../backend/utils/dailyAdvisoryServe.js';

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

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const horizon = url.searchParams.get('horizon') || '7_days';

  if (horizon !== '7_days' && horizon !== '15_days' && horizon !== 'daily') {
    return json({ error: 'horizon must be 7_days, 15_days, or daily' }, 400);
  }

  if (horizon === 'daily') {
    const dailySnapshot = await loadPublicDailyAsset(env, request);
    const district = url.searchParams.get('district') || undefined;
    const result = queryPublicDaily(dailySnapshot, {
      scope: 'timeline',
      days: '15',
      ...(district ? { district } : {}),
    });
    return json(result.body, result.code);
  }

  const loaded = await loadForecastOrDailySnapshot(env, request);
  if ('error' in loaded) {
    return json({
      status: 'unavailable',
      source: 'kaggle-snapshot',
      dataset: 'ashifahmedshuvo/hazardnet-weekly-forecasts',
      file: 'hazardnet_advisories_latest.csv',
      horizon,
      fetchedAt: null,
      generatedAt: null,
      sha256: null,
      rowCount: 0,
      lastError: { code: 'SNAPSHOT_UNAVAILABLE', message: loaded.error, at: new Date().toISOString() },
      data: [],
    }, 503);
  }

  const envelope = kaggleEnvelopeFromSnapshot(loaded.snapshot, horizon, {
    dailyMeta: loaded.dailyMeta ?? null,
  });
  return json(envelope, envelope.status === 'unavailable' ? 503 : 200);
}
