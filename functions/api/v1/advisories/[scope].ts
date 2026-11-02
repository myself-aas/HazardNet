/** Named views (latest, timeline, peak, summary) of the same public snapshot. */
import { respondWithPublicDaily } from '../../../../backend/utils/dailyAdvisoryEdge.js';

interface PagesContext {
  request: Request;
  env: { ASSETS?: { fetch: (input: Request) => Promise<Response> } };
  params: { scope: string };
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  return respondWithPublicDaily(context);
}
