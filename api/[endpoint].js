/**
 * Node Serverless Function — the top-level API surface.
 *
 * One function file covers every one-segment endpoint: the URL families keep the function
 * count small, and the handlers themselves live in `serverless/`, a directory no function
 * host scans (see docs/codebase/ARCHITECTURE.md#the-node-function-surface-api). The surface
 * is pinned by __tests__/api/serverlessRouting.test.js.
 *
 * Served here (unchanged URLs, unchanged handlers):
 *   POST /api/forecasts    CSV upload → advisories (Gemini) → forecast store
 *   (retired 2026-10-27: /api/historical and /api/metrics — see docs/ops/owner-actions.md Action 21)
 *   POST /api/ingest       forecast-chunk ingestion
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
    ingest: () => import('../serverless/ingest.js'),
    predict: () => import('../serverless/predict.js'),
  },
});
