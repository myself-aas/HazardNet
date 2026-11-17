/**
 * Public district/day advisories. All five tiers are published (owner decision 2026-11-17);
 * rows at WARNING and above carry `requiresReview: true` and the site attributes them to
 * HazardNet AI with the run timestamp. Private columns never reach ASSETS.
 */
import { respondWithPublicDaily } from '../../../../backend/utils/dailyAdvisoryEdge.js';

interface PagesContext {
  request: Request;
  env: { ASSETS?: { fetch: (input: Request) => Promise<Response> } };
  params?: { scope?: string };
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  return respondWithPublicDaily(context);
}
