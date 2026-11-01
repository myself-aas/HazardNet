/** Pages Function adapter; uses only the public ASSETS binding. */
import { loadPublicDailyAsset, queryPublicDaily } from './dailyAdvisoryServe.js';

const FIELDS = ['scope', 'district_id', 'district', 'division', 'date', 'days'];

export async function respondWithPublicDaily({ request, env, params = {} }) {
  const search = new URL(request.url).searchParams;
  if (FIELDS.some((field) => search.getAll(field).length > 1)) {
    return json({ error: 'Duplicate advisory filter' }, 400);
  }
  const query = Object.fromEntries(FIELDS.map((field) => [field, search.get(field) ?? '']));
  if (params?.scope) query.scope = params.scope;
  const snapshot = await loadPublicDailyAsset(env, request);
  const { code, body } = queryPublicDaily(snapshot, query);
  return json(body, code);
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': status === 200 ? 'public, max-age=60' : 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
