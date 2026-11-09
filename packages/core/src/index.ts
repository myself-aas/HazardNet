/**
 * Main exports for @hazardnet/core
 *
 * This package contains pure TypeScript with NO dependencies on React,
 * React Native, or the DOM. It is safe to import from any platform.
 */

export * from './contracts';
export * from './forecasts';
export * from './alertPolicy';
// The advisory tier vocabulary: bands, ceiling, review rule, confidence bins. `confidenceBin`
// here is the same function `./forecasts` re-exports, so the wildcard is narrowed to the names
// that do not already exist.
export {
  ADVISORY_TIERS,
  AUTO_PUBLISH_CEILING,
  CONFIDENCE_THRESHOLDS,
  TIER_BANDS,
  confidenceBin,
  requiresReview,
  tierForSeverity,
} from './advisoryTier.js';
export * from './dataStates';
export * from './freshness';
export * from './geo';
export * from './haptics';
export * from './dedupe';
export * from './queryKeys';
export * from './analytics';
export * from './savedPlaces';
export * from './notifications';
// The advisory dataset is re-exported value-by-value rather than with a wildcard: `alertPolicy`
// already exports an `EmergencyContact` (the hotline directory), and that package's `EMERGENCY_CONTACTS`
// has a different shape (agency, department, landline, scope) from the advisory one. Naming the
// exports keeps the collision visible instead of resolving it silently.
export { SECTOR_ADVISORIES } from './sectorAdvisories';
export type {
  SectorAdvisoryData,
  TechnicalStep,
  CultivarOrInputSpec,
  OfficialDocLink,
} from './sectorAdvisories';
export type { EmergencyContact as AdvisoryEmergencyContact } from './sectorAdvisories';
export * from './notificationMatcher';

/**
 * The support agent's retrieval, planning and review code.
 *
 * These live here rather than under `backend/` so the on-device assistant and the
 * server run the same logic: a second copy per platform is how the two drift, and
 * an answer that cites the knowledge base has to be checkable against the same
 * corpus on both. All three modules are free of Node built-ins by construction.
 *
 * Named rather than wildcarded, following the `sectorAdvisories` precedent above:
 * `districtRegistry.js` also exports a `normalizeDistrictKey`, and it is NOT the
 * same function as the one in `forecasts.ts` (the registry's guards non-string
 * input and returns '', the forecast one would throw on null). The planner imports
 * the registry by relative path, so the frontend never needs it here - and naming
 * the exports keeps that near-duplicate from being resolved silently.
 */
/*
 * The district table and its alias map are exported by name for the same reason the note above
 * gives: `districtRegistry.js` has a `normalizeDistrictKey` that is not `forecasts.ts`'s, and a
 * wildcard would resolve them silently. `DISTRICT_ALIASES` in particular is read by exactly one
 * module (`agent/planner.js`) and by the identity gate — but it is the *value* the gate counts,
 * so it has to be reachable through the package, not only by relative path. The three platform
 * entry points (web, mobile, edge) resolve `@hazardnet/core` here, and none of them should have
 * to reach into a source file to ask how many spellings a district has.
 */
export {
  DISTRICT_REGISTRY,
  DISTRICT_ALIASES,
  districtKey,
  districtSlug,
  lookupDistrict,
  normalizeDistrictKey as normalizeRegistryKey,
  sameDistrict,
} from './districtRegistry.js';
export {
  searchKnowledge,
  retrieveKnowledge,
  formatKnowledgeContext,
  routeSkills,
  routeSkillsStructured,
  resolveSkillKey,
  urgencyFor,
  tokenize,
  KNOWLEDGE_POLICY,
  KNOWLEDGE_DOCUMENTS,
  GOVT_OFFICE_DIRECTORY,
  SKILL_CARDS,
} from './knowledge/index.js';
export {
  buildPlan,
  detectDistrict,
  detectIntents,
  hazardEnumFor,
  MCP_HAZARD_BY_SKILL,
  INTENTS,
} from './agent/planner.js';
export { reviewAnswer } from './agent/review.js';
export { HAZARDS } from './hazards.js';
