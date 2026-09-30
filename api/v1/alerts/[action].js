/**
 * Vercel Serverless Function — the alert actions.
 *
 * GET  /api/v1/alerts/evidence-card?id=<alert-id>   evidence card for one alert
 * GET  /api/v1/alerts/policy                        effective policy (overrides + defaults)
 * POST /api/v1/alerts/review                        record a review decision
 * POST /api/v1/alerts/run                           run the detector pipeline
 *
 * All four handlers live in `serverless/v1/alerts/` (not scanned for functions), so the
 * alert family costs one function instead of four — Vercel's Hobby plan allows 12 per
 * deployment (docs/codebase/VERCEL_FUNCTIONS.md), and the count is enforced by
 * scripts/check-vercel-functions.mjs.
 *
 * `policy` is intentionally first in the load order of the family's docs: it is the
 * dependency-free entry (no store, no auth) and the one the uptime probe hits.
 */

import { createDispatcher } from '../../../serverless/dispatch.js';

export default createDispatcher({
  param: 'action',
  entry: 'api/v1/alerts/[action].js',
  routes: {
    'evidence-card': () => import('../../../serverless/v1/alerts/evidence-card.js'),
    policy: () => import('../../../serverless/v1/alerts/policy.js'),
    review: () => import('../../../serverless/v1/alerts/review.js'),
    run: () => import('../../../serverless/v1/alerts/run.js'),
  },
});
