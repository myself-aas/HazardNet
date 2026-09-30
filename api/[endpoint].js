/**
 * Vercel Serverless Function — the top-level API surface.
 *
 * One function file covers every one-segment endpoint, because the Hobby plan allows at
 * most 12 Serverless Functions per deployment and this repository serves more URLs than
 * that (see docs/codebase/VERCEL_FUNCTIONS.md; the budget is enforced by
 * scripts/check-vercel-functions.mjs). The handlers themselves live in `serverless/`,
 * which Vercel does not scan for functions.
 *
 * Served here (unchanged URLs, unchanged handlers):
 *   POST /api/forecasts    CSV upload → advisories (Gemini) → forecast store
 *   GET  /api/historical   legacy alias of /api/v1/historical
 *   POST /api/ingest       forecast-chunk ingestion
 *   GET  /api/metrics      Prometheus exposition
 *   POST /api/predict      stored prediction lookup
 *
 * Each loader is a literal specifier so the platform's bundler can trace it; they run per
 * request, so one endpoint's import graph (and its failures) stays out of the others'.
 *
 * A path that is not in the table is answered with a JSON 404 (metered as a read) rather
 * than the edge's HTML 404 — the frontend's mis-wired calls (e.g. `/api/push/vapid-key`,
 * which only the Express backend serves) are then visible as JSON, not as an HTML page.
 */

import { createDispatcher } from '../serverless/dispatch.js';

export default createDispatcher({
  param: 'endpoint',
  entry: 'api/[endpoint].js',
  routes: {
    forecasts: () => import('../serverless/forecasts.js'),
    historical: () => import('../serverless/historical.js'),
    ingest: () => import('../serverless/ingest.js'),
    metrics: () => import('../serverless/metrics.js'),
    predict: () => import('../serverless/predict.js'),
  },
});
