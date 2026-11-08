/**
 * Skill routing — the part of the pipeline that was dead code.
 *
 * `localKnowledge.js` shipped a `routeSkills()` that returned `[]`, so the hazard
 * theme `chatService.inferHazardTheme()` computed went nowhere and every question
 * got the same generic system prompt. This is the real implementation, and it does
 * one job: turn (hazard, severity) into the *specific* institutional playbook the
 * answer must follow, plus the knowledge-base documents that carry it.
 *
 * WHY IT RETURNS A STRING
 * -----------------------
 * Four call sites already consume `routeSkills()` as a prompt fragment
 * (`chatService.js` prepends it to the system prompt; `liveVoice.js` builds the
 * Live API voice instruction and reports `routedSkills.length`). Changing the
 * return type would break the voice path silently, so `routeSkills()` keeps
 * returning a string. `routeSkillsStructured()` is the same routing in data form
 * for the agent trace and the /assistant UI — one router, two projections, so the
 * two can never disagree about which skill was chosen.
 *
 * The cards name documents by id, not by content: retrieval owns the words, this
 * owns the decision about which words matter.
 */

export const URGENCY_TIERS = Object.freeze({
  EMERGENCY: 'EMERGENCY',
  WARNING: 'WARNING',
  WATCH: 'WATCH',
});

/**
 * Coerce to a finite number, or null.
 *
 * `Number(null) === 0` and `Number('') === 0`, and 0 IS finite — so a naive
 * `Number.isFinite(Number(value))` guard reads a MISSING severity as a measured
 * severity of exactly zero and then prints "severity index 0.0%" to a farmer.
 * Absence has to be checked before coercion, not after.
 */
export function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

export function urgencyFor(severityScore) {
  const score = finiteOrNull(severityScore);
  if (score === null) return URGENCY_TIERS.WATCH;
  if (score >= 0.7) return URGENCY_TIERS.EMERGENCY;
  if (score >= 0.4) return URGENCY_TIERS.WARNING;
  return URGENCY_TIERS.WATCH;
}

/**
 * Hazard theme → the institution that owns the decision, the documents that
 * carry the guidance, and the first actions. Keys match the values
 * `inferHazardTheme()` produces ('Flood', 'Cyclone', 'Drought', 'Cold Wave',
 * 'Multi-Hazard'), with heat wave and fire routed explicitly.
 */
export const SKILL_CARDS = Object.freeze({
  Flood: {
    label: 'Flood and flash-flood response',
    owners: ['DAE (Upazila Agriculture Officer)', 'FFWC', 'DDM / Union Parishad', 'DLS', 'DoF'],
    documents: ['flood-preparedness', 'flash-flood-response', 'livestock-protection', 'recovery-crops', 'wash-after-flood'],
    firstActions: [
      'harvest whatever has reached maturity before the water arrives',
      'move livestock, grain and documents to high ground while roads are passable',
      'clear field and homestead drainage so water has somewhere to go',
    ],
    helplines: ['1090 (disaster response)', '16123 (agricultural advisory)', '999 (emergency)'],
    varieties: ['BRRI dhan49, dhan51, dhan52 (submergence tolerant)', 'BRRI dhan71 (late-season flooding)'],
  },
  'Flash Flood': {
    label: 'Flash-flood (haor) early-harvest decision',
    owners: ['FFWC', 'DAE (Upazila Agriculture Officer)', 'DDM / Union Parishad'],
    documents: ['flash-flood-response', 'seed-varieties', 'local-officers'],
    firstActions: [
      'decide on early harvest of the standing crop — a small yield loss beats total loss',
      'secure harvesting labour and drying space on high ground before access closes',
      'track the FFWC river forecast alongside the local administration announcement',
    ],
    helplines: ['1090 (disaster response)', '16123 (agricultural advisory)', '999 (emergency)'],
    varieties: ['BRRI dhan49, dhan51, dhan52 (submergence tolerant)'],
  },
  Cyclone: {
    label: 'Cyclone and storm-surge preparation',
    owners: ['BMD', 'DDM / local administration', 'DoF (Upazila Fisheries Officer)', 'DLS'],
    documents: ['cyclone-preparedness', 'fisheries-pond-gher', 'livestock-protection'],
    firstActions: [
      'know which cyclone shelter the household is assigned to, and go when ordered',
      'secure the roof and move animals and boats inland before landfall',
      'lower gher water levels so surge cannot overtop the embankment',
    ],
    helplines: ['999 (emergency)', '1090 (disaster response)', '16163 (Fire Service)'],
    varieties: ['BRRI dhan47, dhan53 (salinity tolerant — surge leaves salt behind)'],
  },
  Drought: {
    label: 'Drought and water management',
    owners: ['DAE (Upazila Agriculture Officer)', 'BARI', 'BWDB'],
    documents: ['drought-heat-crops', 'seed-varieties', 'livestock-protection'],
    firstActions: [
      'cut irrigation loss first: AWD, mulch, irrigate at dawn or dusk',
      'prefer short-duration and drought-tolerant varieties where the dry season is predictable',
      'check animal water supply — heat and thirst kill livestock faster than crops',
    ],
    helplines: ['16123 (agricultural advisory)'],
    varieties: ['BRRI dhan56 (drought tolerant)'],
  },
  'Heat Wave': {
    label: 'Heat-stress management',
    owners: ['DAE (Upazila Agriculture Officer)', 'DLS'],
    documents: ['drought-heat-crops', 'livestock-protection', 'early-action-by-hazard'],
    firstActions: [
      'shade and frequent light irrigation for nurseries and vegetables',
      'move livestock work to early morning and keep water in shade',
      'avoid applying nitrogen during heat stress — the crop cannot use it',
    ],
    helplines: ['16123 (agricultural advisory)', '16263 (health)'],
    varieties: ['BARI Gom-33 (heat-tolerant wheat)'],
  },
  'Cold Wave': {
    label: 'Cold and fog protection',
    owners: ['DAE (Upazila Agriculture Officer)', 'DLS'],
    documents: ['cold-wave-fog', 'livestock-protection', 'seed-varieties'],
    firstActions: [
      'irrigate in the late afternoon to raise the canopy temperature overnight',
      'cover nursery beds at night on a frame, not directly on the seedlings',
      'keep livestock in a dry, draught-free shed with extra bedding',
    ],
    helplines: ['16123 (agricultural advisory)', '16263 (health)'],
    varieties: [],
  },
  Fire: {
    label: 'Fire prevention and response',
    owners: ['Fire Service and Civil Defence', 'Union Parishad'],
    documents: ['fire-land-homestead', 'helplines-national'],
    firstActions: [
      'clear straw and husk from the stove, the store and the cattle shed',
      'agree a water source and a bucket chain with neighbours before the dry season',
      'replace damaged wiring rather than taping it',
    ],
    helplines: ['16163 (Fire Service and Civil Defence)', '999 (emergency)'],
    varieties: [],
  },
  'Multi-Hazard': {
    label: 'General hazard preparedness',
    owners: ['DAE (Upazila Agriculture Officer)', 'DDM / Union Parishad', 'DLS', 'DoF'],
    documents: ['early-action-by-hazard', 'helplines-national', 'local-officers', 'hazardnet-limits'],
    firstActions: [
      'identify which hazard the question is really about, then follow that playbook',
      'report the situation to the UAO or Union Parishad so the official record starts early',
      'treat the outlook as a planning aid, not a warning',
    ],
    helplines: ['16123 (agricultural advisory)', '1090 (disaster response)', '999 (emergency)'],
    varieties: [],
  },
});

/** Normalise the many spellings callers use ('flash flood', 'tropical-cyclone', …). */
export function resolveSkillKey(hazardType) {
  const value = String(hazardType ?? '').toLowerCase().replace(/[-_]/g, ' ').trim();
  if (!value) return 'Multi-Hazard';
  // Same regional markers `chatService.inferHazardTheme()` uses. The two must not
  // disagree: the chat path hands this function an already-inferred theme, but a
  // caller passing the raw phrase ("haor flooding") has to reach the same card,
  // or the same question gets a different playbook depending on who asked.
  if (/flash flood|haor|surma|kushiyara|sunamganj|sylhet|netrokona|kishoreganj/.test(value)) return 'Flash Flood';
  if (/flood/.test(value)) return 'Flood';
  if (/cyclone|storm surge|tidal surge/.test(value)) return 'Cyclone';
  if (/drought|dry spell|water stress|arid/.test(value)) return 'Drought';
  if (/heat/.test(value)) return 'Heat Wave';
  if (/cold|fog|frost/.test(value)) return 'Cold Wave';
  if (/fire/.test(value)) return 'Fire';
  if (/severe local storm|nor.?wester|kalboishakhi|hail/.test(value)) return 'Cyclone';
  return 'Multi-Hazard';
}

/** The routing decision, as data. One source of truth for both projections. */
export function routeSkillsStructured({ hazard_type, severity_score } = {}) {
  const skillKey = resolveSkillKey(hazard_type);
  const card = SKILL_CARDS[skillKey] ?? SKILL_CARDS['Multi-Hazard'];
  return {
    skill: skillKey,
    label: card.label,
    urgency: urgencyFor(severity_score),
    severity_score: finiteOrNull(severity_score),
    owners: [...card.owners],
    document_ids: [...card.documents],
    first_actions: [...card.firstActions],
    helplines: [...card.helplines],
    // Only varieties publicly released for THIS stress. A cold wave is not
    // answered by submergence rice, and an empty list is the honest answer.
    varieties: [...(card.varieties ?? [])],
  };
}

/**
 * The prompt fragment. Kept short on purpose: this is prepended to the system
 * prompt on every turn, and a prompt budget shared with retrieved context is not
 * the place for a wall of text.
 */
export function routeSkills(params = {}) {
  const routed = routeSkillsStructured(params);
  return [
    `=== ROUTED SKILL: ${routed.label.toUpperCase()} (${routed.urgency}) ===`,
    `District context: ${params.district_name || 'Bangladesh'}.`,
    `Responsible institutions: ${routed.owners.join('; ')}.`,
    `Base the answer on knowledge-base documents: ${routed.document_ids.join(', ')}. Cite them by title.`,
    `First actions in priority order:`,
    ...routed.first_actions.map((action, i) => `${i + 1}. ${action}`),
    `Helplines to give when relevant: ${routed.helplines.join('; ')}.`,
    routed.urgency === URGENCY_TIERS.EMERGENCY
      ? 'This is an emergency-tier severity: lead with the immediate action, keep it short, and name the official channel.'
      : 'Keep the answer practical and specific; say plainly when something depends on the local officer.',
  ].join('\n');
}
