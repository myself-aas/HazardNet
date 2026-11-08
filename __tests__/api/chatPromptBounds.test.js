/**
 * @jest-environment node
 *
 * Phase 6 (SEC-11): the chat prompt bounds are enforced, not just computed.
 *
 * The route computed `sanitizedQuery` for retrieval and then built the LLM prompt from
 * the raw request body — so the per-field limits were decorative on the one path that
 * costs money and carries prompt-injection risk. These tests capture the prompt actually
 * handed to the AI engine and assert the bounds hold end to end.
 */

import request from 'supertest';

jest.mock('../../backend/utils/ai_fallback_engine.js', () => ({
  generateAdvisoryWithFallback: jest.fn(async () => ({ text: 'MOCK ADVICE', fallback: null })),
}));
const { generateAdvisoryWithFallback } = require('../../backend/utils/ai_fallback_engine.js');

// The chat pipeline retrieves from the knowledge module now (not the legacy
// `localKnowledge.js` adapter), so the mock has to follow it — a mock aimed at a
// module nobody imports is a test that passes while testing nothing. Everything
// except `retrieveKnowledge` stays the real implementation, so the budget logic
// under test is the production code.
jest.mock('../../packages/core/src/knowledge/index.js', () => {
  const actual = jest.requireActual('../../packages/core/src/knowledge/index.js');
  return {
    ...actual,
    retrieveKnowledge: jest.fn(async (query, options = {}) => {
      const results = actual.searchKnowledge(query, { district: options.district, hazard: options.hazard, limit: 6 });
      return { results, retrieval: { engine: 'bm25', applied: false, reason: 'mocked', candidates: results.length, corpus: { documents: 18, version: 1 } } };
    }),
  };
});
const { retrieveKnowledge } = require('../../packages/core/src/knowledge/index.js');

const app = require('../../backend/server').default;
const MAX_PROMPT_CHARS = 12_000;

function promptOfLastCall() {
  const call = generateAdvisoryWithFallback.mock.calls.at(-1);
  return call[2] ?? '';
}

describe('chat prompt bounds', () => {
  beforeEach(() => {
    generateAdvisoryWithFallback.mockClear();
    retrieveKnowledge.mockClear();
  });

  it('keeps an oversized query out of the prompt, not just out of retrieval', async () => {
    const huge = 'A'.repeat(50_000);
    const res = await request(app).post('/api/chat/query').send({ query: huge });
    expect(res.status).toBe(200);

    const prompt = promptOfLastCall();
    expect(prompt.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    // 3000 chars of query, plus context, the official directory, instructions and
    // the agent's live-data digest — nowhere near 50 000. The digest is why this
    // is not 6 000: the Express route supplies a public artifact reader, so the
    // agent runs and a short summary of what it read joins the prompt. That is
    // the intended behaviour; MAX_PROMPT_CHARS above is the bound that matters.
    expect(prompt.length).toBeLessThan(7_000);
    expect(res.body.prompt.chars).toBe(prompt.length);
  });

  it('caps each history message and how many are replayed', async () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: `m${i}:` + 'B'.repeat(5_000),
    }));

    const res = await request(app).post('/api/chat/query').send({ query: 'flood advice', conversationHistory: history });
    expect(res.status).toBe(200);

    const prompt = promptOfLastCall();
    expect(prompt.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    // Only the last four turns appear…
    expect(prompt).toContain('m19:');
    expect(prompt).not.toContain('m15:');
    // …and each is cut to 1500 chars, so no 5000-char body survives.
    expect(prompt).not.toContain('B'.repeat(1_600));
  });

  it('bounds the whole prompt even when retrieved context is large', async () => {
    retrieveKnowledge.mockImplementationOnce(async () => ({
      results: Array.from({ length: 40 }, (_, i) => ({
        id: `doc-${i}`, title: `Doc ${i}`, category: 'c', authority: 'A', url: null,
        basis: 'repo-artifact', body: 'C'.repeat(2_000), score: 0.5, snippet: 'C', matched: ['flood'],
      })),
      retrieval: { engine: 'bm25', applied: false, reason: 'oversized context', candidates: 40, corpus: { documents: 18, version: 1 } },
    }));

    const res = await request(app).post('/api/chat/query').send({ query: 'flood advice' });
    expect(res.status).toBe(200);
    expect(promptOfLastCall().length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);

    // The retrieved context is budgeted twice: `formatKnowledgeContext` caps its
    // own block, and the SEC-11 cap trims whatever is left. Either way the
    // prompt stays inside the bound.
    expect(res.body.retrieval.candidates).toBe(40);
    expect(res.body.retrieval.cited).toBeGreaterThan(0);
    expect(res.body.retrieval.cited).toBeLessThan(40);
    expect(res.body.retrieval.omitted).toBe(40 - res.body.retrieval.cited);

    // And the citations the UI renders must be documents the model actually saw.
    const prompt = promptOfLastCall();
    for (const source of res.body.retrieved_sources) {
      expect(prompt).toContain(source.title);
    }
    expect(res.body.retrieved_sources).toHaveLength(res.body.retrieval.cited);
  });

  it('still answers an ordinary query without truncating anything', async () => {
    const res = await request(app).post('/api/chat/query').send({ query: 'How do I protect fish ponds?' });
    expect(res.status).toBe(200);
    expect(res.body.prompt.truncated).toBe(false);
    expect(promptOfLastCall()).toContain('How do I protect fish ponds?');
  });

  it('rejects an empty query before spending an AI call', async () => {
    const res = await request(app).post('/api/chat/query').send({ query: '   ' });
    expect(res.status).toBe(400);
    expect(generateAdvisoryWithFallback).not.toHaveBeenCalled();
  });
});
