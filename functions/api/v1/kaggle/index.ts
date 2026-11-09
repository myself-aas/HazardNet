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
import { respond, type PagesContext } from '../../../../backend/edge/response';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const horizon = url.searchParams.get('horizon') || '7_days';

  if (horizon !== '7_days' && horizon !== '15_days' && horizon !== 'daily') {
    return respond({ error: 'horizon must be 7_days, 15_days, or daily' }, { status: 400 });
  }

  if (horizon === 'daily') {
    const dailySnapshot = await loadPublicDailyAsset(env, request);
    const district = url.searchParams.get('district') || undefined;
    const result = queryPublicDaily(dailySnapshot, {
      scope: 'timeline',
      days: '15',
      ...(district ? { district } : {}),
    });
    return respond(result.body, { status: result.code });
  }

  const loaded = await loadForecastOrDailySnapshot(env, request);
  if ('error' in loaded) {
    return respond({
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
    }, { status: 503 });
  }

  const envelope = kaggleEnvelopeFromSnapshot(loaded.snapshot, horizon, {
    dailyMeta: loaded.dailyMeta ?? null,
  });
  return respond(envelope, { status: envelope.status === 'unavailable' ? 503 : 200 });
}
