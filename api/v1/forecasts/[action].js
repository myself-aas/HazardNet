/**
 * Vercel Serverless Function — the forecast read surface.
 *
 * GET /api/v1/forecasts/bulk?horizon=7_days|15_days   all districts in one payload
 * GET /api/v1/forecasts/history                       persisted predictions over time
 * GET /api/v1/forecasts/metadata                      dataset freshness for the banner
 *
 * The handlers live in `serverless/v1/forecasts/` (not scanned for functions), so the
 * three URLs share one function against the 12-function Hobby budget —
 * docs/codebase/VERCEL_FUNCTIONS.md. Literal loaders keep the bundler able to trace them;
 * per-request loaders keep each URL's import graph out of its siblings'.
 */

import { createDispatcher } from '../../../serverless/dispatch.js';

export default createDispatcher({
  param: 'action',
  entry: 'api/v1/forecasts/[action].js',
  routes: {
    bulk: () => import('../../../serverless/v1/forecasts/bulk.js'),
    history: () => import('../../../serverless/v1/forecasts/history.js'),
    metadata: () => import('../../../serverless/v1/forecasts/metadata.js'),
  },
});
