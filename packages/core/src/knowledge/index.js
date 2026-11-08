/**
 * HazardNet support knowledge base — the public seam.
 *
 * This replaces the 13-line `localKnowledge.js` stub whose own comment said
 * "the research knowledge base is private; the assistant features run without
 * retrieval context (plain model answers only)". That was a deliberate removal,
 * and it left the rest of the pipeline lying: `chatService` still injected a
 * "RETRIEVED RAG KNOWLEDGE BASE DOCUMENTS" section into every prompt, told the
 * model to "ground every claim in that context", and returned
 * `retrieved_sources: []` to a UI that rendered it as citations.
 *
 * What lives here instead is a PUBLIC corpus — official helplines, agency
 * responsibilities, per-hazard preparedness and recovery practice, and the
 * product's own published explainers. No research material: the corpus compiler
 * (`scripts/build_knowledge_base.mjs`) rejects the markers that would indicate
 * any had been added, and a jest test asserts it.
 *
 * TWO-STATE RETRIEVAL
 * -------------------
 * `searchKnowledge()` is synchronous, lexical and dependency-free: it works in
 * the browser bundle that powers offline mode, in a Worker isolate, and with no
 * provider key configured. `retrieveKnowledge()` adds semantic re-ranking when
 * a key exists and returns the lexical order untouched when it does not. The
 * response always says which one ran, so a degraded retrieval is visible rather
 * than silent.
 */

import corpus from './corpus.generated.js';
import { createIndex, search } from './bm25.js';
import { rerankResults } from './rerank.js';
import { defaultEnv } from '../runtimeEnv.js';

export { routeSkills, routeSkillsStructured, resolveSkillKey, urgencyFor, SKILL_CARDS } from './skills.js';
export { tokenize } from './bm25.js';

export const KNOWLEDGE_POLICY = Object.freeze({ ...corpus.policy });
export const KNOWLEDGE_DOCUMENTS = Object.freeze(corpus.documents.map((doc) => Object.freeze({ ...doc })));

/** Built once per process; retrieval itself is allocation-cheap. */
const INDEX = createIndex(KNOWLEDGE_DOCUMENTS);

/**
 * Official directory. Numbers only where this repository already commits them
 * (`apps/mobile/src/assets/articles/contact.md`, `backend/alerts/policy.js`) —
 * a support agent inventing a helpline is the worst failure available to it.
 */
export const GOVT_OFFICE_DIRECTORY = Object.freeze([
  { service: 'National emergency', number: '999', scope: 'Police, fire and ambulance dispatch', authority: 'Government of Bangladesh' },
  { service: 'Disaster response and early warning', number: '1090', scope: 'Disaster management', authority: 'Department of Disaster Management' },
  { service: 'Agricultural advisory (Krishi Call Centre)', number: '16123', scope: 'Crop advice, Upazila Agriculture Officer', authority: 'Department of Agricultural Extension' },
  { service: 'Fire Service and Civil Defence', number: '16163', scope: 'Fire and rescue', authority: 'Fire Service and Civil Defence' },
  { service: 'Health', number: '16263', scope: 'Health services', authority: 'Ministry of Health and Family Welfare' },
  { service: 'Women and children helpline', number: '109', scope: 'Protection', authority: 'Government of Bangladesh' },
  { service: 'Bangladesh Meteorological Department', number: null, scope: 'Official weather and cyclone warnings', authority: 'BMD', url: 'http://www.bmd.gov.bd' },
  { service: 'Flood Forecasting and Warning Centre', number: null, scope: 'River levels and flood forecasts', authority: 'FFWC', url: 'http://www.ffwc.gov.bd' },
  { service: 'Department of Livestock Services', number: null, scope: 'Animal health, Upazila Livestock Officer', authority: 'DLS', url: 'http://www.dls.gov.bd' },
  { service: 'Department of Fisheries', number: null, scope: 'Ponds, ghers, Upazila Fisheries Officer', authority: 'DoF', url: 'http://www.fisheries.gov.bd' },
  { service: 'Bangladesh Water Development Board', number: null, scope: 'Embankments, polders, sluice gates', authority: 'BWDB', url: 'http://www.bwdb.gov.bd' },
]);

/**
 * Synchronous lexical retrieval — the offline floor.
 *
 * Tuning knobs are forwarded explicitly rather than spread wholesale: an option
 * named here but not passed on is silently ignored, which is worse than a
 * missing option because the caller gets no error and no effect. (`relativeFloor`
 * was exactly that until a test caught it.)
 */
export function searchKnowledge(query, { limit = 6, hazard = null, district = null, minScore, relativeFloor } = {}) {
  return search(INDEX, query, {
    limit,
    hazard,
    district,
    ...(minScore !== undefined ? { minScore } : {}),
    ...(relativeFloor !== undefined ? { relativeFloor } : {}),
  });
}

/**
 * Retrieve with optional semantic re-ranking.
 * Returns `{ results, retrieval }` where `retrieval.engine` is `bm25` or
 * `bm25+gemini-embedding-001`, so the trace can say what actually ran.
 */
export async function retrieveKnowledge(query, options = {}) {
  const env = options.env ?? defaultEnv();
  // Retrieve more candidates than we will keep: re-ranking is only worth a call
  // when it has room to change the order.
  const candidates = searchKnowledge(query, { ...options, limit: Math.max(options.limit ?? 6, 8) });
  const { results, applied, reason } = await rerankResults(candidates, query, {
    env,
    fetchImpl: options.fetchImpl,
    limit: options.limit ?? 6,
  });
  return {
    results,
    retrieval: {
      engine: applied ? `bm25+${reason}` : 'bm25',
      applied,
      reason,
      candidates: candidates.length,
      corpus: { documents: INDEX.documents, version: corpus.version },
    },
  };
}

/**
 * Compact context block for a prompt, with an explicit budget so retrieval can
 * never be the reason the prompt bound (SEC-11) is breached.
 *
 * Returns the ids it actually placed in the block. The caller MUST cite only
 * those: a response that lists six "sources" when the model was shown three is
 * the exact lie this whole rewrite exists to remove — the UI renders
 * `retrieved_sources` as citations, so anything named there has to have been in
 * the prompt.
 */
export function formatKnowledgeContext(results, { budget = 6_000 } = {}) {
  if (!results?.length) {
    return {
      text: '=== SUPPORT KNOWLEDGE BASE ===\nNo knowledge-base document matched this question. Say so plainly and answer from the published outlook data instead; do not invent a source.\n',
      includedIds: [],
      omitted: 0,
    };
  }
  let block = `=== SUPPORT KNOWLEDGE BASE (${results.length} matched) ===\n`;
  const includedIds = [];
  for (const [index, result] of results.entries()) {
    const entry = `\n[Doc ${index + 1}: ${result.title} | ${result.category} | authority: ${result.authority}${result.url ? ` | ${result.url}` : ''}]\n${result.body}\n`;
    if (block.length + entry.length > budget) {
      block += `\n[further documents omitted: prompt budget reached]\n`;
      break;
    }
    block += entry;
    includedIds.push(result.id);
  }
  return { text: block, includedIds, omitted: results.length - includedIds.length };
}
