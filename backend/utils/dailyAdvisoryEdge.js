/**
 * Pages Function adapter; uses only the public ASSETS binding.
 *
 * This file is the *only* place the advisories surface is wired to HTTP, which is why it is
 * a thin adapter: duplicate-parameter rejection, scope resolution and the envelope all live
 * in `./dailyAdvisoryServe.js`, where the Node and Express runtimes read them too.
 *
 * The response is built by `backend/edge/response.ts` — the one module that decides what an
 * edge JSON response looks like. This adapter used to carry a private `json()` with its own
 * header literals, which made it the twelfth copy of that decision.
 */
import { CACHE, respond } from '../edge/response.js';
import { loadPublicDailyAsset, queryPublicDaily } from './dailyAdvisoryServe.js';

const FIELDS = ['scope', 'district_id', 'district', 'division', 'date', 'days'];

/** A successful advisory view is a deployed artifact; a minute of staleness is deliberate. */
const OK_CACHE = CACHE.publicFor(60);

export async function respondWithPublicDaily({ request, env, params = {} }) {
  const search = new URL(request.url).searchParams;
  if (FIELDS.some((field) => search.getAll(field).length > 1)) {
    return respond({ error: 'Duplicate advisory filter' }, { status: 400 });
  }
  const query = Object.fromEntries(FIELDS.map((field) => [field, search.get(field) ?? '']));
  if (params?.scope) query.scope = params.scope;
  const snapshot = await loadPublicDailyAsset(env, request);
  const { code, body } = queryPublicDaily(snapshot, query);
  return respond(body, { status: code, cache: code === 200 ? OK_CACHE : CACHE.noStore });
}
