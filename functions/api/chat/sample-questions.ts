/**
 * `GET /api/chat/sample-questions` — the AI Advisor quick-start chips, on the edge.
 *
 * Same port story as `query.ts`: until 2026-11-04 no `functions/api/chat/**`
 * existed, so on the Pages deployment this GET fell through to the static asset
 * server (404) and the widget silently rendered no sample chips. The list itself is
 * the same exported `SAMPLE_QUESTIONS` constant the Express route
 * (`backend/routes/chat.js`) and the Node twin (`serverless/chat/sample-questions.js`)
 * serve, so the three runtimes cannot drift.
 *
 * The content is static, so — like `/api/v1/alerts/policy` — it is cacheable at the
 * edge; the response is pure data and carries no per-request state.
 */

import { SAMPLE_QUESTIONS } from '../../../backend/utils/chatService.js';
import { CACHE, respond, type PagesContext } from '../../../backend/edge/response';

/** The question list changes only when the deployment does. */
const SAMPLE_CACHE = CACHE.publicFor(300);

export async function onRequest(context: PagesContext): Promise<Response> {
  if (context.request.method !== 'GET') {
    return respond({ error: 'method not allowed' }, { status: 405, headers: { allow: 'GET' } });
  }
  return respond(SAMPLE_QUESTIONS, { cache: SAMPLE_CACHE });
}
