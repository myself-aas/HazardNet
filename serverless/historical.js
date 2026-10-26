/**
 * GET /api/historical — legacy alias of /api/v1/historical.
 *
 * Older clients (and the first mobile builds) hard-code the top-level path; both must
 * answer the same payload, so this is a plain re-export of the canonical handler.
 * Rate-limiting travels with it: serverless/v1/historical.js already applies
 * guardRequest( before answering (double-metering here would halve the read budget),
 * so the guard requirement for this file is satisfied by delegation.
 *
 * Deployed through api/[endpoint].js; docs/codebase/ARCHITECTURE.md#the-node-function-surface-api.
 */

export { default } from './v1/historical.js';
