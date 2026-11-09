/**
 * `GET /api/v1/forecasts/bulk` — the map's heatmap payload, on the edge.
 *
 * Cloudflare Pages Function: `functions/api/v1/forecasts/bulk.ts` routes to
 * `https://www.hazardnet.live/api/v1/forecasts/bulk`. Same origin as the site, so there is
 * no CORS preflight, no `Vary: Origin` and no second host to keep alive — the reason this
 * target was chosen over a standalone Worker (`docs/ops/owner-actions.md` Action 21).
 *
 * The shape mirrors `serverless/v1/forecasts/bulk.js`, which stays the Node runtime's
 * handler for the Express/Docker deployment. Both answer with the same envelope; the
 * difference is where the rows come from — Firestore-first there, the committed snapshot
 * here (`backend/utils/forecastSnapshotServe.js` says why at length). Query validation is
 * imported, not re-typed, so an invalid horizon produces the same 400 and the same message
 * on both runtimes; `__tests__/pagesForecasts.test.js` pins that.
 *
 * Method gating is Pages' own: exporting only `onRequestGet` makes Pages answer 405 for
 * everything else, so there is no method branch to get wrong here.
 */

import { parseBulkQuery } from '../../../../backend/utils/forecastServe.js';
import {
  bulkEnvelopeFromSnapshot,
  loadForecastSnapshot,
  snapshotDataSource,
} from '../../../../backend/utils/forecastSnapshotServe.js';
import { CACHE, respond, type PagesContext } from '../../../../backend/edge/response';

// The payload carries a per-response `generated_at`, so a cached copy would report a time
// that is not this response's — parity with `serverless/v1/forecasts/bulk.js`. If Function
// invocations ever become the constraint, `CACHE.revalidate` is the single line to revisit;
// the rows themselves only change when a new snapshot is deployed.

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = parseBulkQuery(query);
  if ('error' in parsed) {
    return respond({ error: parsed.error }, { status: 400 });
  }

  const loaded = await loadForecastSnapshot(env, request);
  if ('error' in loaded) {
    // Logged, not echoed: a probe log that says "snapshot asset answered 404" points at the
    // build output, while "Internal server error" points at nothing — but the asset error
    // also names a path on the deployment, which a stranger may not read.
    console.error('[forecasts/bulk] snapshot unavailable:', loaded.error);
    return respond({ error: 'forecast snapshot is unavailable' }, { status: 503 });
  }

  return respond(
    bulkEnvelopeFromSnapshot(loaded.snapshot, parsed.horizon, {
      dataSource: snapshotDataSource(env),
    }),
    { cache: CACHE.noStore }
  );
}
