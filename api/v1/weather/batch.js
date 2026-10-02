/**
 * Vercel Serverless Function — batch weather lookup.
 *
 * POST /api/v1/weather/batch   current conditions for many coordinates at once
 *
 * This one keeps its own file (rather than folding into `api/v1/[resource].js`) because
 * it is the only endpoint with a per-function `config`: the 256 kb body limit has to be
 * attached to the function that reads the points array, and Vercel applies `config`
 * per function file. It is still one function, not two.
 *
 * The handler lives in `serverless/v1/weather/batch.js` (not scanned for functions) —
 * docs/codebase/ARCHITECTURE.md#vercel-serverless-surface-the-12-function-budget.
 */

export { default } from '../../../serverless/v1/weather/batch.js';

export const config = { api: { bodyParser: { sizeLimit: '256kb' } } };
