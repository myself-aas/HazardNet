/**
 * Semantic re-ranking — the cloud half of the knowledge base, and the half that
 * is allowed to fail.
 *
 * BM25 (`bm25.js`) picks the candidates; this reorders them when a provider key
 * exists, so a paraphrased question ("my paddy is underwater, what now") finds
 * the flood document that shares almost no tokens with it.
 *
 * THE RULE THIS MODULE IS BUILT AROUND
 * ------------------------------------
 * Re-ranking may only REORDER. It never adds a document, never drops one, and on
 * any failure — missing key, timeout, quota, malformed response, a vector whose
 * length does not match — the caller keeps the lexical order untouched. That is
 * the difference between an enhancement and a dependency: if this file could
 * change *what* the agent knows, then losing an API key would silently change
 * what a farmer is told, and nothing in the response would say so. So the
 * returned object always carries `applied` and `reason`, and `chatService` puts
 * them in the trace where an operator can see them.
 *
 * One embedding call per query, batched for every candidate document, with a
 * short timeout: this sits on the request path of a chat turn, and a support
 * agent that takes four seconds to re-rank six documents is worse than the
 * lexical order it started from.
 */

import { defaultEnv } from '../runtimeEnv.js';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const RERANK_TIMEOUT_MS = 4_000;
const MAX_RERANK_CANDIDATES = 12;

const dot = (a, b) => a.reduce((sum, value, i) => sum + value * (b[i] ?? 0), 0);

const magnitude = (a) => Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));

export function cosine(a, b) {
  const ma = magnitude(a);
  const mb = magnitude(b);
  if (!ma || !mb) return 0;
  return dot(a, b) / (ma * mb);
}

/** Batch embed: one request for the query and every candidate, in order. */
async function embed(texts, apiKey, fetchImpl = fetch) {
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(EMBEDDING_MODEL)}:batchEmbedContents`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text: String(text).slice(0, 4_000) }] },
        })),
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`embedding status ${response.status}: ${body.slice(0, 160)}`);
  }
  const data = await response.json();
  const vectors = (data?.embeddings ?? []).map((entry) => entry?.values ?? null);
  if (vectors.length !== texts.length || vectors.some((vector) => !Array.isArray(vector) || !vector.length)) {
    throw new Error('embedding response did not return one vector per input');
  }
  return vectors;
}

/**
 * Reorder `results` by semantic similarity to `query`.
 * Returns `{ results, applied, reason }` — see the rule above.
 */
export async function rerankResults(results, query, { env = defaultEnv(), fetchImpl, limit } = {}) {
  const unchanged = (reason) => ({ results, applied: false, reason });
  const candidates = results.slice(0, MAX_RERANK_CANDIDATES);
  if (candidates.length < 2) return unchanged('fewer than two candidates');

  // A default parameter of `fetchImpl = fetch` would throw a ReferenceError in
  // any environment without a global fetch (jsdom, older Node) — and this path
  // is supposed to *degrade*, not explode. Resolve it defensively instead.
  const doFetch = fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return unchanged('no fetch implementation in this runtime');

  const apiKey = env?.GEMINI_API_KEY;
  if (!apiKey) return unchanged('no embedding key configured');

  try {
    const [queryVector, ...docVectors] = await embed(
      [query, ...candidates.map((result) => `${result.title}\n${result.body}`)],
      apiKey,
      doFetch,
    );

    const scored = candidates.map((result, index) => ({
      ...result,
      lexicalScore: result.score,
      semanticScore: Number(cosine(queryVector, docVectors[index]).toFixed(4)),
    }));

    // Blend rather than replace: lexical score is normalised against the best
    // candidate, so a document BM25 was certain about is not thrown out by a
    // re-ranker that has never seen the corpus it is scoring.
    const bestLexical = Math.max(...scored.map((r) => r.lexicalScore), 1e-6);
    for (const result of scored) {
      result.score = Number((0.45 * (result.lexicalScore / bestLexical) + 0.55 * Math.max(0, result.semanticScore)).toFixed(4));
    }
    scored.sort((a, b) => b.score - a.score);

    const cap = limit ?? results.length;
    // Anything beyond the re-ranked window keeps its lexical order behind it.
    return { results: [...scored, ...results.slice(candidates.length)].slice(0, cap), applied: true, reason: EMBEDDING_MODEL };
  } catch (error) {
    return unchanged(`re-rank unavailable (${String(error?.message ?? error).slice(0, 120)})`);
  }
}
