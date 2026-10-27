/**
 * Node Serverless Function — the `/api/v1` resource surface.
 *
 * GET  /api/v1/alerts      deployed alert list (reads the same policy/store as the alerts below)
 * (retired 2026-10-27: /api/v1/historical — the CDN serves /data/historical/*.json)
 * GET  /api/v1/weather     current + forecast for one point (`lat`,`lng`)
 * POST /api/v1/telemetry   anonymous product-analytics batches from @hazardnet/analytics
 *                          (validated, never persisted — see serverless/v1/telemetry.js)
 *
 * Handlers live in `serverless/v1/` (not scanned for functions) — one entry point for four
 * URLs (docs/codebase/ARCHITECTURE.md#the-node-function-surface-api). Loaders are literal
 * (bundler traceability) and per request (fault and cold-start isolation).
 */

import { createDispatcher } from '../../serverless/dispatch.js';

export default createDispatcher({
  param: 'resource',
  entry: 'api/v1/[resource].js',
  routes: {
    alerts: () => import('../../serverless/v1/alerts/index.js'),
    kaggle: () => import('../../serverless/v1/kaggle.js'),
    telemetry: () => import('../../serverless/v1/telemetry.js'),
    weather: () => import('../../serverless/v1/weather.js'),
  },
});
