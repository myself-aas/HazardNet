/**
 * @jest-environment node
 *
 * Phase 6 (SEC-11): the chat prompt bounds are enforced, not just computed.
 *
 * The route computed `sanitizedQuery` for RAG retrieval and then built the LLM prompt from
 * the raw request body — so the per-field limits were decorative on the one path that
 * costs money and carries prompt-injection risk. These tests capture the prompt actually
 * handed to the AI engine and assert the bounds hold end to end.
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../rag_pipeline/index.js', () => ({
  searchRAG: jest.fn(() => ({
    results: [{ id: 'doc-1', title: 'T', category: 'c', content: 'x'.repeat(400), score: 0.9 }],
    districtBaseline: null,
  })),
  GOVT_OFFICE_DIRECTORY: [],
  routeSkills: jest.fn(() => 'test routed skills'),
  getAgentInstructions: jest.fn(() => 'test instructions'),
}));

jest.mock('../../backend/utils/ai_fallback_engine.js', () => ({
  generateAdvisoryWithFallback: jest.fn(async () => ({ reply: 'ok', provider: 'mock', provider_source: 'mock' })),
  generateDeterministicHeuristicAdvisory: jest.fn(() => ({ reply: 'test reply' })),
}));

import { searchRAG } from '../../rag_pipeline/index.js';
import { generateAdvisoryWithFallback } from '../../backend/utils/ai_fallback_engine.js';
import chatRoutes from '../../backend/routes/chat.js';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/chat', chatRoutes);

const MAX_PROMPT_CHARS = 12_000;
const promptOfLastCall = () => generateAdvisoryWithFallback.mock.calls.at(-1)[2];

beforeEach(() => {
  generateAdvisoryWithFallback.mockClear();
  searchRAG.mockImplementation(() => ({
    results: [{ id: 'doc-1', title: 'T', category: 'c', content: 'x'.repeat(400), score: 0.9 }],
    districtBaseline: null,
  }));
});

describe('chat prompt bounds', () => {
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
