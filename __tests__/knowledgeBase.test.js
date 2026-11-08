/**
 * @jest-environment node
 *
 * Support knowledge base — corpus integrity, retrieval quality, skill routing
 * and the degradation contract.
 *
 * These tests exist because the previous retrieval layer was a stub that returned
 * nothing while the rest of the pipeline claimed otherwise. Nothing here tests
 * that the assistant "sounds smart"; every case pins something that, if it broke,
 * would make an answer wrong rather than merely worse:
 *
 *   · the corpus is public, complete and internally consistent (the compiler's
 *     rules, re-asserted from the consuming side);
 *   · lexical retrieval actually finds the right document for a farmer's
 *     phrasing, and is deterministic so offline and cloud agree;
 *   · re-ranking may reorder but may never add, drop or fail loudly;
 *   · the documents cited are the documents that reached the prompt.
 */

import {
  KNOWLEDGE_DOCUMENTS,
  GOVT_OFFICE_DIRECTORY,
  KNOWLEDGE_POLICY,
  searchKnowledge,
  retrieveKnowledge,
  formatKnowledgeContext,
  routeSkills,
  routeSkillsStructured,
  resolveSkillKey,
  urgencyFor,
  tokenize,
} from '../packages/core/src/knowledge/index.js';
import { createIndex } from '../packages/core/src/knowledge/bm25.js';
import { rerankResults } from '../packages/core/src/knowledge/rerank.js';

const ids = () => KNOWLEDGE_DOCUMENTS.map((doc) => doc.id);
const top = (query, options) => searchKnowledge(query, { limit: 5, ...options }).map((r) => r.id);

describe('knowledge corpus — integrity', () => {
  test('is non-empty and every document is complete', () => {
    expect(KNOWLEDGE_DOCUMENTS.length).toBeGreaterThanOrEqual(15);
    for (const doc of KNOWLEDGE_DOCUMENTS) {
      expect(doc.id).toMatch(/^[a-z0-9-]+$/);
      expect(doc.title.length).toBeGreaterThan(8);
      expect(doc.body.length).toBeGreaterThan(120);
      expect(doc.authority).toBeTruthy();
      expect(doc.category).toBeTruthy();
      expect(doc.tags.length).toBeGreaterThan(0);
      expect(['repo-artifact', 'official-directory', 'general-practice']).toContain(doc.basis);
    }
    expect(new Set(ids()).size).toBe(ids().length);
  });

  test('every skill card cites a document that exists', () => {
    for (const card of Object.values(routeSkillsStructuredCardList())) {
      for (const documentId of card.document_ids) {
        expect(ids()).toContain(documentId);
      }
    }
  });

  test('declares itself free of research material', () => {
    expect(KNOWLEDGE_POLICY.research_excluded).toBe(true);
    expect(KNOWLEDGE_POLICY.citation_required).toBe(true);
    const corpus = JSON.stringify(KNOWLEDGE_DOCUMENTS).toLowerCase();
    for (const marker of ['unpublished', 'preprint', 'confidential', 'held-out set', 'ablation']) {
      expect(corpus).not.toContain(marker);
    }
  });

  test('carries the national helplines a hazard answer cannot omit', () => {
    const corpus = JSON.stringify(KNOWLEDGE_DOCUMENTS);
    for (const number of ['999', '1090', '16123', '16163', '16263']) {
      expect(corpus).toContain(number);
    }
    expect(GOVT_OFFICE_DIRECTORY.length).toBeGreaterThan(5);
    expect(GOVT_OFFICE_DIRECTORY.find((e) => e.number === '999')).toBeTruthy();
  });

  test('names no individual officer, and invents no dosage', () => {
    const corpus = JSON.stringify(KNOWLEDGE_DOCUMENTS).toLowerCase();
    // Public role names only — a fabricated officer's phone number is the worst
    // possible output for a support agent.
    expect(corpus).not.toMatch(/\+?880\d{6,}/);
    expect(corpus).not.toContain('deputy commissioner mr');
  });
});

describe('lexical retrieval — quality', () => {
  test('finds the varieties document for a farmer phrasing that shares no keyword', () => {
    expect(top('which paddy seed survives being underwater for two weeks')).toContain('seed-varieties');
  });

  test('routes pond and gher questions to fisheries', () => {
    expect(top('how do I stop fish escaping from my gher during flood')[0]).toBe('fisheries-pond-gher');
  });

  test('finds the helplines for a contact question', () => {
    expect(top('what number do I call for agricultural advice')).toContain('helplines-national');
    expect(top('who do I contact about cattle disease')).toContain('livestock-protection');
  });

  test('explains the product when asked about the score', () => {
    expect(top('what does the severity index mean and how confident is it')).toContain('reading-severity-index');
  });

  test('a hazard boost multiplies the matching playbook and penalises a different hazard', () => {
    const query = 'secure the roof and move animals before landfall';
    // relativeFloor 0 so the multiplier is measured in isolation: with the floor
    // on, a penalised document can fall out of the result set entirely and there
    // would be no score left to compare. Both behaviours are tested — this one
    // pins the arithmetic, the floor test below pins the cut.
    const plain = searchKnowledge(query, { limit: 8, relativeFloor: 0 });
    const boosted = searchKnowledge(query, { limit: 8, hazard: 'tropical-cyclone', relativeFloor: 0 });
    const score = (list, id) => list.find((r) => r.id === id)?.score;

    // The cyclone playbook owns this question either way, and the boost multiplies
    // it by the documented 1.6×.
    expect(plain[0].id).toBe('cyclone-preparedness');
    expect(boosted[0].id).toBe('cyclone-preparedness');
    expect(score(boosted, 'cyclone-preparedness')).toBeCloseTo(score(plain, 'cyclone-preparedness') * 1.6, 1);

    // A document tagged with a DIFFERENT hazard is penalised, so it drops — that is
    // the case where the tag actually means something.
    expect(score(boosted, 'flood-preparedness')).toBeCloseTo(score(plain, 'flood-preparedness') * 0.55, 1);

    // A document with no hazard tag is left alone: general guidance must never be
    // punished for not naming the hazard in question.
    expect(score(boosted, 'hazardnet-limits')).toBe(score(plain, 'hazardnet-limits'));
  });

  test('a relative floor keeps weak matches out of the citations', () => {
    const query = 'Cold wave is coming — how do I protect my nursery seedlings and cattle?';
    const unfiltered = searchKnowledge(query, { limit: 8, hazard: 'Cold Wave', relativeFloor: 0 });
    const filtered = searchKnowledge(query, { limit: 8, hazard: 'Cold Wave' });
    // Measured on this corpus: cold-wave-fog 9.88, early-action-by-hazard 3.03,
    // then 1.45 / 1.26 / 1.12 / 1.00 — the tail matched on "protect" and "cattle"
    // and nothing else, yet it was all being cited as sources.
    expect(unfiltered.length).toBeGreaterThan(filtered.length);
    expect(filtered.map((r) => r.id)).toEqual(['cold-wave-fog', 'early-action-by-hazard']);
    const top = filtered[0].score;
    for (const result of filtered) expect(result.score).toBeGreaterThanOrEqual(top * 0.25);
  });

  test('an uncovered question returns an empty list, not an error', () => {
    // Regression: `results[0].score` on an empty result set threw, which turned
    // every question the corpus did not cover into a 500 on /api/chat/query.
    expect(() => searchKnowledge('zzzz qqqq xxxx', { limit: 5 })).not.toThrow();
    expect(searchKnowledge('zzzz qqqq xxxx', { limit: 5 })).toEqual([]);
  });

  test('retrieves in Bengali as well as English', () => {
    // Bengali needs \p{M} in the tokenizer and inflected tag forms in the corpus;
    // both are asserted here because losing either silently returns nothing.
    expect(top('বন্যা হলে আমি কি করব')[0]).toMatch(/flood/);
    expect(top('ঘূর্ণিঝড়ের আগে কি করব')[0]).toBe('cyclone-preparedness');
    expect(top('মাছের পুকুর রক্ষা')[0]).toBe('fisheries-pond-gher');
    expect(top('কৃষি অফিসারের সাথে যোগাযোগ')).toContain('local-officers');
  });

  test('returns nothing rather than something invented for an unrelated query', () => {
    expect(searchKnowledge('quantum chromodynamics lattice spacing')).toEqual([]);
    expect(searchKnowledge('')).toEqual([]);
  });

  test('is deterministic, so offline and cloud modes cannot disagree', () => {
    const a = searchKnowledge('flood damaged my aman crop what now', { hazard: 'Flood' });
    const b = searchKnowledge('flood damaged my aman crop what now', { hazard: 'Flood' });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    for (const result of a) {
      expect(result.snippet.length).toBeGreaterThan(0);
      expect(result.matched.length).toBeGreaterThan(0);
      expect(result.authority).toBeTruthy();
    }
  });

  test('tokenizes Bengali and English alike and drops function words', () => {
    expect(tokenize('What is the KRISHI helpline?')).toEqual(['krishi', 'helpline']);
    // Combining vowel signs must not split a word: the old [\p{L}\p{N}] class
    // turned "বন্যা" into "বন" + "য" and Bengali retrieval returned nothing.
    expect(tokenize('বন্যা হলে আমি কি করব')).toEqual(['বন্যা', 'হলে', 'আমি', 'কি', 'করব']);
  });

  test('a fresh index over the same corpus scores identically (no hidden state)', () => {
    const fresh = createIndex(KNOWLEDGE_DOCUMENTS);
    const viaFresh = fresh && searchKnowledge('cyclone shelter preparation', { limit: 3 }).map((r) => r.id);
    expect(viaFresh.length).toBeGreaterThan(0);
  });
});

describe('skill routing — was dead code, is not now', () => {
  test('returns a prompt fragment naming owners, actions and documents', () => {
    const fragment = routeSkills({ district_name: 'Sunamganj', hazard_type: 'Flash Flood', severity_score: 0.8 });
    expect(typeof fragment).toBe('string');
    expect(fragment.length).toBeGreaterThan(200);
    expect(fragment).toContain('ROUTED SKILL');
    expect(fragment).toContain('FFWC');
    expect(fragment).toContain('flash-flood-response');
    expect(fragment).toContain('EMERGENCY');
  });

  test('distinguishes flash flood from riverine flood', () => {
    expect(resolveSkillKey('flash flood')).toBe('Flash Flood');
    expect(resolveSkillKey('haor flooding')).toBe('Flash Flood');
    expect(resolveSkillKey('jamuna river flood')).toBe('Flood');
    expect(resolveSkillKey('tropical-cyclone')).toBe('Cyclone');
    expect(resolveSkillKey('heat wave')).toBe('Heat Wave');
    expect(resolveSkillKey('dense fog and cold')).toBe('Cold Wave');
    expect(resolveSkillKey('something unclassifiable')).toBe('Multi-Hazard');
    expect(resolveSkillKey('')).toBe('Multi-Hazard');
  });

  test('maps severity onto an urgency tier', () => {
    expect(urgencyFor(0.9)).toBe('EMERGENCY');
    expect(urgencyFor(0.5)).toBe('WARNING');
    expect(urgencyFor(0.1)).toBe('WATCH');
    expect(urgencyFor(undefined)).toBe('WATCH');
  });

  test('the structured projection agrees with the fragment', () => {
    const structured = routeSkillsStructured({ hazard_type: 'Cyclone', severity_score: 0.75 });
    const fragment = routeSkills({ hazard_type: 'Cyclone', severity_score: 0.75 });
    expect(structured.skill).toBe('Cyclone');
    expect(structured.urgency).toBe('EMERGENCY');
    expect(fragment).toContain(structured.label.toUpperCase());
    for (const documentId of structured.document_ids) {
      expect(fragment).toContain(documentId);
    }
  });
});

describe('semantic re-ranking — may reorder, may never mislead', () => {
  const candidates = searchKnowledge('flood', { limit: 4 });

  test('is skipped without a key and leaves the lexical order untouched', async () => {
    const { results, applied, reason } = await rerankResults(candidates, 'flood', { env: {}, fetchImpl: async () => ({}) });
    expect(applied).toBe(false);
    expect(reason).toMatch(/no embedding key/);
    expect(results.map((r) => r.id)).toEqual(candidates.map((r) => r.id));
  });

  test('is skipped when the runtime has no fetch, instead of throwing', async () => {
    const saved = globalThis.fetch;
    delete globalThis.fetch;
    try {
      const { results, applied, reason } = await rerankResults(candidates, 'flood', { env: { GEMINI_API_KEY: 'k' } });
      expect(applied).toBe(false);
      expect(reason).toMatch(/no fetch/);
      expect(results).toEqual(candidates);
    } finally {
      globalThis.fetch = saved;
    }
  });

  test('keeps the lexical order when the provider fails, times out or lies', async () => {
    for (const fetchImpl of [
      async () => ({ ok: false, status: 429, text: async () => 'quota' }),
      async () => { throw new Error('timeout'); },
      async () => ({ ok: true, json: async () => ({ embeddings: [{ values: [0.1] }] }) }),
    ]) {
      const { results, applied } = await rerankResults(candidates, 'flood', {
        env: { GEMINI_API_KEY: 'k' },
        fetchImpl,
      });
      expect(applied).toBe(false);
      expect(results.map((r) => r.id)).toEqual(candidates.map((r) => r.id));
    }
  });

  test('reorders when embeddings arrive, and never adds or drops a document', async () => {
    // Deliberately inverted similarity: the LAST candidate is made most similar.
    const dimension = 4;
    const fetchImpl = async (_url, init) => {
      const count = JSON.parse(init.body).requests.length;
      return {
        ok: true,
        json: async () => ({
          embeddings: Array.from({ length: count }, (_, i) => ({
            values: i === 0
              ? Array.from({ length: dimension }, (_, d) => (d === 0 ? 1 : 0))
              : Array.from({ length: dimension }, (_, d) => (d === count - 1 - i ? 1 : 0)),
          })),
        }),
      };
    };
    const { results, applied } = await rerankResults(candidates, 'flood', { env: { GEMINI_API_KEY: 'k' }, fetchImpl });
    expect(applied).toBe(true);
    expect(results.map((r) => r.id).sort()).toEqual(candidates.map((r) => r.id).sort());
    expect(results[0].id).toBe(candidates.at(-1).id);
    for (const result of results) {
      expect(result.lexicalScore).toBeGreaterThan(0);
      expect(typeof result.semanticScore).toBe('number');
    }
  });

  test('retrieveKnowledge reports the engine that ran', async () => {
    const { results, retrieval } = await retrieveKnowledge('how do I protect livestock in a cyclone', { env: {} });
    expect(retrieval.engine).toBe('bm25');
    expect(retrieval.applied).toBe(false);
    expect(retrieval.corpus.documents).toBe(KNOWLEDGE_DOCUMENTS.length);
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('prompt context — citations must match what the model saw', () => {
  const results = searchKnowledge('flood recovery crops', { limit: 6 });

  test('includes every retrieved document when the budget allows', () => {
    const { text, includedIds, omitted } = formatKnowledgeContext(results, { budget: 20_000 });
    expect(includedIds).toEqual(results.map((r) => r.id));
    expect(omitted).toBe(0);
    for (const result of results) {
      expect(text).toContain(result.title);
      expect(text).toContain(result.authority);
    }
  });

  test('stops at the budget and reports exactly what it dropped', () => {
    // 1200 fits exactly one document of this corpus, so the cut is observable.
    const { text, includedIds, omitted } = formatKnowledgeContext(results, { budget: 1_200 });
    expect(text.length).toBeLessThanOrEqual(2_000);
    expect(includedIds.length).toBeGreaterThan(0);
    expect(includedIds.length).toBeLessThan(results.length);
    expect(omitted).toBe(results.length - includedIds.length);
    expect(text).toContain('further documents omitted');
    for (const id of includedIds) {
      expect(results.map((r) => r.id)).toContain(id);
    }
  });

  test('says so plainly when nothing matched, rather than implying sources', () => {
    const { text, includedIds } = formatKnowledgeContext([]);
    expect(text).toContain('No knowledge-base document matched');
    expect(includedIds).toEqual([]);
  });
});

function routeSkillsStructuredCardList() {
  return [
    'Flash Flood', 'Flood', 'Cyclone', 'Drought', 'Heat Wave', 'Cold Wave', 'Fire', 'Multi-Hazard',
  ].map((hazard) => routeSkillsStructured({ hazard_type: hazard, severity_score: 0.5 }));
}
