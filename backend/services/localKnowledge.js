/**
 * Knowledge-base adapter — the seam four call sites already import.
 *
 * This file used to be the whole retrieval layer, and it was a stub:
 *
 *   export const GOVT_OFFICE_DIRECTORY = [];
 *   export function searchRAG() { return { results: [], districtBaseline: null }; }
 *   export function routeSkills() { return []; }
 *
 * with the comment "the research knowledge base is private; the assistant
 * features run without retrieval context (plain model answers only)". That was a
 * deliberate removal of research material, and the right call — but it left the
 * pipeline asserting the opposite downstream: `chatService` injected a
 * "RETRIEVED RAG KNOWLEDGE BASE DOCUMENTS" section into every prompt, instructed
 * the model to "ground every claim in that context", and handed the UI
 * `retrieved_sources: []` to render as citations. Every answer was therefore
 * either a refusal or an invention, with nothing to show for either.
 *
 * The research corpus stays private. What is retrieved now is the PUBLIC support
 * corpus in `knowledge/` — official helplines, agency responsibilities,
 * per-hazard practice, and the product's own published explainers — compiled and
 * validated by `scripts/build_knowledge_base.mjs`.
 *
 * This module is kept as a thin adapter so the existing importers
 * (`utils/chatService.js`, `routes/liveVoice.js`) do not have to move; new code
 * should import `knowledge/index.js` directly, and use `retrieveKnowledge()`
 * when it can await, because that is the path that adds semantic re-ranking.
 */

import { GOVT_OFFICE_DIRECTORY, routeSkills, routeSkillsStructured, searchKnowledge } from './knowledge/index.js';

export { GOVT_OFFICE_DIRECTORY, routeSkills, routeSkillsStructured };

/**
 * Synchronous lexical retrieval, in the shape the legacy callers expect.
 *
 * `districtBaseline` is null by design and will stay null: it was research data.
 * District *facts* — the current outlook, alerts, weather — are live and arrive
 * through the MCP tool pack (`backend/mcp/tools.js`), not from a static corpus.
 * Conflating the two is how a support agent ends up quoting a stale number as
 * though it were today's forecast.
 */
export function searchRAG(query, options = {}) {
  return {
    results: searchKnowledge(query, {
      district: options?.district ?? null,
      hazard: options?.hazard ?? null,
      limit: options?.limit ?? 6,
    }),
    districtBaseline: null,
  };
}
