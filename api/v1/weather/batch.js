/**
 * Node Serverless Function — batch weather lookup.
 *
 * POST /api/v1/weather/batch   current conditions for many coordinates at once
 *
 * This one keeps its own file (rather than folding into `api/v1/[resource].js`) because it
 * is the only endpoint that reads a large request body (an array of points) and needs its
 * own export shape rather than a dispatcher entry. It is still one function, not two.
 *
 * The handler lives in `serverless/v1/weather/batch.js` (not scanned for functions) —
 * docs/codebase/ARCHITECTURE.md#the-node-function-surface-api.
 */

export { default } from '../../../serverless/v1/weather/batch.js';

export const config = { api: { bodyParser: { sizeLimit: '256kb' } } };
