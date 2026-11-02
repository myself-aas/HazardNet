/** Public-only district/day advisories. Unpublished higher tiers are never in ASSETS. */
import { respondWithPublicDaily } from '../../../../backend/utils/dailyAdvisoryEdge.js';

interface PagesContext {
  request: Request;
  env: { ASSETS?: { fetch: (input: Request) => Promise<Response> } };
  params?: { scope?: string };
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  return respondWithPublicDaily(context);
}
