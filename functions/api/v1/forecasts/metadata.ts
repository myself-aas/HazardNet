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
import { respond, type PagesContext } from '../../../../backend/edge/response';

// A freshness answer is worth nothing if it is cached: the whole point is to report the
// artifact currently deployed, which changes only on a deploy. Hence `CACHE.noStore`.

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  const loaded = await loadForecastSnapshot(env, request);
  if ('error' in loaded) {
    console.error('[forecasts/metadata] snapshot unavailable:', loaded.error);
    return respond({ error: 'forecast snapshot is unavailable' }, { status: 503 });
  }

  return respond(
    metadataEnvelopeFromSnapshot(loaded.snapshot, {
      dataSource: snapshotDataSource(env),
      // Imported from the shared module rather than duplicated: the dataset list carries a
      // content id and a canonical URL, and two copies of an id is one copy too many.
      datasets: metadataDatasets(),
    })
  );
}
