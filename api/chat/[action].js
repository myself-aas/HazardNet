/**
 * Node Serverless Function — the AI Advisor chat surface.
 *
 * GET  /api/chat/sample-questions   quick-start chips (no middleware, minimal cold start)
 * POST /api/chat/query              the widget's question endpoint (identity + AI limiter)
 *
 * Both handlers live in `serverless/chat/`, which no function host scans for functions —
 * one entry file, two URLs (docs/codebase/ARCHITECTURE.md#the-node-function-surface-api).
 * The loaders are literal so a bundler can trace them, and per request so the
 * (Express-based) query handler's graph never loads for a sample-questions request.
 */

import { createDispatcher } from '../../serverless/dispatch.js';

export default createDispatcher({
  param: 'action',
  entry: 'api/chat/[action].js',
  routes: {
    query: () => import('../../serverless/chat/query.js'),
    'sample-questions': () => import('../../serverless/chat/sample-questions.js'),
  },
});
