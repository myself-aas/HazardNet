/**
 * Vercel Serverless Function — the AI Advisor chat surface.
 *
 * GET  /api/chat/sample-questions   quick-start chips (no middleware, minimal cold start)
 * POST /api/chat/query              the widget's question endpoint (identity + AI limiter)
 *
 * Both handlers live in `serverless/chat/`, which Vercel does not scan for functions —
 * one entry file, two URLs, under the 12-function Hobby budget
 * (docs/codebase/VERCEL_FUNCTIONS.md). The loaders are literal so the bundler can trace
 * them, and per request so the (Express-based) query handler's graph never loads for a
 * sample-questions request.
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
