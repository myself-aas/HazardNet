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

jest.mock('../../backend/services/localKnowledge.js', () => ({
  searchRAG: jest.fn(() => ({ results: [], districtBaseline: null })),
  routeSkills: jest.fn(() => []),
  GOVT_OFFICE_DIRECTORY: [],
}));
const { searchRAG } = require('../../backend/services/localKnowledge.js');

const app = require('../../backend/server').default;
const MAX_PROMPT_CHARS = 12_000;

function promptOfLastCall() {
  const call = generateAdvisoryWithFallback.mock.calls.at(-1);
  return call[2] ?? '';
}

describe('chat prompt bounds', () => {
  beforeEach(() => {
    generateAdvisoryWithFallback.mockClear();
    searchRAG.mockClear();
  });

  it('keeps an oversized query out of the prompt, not just out of retrieval', async () => {
    const huge = 'A'.repeat(50_000);
    const res = await request(app).post('/api/chat/query').send({ query: huge });
    expect(res.status).toBe(200);

    const prompt = promptOfLastCall();
    expect(prompt.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    // 3000 chars of query plus context/history/instructions — nowhere near 50 000.
    expect(prompt.length).toBeLessThan(6_000);
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
    searchRAG.mockImplementationOnce(() => ({
      results: Array.from({ length: 40 }, (_, i) => ({
        id: `doc-${i}`, title: `Doc ${i}`, category: 'c', content: 'C'.repeat(2_000), score: 0.5,
      })),
      districtBaseline: null,
    }));

    const res = await request(app).post('/api/chat/query').send({ query: 'flood advice' });
    expect(res.status).toBe(200);
    expect(promptOfLastCall().length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    expect(res.body.prompt.truncated).toBe(true);
    expect(promptOfLastCall()).toContain('retrieved context truncated');
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
