/**
 * BM25 lexical retrieval — the offline half of the HazardNet knowledge base.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A VECTOR STORE
 * ------------------------------------------------
 * The agent has to answer from the knowledge base in four places at once: the
 * Express backend, a Node serverless function, a Cloudflare Pages function and
 * the browser itself (the offline mode the native apps fall back to). A vector
 * index cannot live in all four without a network dependency or an embedding key,
 * and an agent that stops retrieving when a key is missing is not a support agent.
 *
 * So the floor is lexical: Okapi BM25 over a weighted token stream, built from the
 * committed corpus at import time. It is deterministic, has zero dependencies,
 * runs in a Worker and in jsdom, and — the property that actually matters — it
 * returns the same document for the same query on every transport, so a test
 * written here is true in production.
 *
 * Semantic re-ranking is layered on top by `rerank.js` when a provider key exists.
 * BM25 decides the candidate set; embeddings only reorder it. That ordering is
 * deliberate: the re-ranker must never be able to *remove* a relevant document
 * that lexical retrieval found, because then a key outage would change what the
 * agent knows.
 *
 * FIELD WEIGHTING
 * ---------------
 * Rather than scoring three fields separately and inventing a way to combine
 * three BM25 scores, each document is indexed as ONE weighted token stream:
 * title tokens three times, tag tokens twice, body once. Document length then
 * reflects the weighting naturally, IDF stays corpus-wide, and the code stays
 * small enough to audit — which is the standard this repository holds its
 * gates to.
 */

/** English function words. Bengali tokens are kept whole: they are matched by
 *  identity, which is exactly what a bilingual query needs. */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'could', 'did', 'do', 'does',
  'for', 'from', 'had', 'has', 'have', 'he', 'her', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is',
  'it', 'its', 'just', 'me', 'my', 'no', 'not', 'of', 'on', 'or', 'our', 'she', 'should', 'so', 'some',
  'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'to', 'up', 'was',
  'we', 'were', 'what', 'when', 'where', 'which', 'who', 'will', 'with', 'would', 'you', 'your',
  'ami', 'amar', 'apnar', 'ki', 'kivabe', 'kobe', 'kothay', 'keno', 'ei', 'eta', 'amar',
]);

const TITLE_WEIGHT = 3;
const TAG_WEIGHT = 2;

/** Lowercase, split on anything that is not a letter, digit or combining mark,
 *  drop single characters and stop words.
 *
 *  `\p{M}` is load-bearing, not decoration: Bengali (and every other Indic
 *  script) builds syllables with combining vowel signs, so a class of
 *  `[\p{L}\p{N}]` splits "বন্যা" into "বন" + "য" and retrieval silently returns
 *  nothing for a Bengali query. This product is for Bangladeshi farmers; that is
 *  not an edge case. */
export function tokenize(text) {
  if (!text) return [];
  const tokens = String(text).toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu);
  if (!tokens) return [];
  return tokens.filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

const termFrequency = (tokens) => {
  const tf = new Map();
  for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
  return tf;
};

/**
 * Build the index. Called once per process (see `index.js`), so this is allowed
 * to be O(total tokens); it is not on any request path.
 */
export function createIndex(documents) {
  const docs = [];
  const documentFrequency = new Map();

  for (const doc of documents ?? []) {
    const stream = [
      ...Array(TITLE_WEIGHT).fill(null).flatMap(() => tokenize(doc.title)),
      ...Array(TAG_WEIGHT).fill(null).flatMap(() => tokenize((doc.tags ?? []).join(' '))),
      ...tokenize(doc.body),
    ];
    const tf = termFrequency(stream);
    for (const term of tf.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    docs.push({ doc, tf, length: stream.length });
  }

  const totalDocuments = docs.length;
  const averageLength = totalDocuments
    ? docs.reduce((sum, entry) => sum + entry.length, 0) / totalDocuments
    : 0;

  // Okapi BM25 IDF, shifted so a term in every document stays at 0 instead of
  // going negative — a negative weight would make a ubiquitous term *reduce* a
  // score, which is never what a support agent wants.
  const idf = (term) => {
    const df = documentFrequency.get(term) ?? 0;
    return Math.log(1 + (totalDocuments - df + 0.5) / (df + 0.5));
  };

  return Object.freeze({ documents: totalDocuments, averageLength, docs, idf, documentFrequency });
}

/**
 * BM25 score of one document against the query terms.
 * k1 bounds how much a repeated term can contribute; b is how strongly a long
 * document is penalised. These are the standard Okapi defaults, and they are
 * named here rather than tuned, because a tuned constant in a support agent is
 * a constant nobody will remember to re-tune when the corpus doubles.
 */
function scoreDocument(index, entry, terms, { k1 = 1.4, b = 0.75 } = {}) {
  let score = 0;
  for (const term of terms) {
    const frequency = entry.tf.get(term);
    if (!frequency) continue;
    const saturation = (frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * (entry.length / (index.averageLength || 1))));
    score += index.idf(term) * saturation;
  }
  return score;
}

/** The sentence of a document that best explains the match — what the UI shows
 *  so a citation is a claim the reader can check, not just a title. */
function snippetFor(doc, terms) {
  const sentences = String(doc.body ?? '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (!sentences.length) return '';
  let best = sentences[0];
  let bestHits = -1;
  for (const sentence of sentences) {
    const tokens = new Set(tokenize(sentence));
    const hits = terms.reduce((count, term) => count + (tokens.has(term) ? 1 : 0), 0);
    if (hits > bestHits) {
      bestHits = hits;
      best = sentence;
    }
  }
  return best.length > 240 ? `${best.slice(0, 237).trimEnd()}…` : best;
}

/**
 * Retrieve.
 *
 * `hazard` and `district` are boosts, never filters: a general preparedness
 * document is still the right answer to a flood question, and silently dropping
 * it because it is not tagged `flood` is how a retrieval layer becomes
 * confidently wrong. The penalty for a hazard-tagged document that names a
 * DIFFERENT hazard is real, because that is the case where the tag means
 * something.
 */
export function search(index, query, { limit = 6, hazard = null, district = null, minScore = 0.1, relativeFloor = 0.25 } = {}) {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length || !index.documents) return [];

  const hazardKey = hazard ? String(hazard).toLowerCase() : null;
  const districtKey = district ? String(district).toLowerCase() : null;

  const results = [];
  for (const entry of index.docs) {
    let score = scoreDocument(index, entry, terms);
    if (score <= 0) continue;

    const doc = entry.doc;
    const hazards = (doc.hazards ?? []).map((value) => String(value).toLowerCase());
    if (hazardKey) {
      if (hazards.includes(hazardKey)) score *= 1.6;
      else if (hazards.length) score *= 0.55;
    }
    if (districtKey && (doc.districts ?? []).map((d) => String(d).toLowerCase()).includes(districtKey)) {
      score *= 1.4;
    }
    if (score < minScore) continue;

    results.push({
      id: doc.id,
      title: doc.title,
      category: doc.category,
      authority: doc.authority,
      url: doc.url ?? null,
      basis: doc.basis ?? null,
      score: Number(score.toFixed(4)),
      matched: terms.filter((term) => entry.tf.has(term)),
      snippet: snippetFor(doc, terms),
      body: doc.body,
    });
  }

  results.sort((a, b) => b.score - a.score);

  // Nothing cleared the absolute threshold — an unrelated query must return an
  // empty list, not throw. (This guard is not cosmetic: `results[0].score` on an
  // empty list took the whole /api/chat/query route down with a 500 for any
  // question the corpus did not cover, which is the most likely question of all.)
  if (!results.length) return [];

  // Absolute thresholds alone let a query with one strong match pad its result
  // list with documents that share a common word ("protect", "cattle") and
  // nothing else. Measured on a real cold-wave question: the right document
  // scored 9.88, the genuinely useful second 3.03, then the tail collapsed to
  // 1.45, 1.26, 1.12, 1.00 — and every one of those was being cited to the user
  // as a source. A floor relative to the best match keeps the tail out, and it
  // scales with the query instead of being a magic constant tuned to one corpus.
  const floor = relativeFloor > 0 ? results[0].score * relativeFloor : 0;
  const relevant = results.filter((result) => result.score >= floor);

  return relevant.slice(0, Math.max(1, limit));
}
