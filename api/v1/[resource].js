/**
 * Vercel Serverless Function — the `/api/v1` resource surface.
 *
 * GET  /api/v1/alerts      deployed alert list (reads the same policy/store as the alerts below)
 * GET  /api/v1/historical  paginated historical events (public read, large JSON)
 * GET  /api/v1/weather     current + forecast for one point (`lat`,`lng`)
 *
 * Handlers live in `serverless/v1/` (not scanned for functions), keeping the deployment
 * inside the 12-function Hobby budget — docs/codebase/VERCEL_FUNCTIONS.md. Loaders are
 * literal (bundler traceability) and per request (fault and cold-start isolation).
 */

import { createDispatcher } from '../../serverless/dispatch.js';

export default createDispatcher({
  param: 'resource',
  entry: 'api/v1/[resource].js',
  routes: {
    alerts: () => import('../../serverless/v1/alerts/index.js'),
    historical: () => import('../../serverless/v1/historical.js'),
    weather: () => import('../../serverless/v1/weather.js'),
  },
});
