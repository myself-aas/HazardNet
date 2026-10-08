/**
 * "So what?" — the action a tier implies for the hazard in front of the reader.
 *
 * The advisory CSV publishes a hazard class and a tier. Neither is an instruction, and a
 * forecast that stops at "Flash Flood · WARNING" leaves the reader to invent the response.
 * Apple's own framing calls this the *utility* test: feedback and guidance earn their place
 * only where they change what someone does next.
 *
 * The advice is composed from two short parts rather than written as one string per
 * (tier × hazard) pair:
 *
 *   tier   — what the level means for *when* to act, and how urgent it is;
 *   hazard — what to actually do about this particular hazard, on a farm.
 *
 * Thirty-two pairs would be thirty-two ways to drift, and most of the combinations would be
 * filler ("Drought · NORMAL: no action"). Composition keeps every string short enough to be
 * read on a phone in sunlight and to be spoken in one breath, and it means a new hazard class
 * needs one hint, not four.
 *
 * Content boundaries, which matter more than the copy:
 *   · these are protective *actions*, never outcomes — nothing here promises that acting will
 *     save a crop or a life;
 *   · `NORMAL` is still given a line, because "carry on with normal work" is a decision, and
 *     the alternative (rendering nothing) makes a quiet district look like a missing card;
 *   · the deep, agency-referenced protocols stay in `@hazardnet/core` `sectorAdvisories`
 *     behind `/advisories`; this module hands off rather than duplicating them.
 */

import type { AdvisoryTier } from './forecasts';

/** The tier's own instruction. Keys are looked up in the i18n dictionary. */
const TIER_ACTION_KEY: Record<AdvisoryTier, string> = {
  NORMAL: 'advisory.action.NORMAL',
  WATCH: 'advisory.action.WATCH',
  WARNING: 'advisory.action.WARNING',
  SEVERE: 'advisory.action.SEVERE',
};

/** Every hazard class the model can emit (`Models/labels.json`, eight classes). */
export const ACTION_HAZARD_CLASSES = [
  'Cold Wave',
  'Drought',
  'Fire',
  'Flash Flood',
  'Flood',
  'Heat Wave',
  'Severe Local Storm',
  'Tropical Cyclone',
] as const;

export interface AdvisoryAction {
  /** i18n key for the tier's instruction. */
  tierKey: string;
  /** i18n key for the hazard's protective action, or null for an unknown class. */
  hazardKey: string | null;
}

/**
 * The keys for a tier and hazard. Pure and synchronous so it can be tested directly and
 * used in a non-React context (the map popup builds its own markup).
 *
 * An unknown hazard class gets the tier line alone: the ingest validates the class, so an
 * unexpected value means a contract break, and showing the tier's own instruction is better
 * than substituting an invented one for a hazard nobody identified.
 */
export function actionKeysFor(tier: AdvisoryTier | null, hazard: string | null | undefined): AdvisoryAction {
  const resolvedTier: AdvisoryTier = tier ?? 'NORMAL';
  const key = hazard ? `advisory.hint.${hazard}` : null;
  return { tierKey: TIER_ACTION_KEY[resolvedTier], hazardKey: key };
}

/** True when the class has a protective action of its own (the eight model classes). */
export function hasHazardHint(hazard: string | null | undefined): boolean {
  return Boolean(hazard) && (ACTION_HAZARD_CLASSES as readonly string[]).includes(hazard as string);
}
