/**
 * Agent planner — turns a question into an ordered, bounded tool plan.
 *
 * WHY THE PLANNER IS DETERMINISTIC
 * --------------------------------
 * The obvious design is to hand the model the tool list and let it choose. That
 * was rejected here for three reasons that all come back to the same thing:
 *
 *   1. It cannot run offline. A support agent for Bangladeshi farmers has to
 *      answer on a bad connection, and "the model picks the tools" means no
 *      model, no tools, no answer.
 *   2. It is not testable. A rule that says "a question about warnings reads the
 *      alert artifact" can be pinned by a test; a model's mood cannot.
 *   3. It is not auditable. When an answer is wrong, an operator needs to see
 *      which step produced the bad input. A deterministic plan gives a trace
 *      that means the same thing every time.
 *
 * The plan is therefore rule-based and identical on every transport. What the
 * model does is what it is good at: turn the retrieved evidence into language.
 *
 * The planner never invents arguments. Districts are resolved through the same
 * registry the MCP tools use, so a name the planner accepts is a name the tool
 * will accept — and hazard values come from the tool enum, not from the skill
 * router's display labels, which are spelled differently.
 */

import { lookupDistrict, DISTRICT_REGISTRY, DISTRICT_ALIASES } from '../districtRegistry.js';
import { HAZARDS } from '../hazards.js';

/**
 * Skill router label → published MCP hazard enum.
 *
 * These genuinely differ: the router says "Cyclone" and "Flash Flood", the tool
 * enum says "tropical-cyclone" and "flash-flood". Sending the display label
 * would fail schema validation, so the mapping is explicit and checked against
 * the enum at import time by `__tests__/agentLoop.test.js`.
 */
/**
 * @typedef {object} PlanStep
 * @property {number} step 1-based position in the plan
 * @property {string} tool MCP tool name
 * @property {Record<string, unknown>} args
 * @property {string} purpose why this step is in the plan, in reader-facing terms
 * @property {{from: string, fields: string[]}} [needs] value to lift from an earlier
 *   step's result; this is what makes the plan a loop rather than a fixed batch
 * @property {string} [skipped] set instead of a tool call when the step cannot run
 */

export const MCP_HAZARD_BY_SKILL = Object.freeze({
  'Flood': 'flood',
  'Flash Flood': 'flash-flood',
  'Cyclone': 'tropical-cyclone',
  'Drought': 'drought',
  'Heat Wave': 'heat-wave',
  'Cold Wave': 'cold-wave',
  'Fire': 'fire',
  'Severe Local Storm': 'severe-local-storm',
  'Multi-Hazard': null,
});

/** Every value the planner can emit must be a real tool enum member. */
export function hazardEnumFor(skill) {
  const value = MCP_HAZARD_BY_SKILL[skill] ?? null;
  return value && HAZARDS.includes(value) ? value : null;
}

export const INTENTS = Object.freeze([
  'outlook', 'alerts', 'weather', 'history', 'explainer', 'district', 'status', 'advice',
]);

const INTENT_PATTERNS = Object.freeze([
  ['weather', /\b(weather|temperature|rainfall|rain(?:ing|y)? now|humidity|wind speed|today's weather|how hot|how cold)\b/i],
  ['alerts', /\b(alert|alerts|warning|warnings|watch|advisory issued|danger level|red alert)\b/i],
  ['history', /\b(history|historical|past events?|past years?|previous years?|last years?|earlier floods?|19\d\d|20\d\d)\b/i],
  ['status', /\b(freshness|how old|how fresh|when was .*updated|data age|coverage|site status|artifact)\b/i],
  ['explainer', /\b(what is|what are|explain|how does|why does|meaning of|methodology|how confident|severity index)\b/i],
  ['district', /\b(district info|which division|pcode|centroid|where is .* located|profile)\b/i],
  ['outlook', /\b(forecast|outlook|prediction|next \d+ days|coming days|upcoming|severity|risk level|what will happen|expect)\b/i],
  ['advice', /\b(what should i do|how do i (protect|prepare|save|recover)|advice|recommend|prepare|precaution|recover|damage)\b/i],
]);

/** All intents that apply, in a stable order — a question can be two things. */
/**
 * @param {string} query the reader's question, in English or Bengali
 * @returns {string[]} intent keys, in the fixed INTENTS order
 */
export function detectIntents(query) {
  const text = String(query ?? '');
  const found = INTENT_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([intent]) => intent);
  return found.length ? found : ['advice'];
}

/**
 * Find a district named in the question, falling back to the one the UI sent.
 *
 * Uses the canonical registry and its aliases, so "Chittagong" resolves to
 * Chattogram exactly as the MCP tools would resolve it. Longest name first, so
 * "Habiganj" is not shadowed by a shorter overlapping match.
 */
/**
 * Fold typographic punctuation to ASCII before matching.
 *
 * Autocorrect turns "Cox's Bazar" into "Cox\u2019s Bazar" constantly, and the
 * registry only holds the ASCII spelling — so without this the most
 * commonly mistyped district in the country simply did not resolve, and the
 * weather question that needed its centroid silently skipped.
 */
function foldPunctuation(text) {
  return String(text)
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-');
}

/**
 * @param {string} query the reader's question, scanned for a district name or alias
 * @param {string|null} [fallback] district supplied by the caller, used when the question names none
 * @returns {string|null} canonical registry name, or null when neither source resolves
 */
export function detectDistrict(query, fallback = null) {
  const text = foldPunctuation(query ?? '');
  if (fallback) {
    const resolved = lookupDistrict(fallback);
    if (resolved) return resolved.district_name;
  }
  // Canonical names first, then spelling variants. Longest first within each
  // group so "Habiganj" is not shadowed by a shorter overlapping match, and
  // canonical before alias so an exact name always wins over a variant of it.
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const candidates = [
    ...DISTRICT_REGISTRY.map((item) => ({ match: item.district_name, canonical: item.district_name })),
    ...Object.entries(DISTRICT_ALIASES).map(([alias, canonical]) => ({ match: alias, canonical })),
  ].sort((a, b) => b.match.length - a.match.length);

  for (const candidate of candidates) {
    if (new RegExp(`\\b${escape(candidate.match)}\\b`, 'i').test(text)) {
      // Resolve through the registry so the returned value is always the name
      // the MCP tools will accept, whatever spelling triggered the match.
      return lookupDistrict(candidate.canonical)?.district_name ?? candidate.canonical;
    }
  }
  return null;
}

/**
 * Build the plan.
 *
 * Steps may declare `needs` — a value lifted out of an earlier step's result.
 * That is what makes this a loop rather than a fixed batch: `get_weather` takes
 * coordinates, which only `get_district_info` can supply, so a weather question
 * about a district becomes two dependent calls.
 *
 * `maxSteps` is a hard ceiling. Every step is a read of a committed artifact or
 * an upstream weather call, so an unbounded plan is both slow and pointless.
 *
 * @param {object} [options]
 * @param {string} options.query the reader's question
 * @param {string|null} [options.district] caller-supplied district; the question is scanned when absent
 * @param {string} [options.skill] routed skill label, used to pick the hazard enum
 * @param {number} [options.maxSteps] hard ceiling on planned steps
 * @returns {{goal: string, district: string|null, unresolved_district: string|null,
 *   hazard: string|null, intents: string[], steps: Array<PlanStep>}}
 */
export function buildPlan({ query, district = null, skill = 'Multi-Hazard', maxSteps = 4 } = {}) {
  const intents = detectIntents(query);
  const hazard = hazardEnumFor(skill);
  // Fall back to reading the district out of the question. Callers usually pass
  // one, but the planner has to work when they do not — otherwise a plan built
  // straight from a question silently loses its location and every dependent
  // step is skipped for a reason that looks like missing data.
  const place = detectDistrict(query, district);
  // An explicit district that does not resolve has to be reported. Silently
  // falling back to "no district" would answer a question about one place with
  // data about nowhere, and the trace would look like the artifacts were empty.
  const requested = district ? String(district).trim() : null;
  const unresolvedDistrict = requested && !place ? requested : null;
  const steps = [];

  const push = (step) => {
    if (steps.length >= maxSteps) return;
    // Never plan the same tool+args twice; a repeated read adds nothing.
    const key = `${step.tool}:${JSON.stringify(step.args ?? {})}`;
    if (steps.some((s) => `${s.tool}:${JSON.stringify(s.args ?? {})}` === key)) return;
    steps.push({ ...step, step: steps.length + 1 });
  };

  if (unresolvedDistrict) {
    steps.push({
      step: 1,
      tool: null,
      skipped: `"${unresolvedDistrict}" is not a Bangladesh district in the registry, so no location-specific data was read.`,
      purpose: 'Read location-specific data for the district that was asked about.',
    });
  }

  if (intents.includes('weather')) {
    if (place) {
      push({
        tool: 'get_district_info',
        args: { district: place },
        purpose: `Resolve ${place} to its reference centroid so current weather can be read for the right location.`,
      });
      push({
        tool: 'get_weather',
        args: {},
        needs: { from: 'get_district_info', fields: ['latitude', 'longitude'] },
        purpose: 'Read current observed weather at that centroid.',
      });
    } else {
      steps.push({
        step: 1,
        tool: null,
        skipped: 'get_weather needs coordinates, and no district was given to resolve them from.',
        purpose: 'Read current observed weather.',
      });
    }
  }

  if (intents.includes('status')) {
    push({ tool: 'get_site_status', args: {}, purpose: 'Read artifact freshness so the answer can say how old its data is.' });
  }

  if (intents.includes('explainer') && hazard) {
    push({ tool: 'get_hazard_info', args: { hazard }, purpose: `Read the published ${hazard} explainer.` });
  }

  if (intents.includes('history')) {
    push({
      tool: 'get_historical_events',
      args: { ...(place ? { district: place } : {}), ...(hazard ? { hazard } : {}), limit: 5 },
      purpose: 'Read published historical events for comparison.',
    });
  }

  if (intents.includes('district') && place) {
    push({ tool: 'get_district_info', args: { district: place }, purpose: `Read ${place} identity and centroid.` });
  }

  if (intents.includes('alerts')) {
    push({
      tool: 'list_alerts',
      args: { ...(place ? { district: place } : {}), ...(hazard ? { hazard } : {}), limit: 5 },
      purpose: 'Read published alerts so the answer reflects what is actually in force.',
    });
  }

  if (intents.includes('outlook') || intents.includes('advice')) {
    if (place) {
      push({
        tool: 'get_hazard_forecast',
        args: { district: place, ...(hazard ? { hazard } : {}) },
        purpose: `Read the published ${place} outlook${hazard ? ` for ${hazard}` : ''}.`,
      });
      push({
        tool: 'list_alerts',
        args: { district: place, ...(hazard ? { hazard } : {}), limit: 5 },
        purpose: 'Read any alert in force for the same district and hazard.',
      });
    } else {
      push({ tool: 'get_site_status', args: {}, purpose: 'No district was given, so read artifact freshness instead of guessing a location.' });
    }
  }

  return {
    goal: `Answer "${String(query ?? '').slice(0, 160)}"${place ? ` for ${place}` : ''}${hazard ? ` (${hazard})` : ''}.`,
    district: place,
    unresolved_district: unresolvedDistrict,
    hazard,
    intents,
    steps,
  };
}
