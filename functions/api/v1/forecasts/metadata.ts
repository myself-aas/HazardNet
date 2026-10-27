/**
 * `GET /api/v1/forecasts/metadata` — the freshness headline, on the edge.
 *
 * This is the endpoint `.github/workflows/site-health.yml` probes (`API_URL` defaults to
 * `${SITE_URL}/api/v1/forecasts/metadata`), so until it answers, the probe takes its
 * snapshot fallback and emits a warning on every run. Porting `bulk` alone would have left
 * the monitor reading a 404 while the API was "up" for everything else, which is the kind
 * of half-true state this repository keeps a register for.
 *
 * Shape is the Node handler's (`serverless/v1/forecasts/metadata.js`), including the nulls:
 * an empty store answers `prediction_date: null` there, and an empty snapshot answers the
 * same here — SLO monitors are supposed to treat absent freshness as an alarm, not as
 * "nothing to report".
 */

import { metadataDatasets } from '../../../../backend/utils/forecastServe.js';
import {
  loadForecastSnapshot,
  metadataEnvelopeFromSnapshot,
  snapshotDataSource,
} from '../../../../backend/utils/forecastSnapshotServe.js';

/** The subset of the Pages `EventContext` this route uses. */
interface PagesContext {
  request: Request;
  env: { ASSETS?: { fetch: (input: Request) => Promise<Response> }; FORECAST_DATASET?: string };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // A freshness answer is worth nothing if it is cached: the whole point is to report
      // the artifact currently deployed, which changes only on a deploy.
      'cache-control': 'no-store, max-age=0',
    },
  });
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  const loaded = await loadForecastSnapshot(env, request);
  if ('error' in loaded) {
    console.error('[forecasts/metadata] snapshot unavailable:', loaded.error);
    return json({ error: 'forecast snapshot is unavailable', detail: loaded.error }, 503);
  }

  return json(
    metadataEnvelopeFromSnapshot(loaded.snapshot, {
      dataSource: snapshotDataSource(env),
      // Imported from the shared module rather than duplicated: the dataset list carries a
      // content id and a canonical URL, and two copies of an id is one copy too many.
      datasets: metadataDatasets(),
    }),
    200
  );
}
