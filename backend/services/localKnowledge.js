/**
 * Local knowledge stub. The research knowledge base is private; the assistant
 * features run without retrieval context (plain model answers only).
 */
export const GOVT_OFFICE_DIRECTORY = [];

export function searchRAG() {
  return { results: [], districtBaseline: null };
}

export function routeSkills() {
  return [];
}
