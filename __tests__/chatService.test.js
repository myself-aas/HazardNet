/**
 * AI Advisor chat pipeline — RAG retrieval + multi-provider LLM cascade.
 *
 * Pins the 2026-09-17 fixes:
 *  1. the advisory cache key includes a hash of the prompt, so two different
 *     questions never share a cached answer (the old district:hazard:severity
 *     key conflated every chat turn for 10 minutes);
 *  2. successful LLM tiers are stamped with a human-readable provider_source;
 *  3. searchRAG's district lookup reads the baselines' `name` key, so a
 *     district question actually carries its baseline into the LLM prompt;
 *  4. with no API keys configured the chat still answers (deterministic tier)
 *     grounded in REAL retrieved RAG sources — the widget must never show
 *     "error communicating with the AI" for a key/quota outage.
 */

import { handleChatQuery } from '../backend/utils/chatService.js';
import { generateAdvisoryWithFallback } from '../backend/utils/ai_fallback_engine.js';

const LLM_ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_API_KEY_BACKUP',
  'OPENROUTER_API_KEY',
  'GROQ_API_KEY',
  'HUGGINGFACE_API_KEY',
];
const SAVED_ENV = {};

function clearLlmKeys() {
  for (const k of LLM_ENV_KEYS) {
    SAVED_ENV[k] = process.env[k];
    delete process.env[k];
  }
}

function restoreLlmKeys() {
  for (const k of LLM_ENV_KEYS) {
    if (SAVED_ENV[k] !== undefined) process.env[k] = SAVED_ENV[k];
    else delete process.env[k];
  }
}

function mockFetchWith(content) {
  const original = global.fetch;
  const fn = jest.fn(async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  }));
  global.fetch = fn;
  return { fn, restore: () => { global.fetch = original; } };
}

afterAll(() => {
  restoreLlmKeys();
});

describe('handleChatQuery — validation', () => {
  test('rejects an empty query with a 400-shaped error', async () => {
    await expect(handleChatQuery({ query: '   ' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(handleChatQuery({})).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('handleChatQuery — offline tier (no LLM keys configured)', () => {
  test('answers from the deterministic tier grounded in real RAG sources + district baseline', async () => {
    clearLlmKeys();
    try {
      const res = await handleChatQuery({
        query: 'Which BRRI rice varieties are submergence tolerant for flash floods?',
        district: 'Sunamganj',
      });

      // Full response contract
      expect(res.query).toBe('Which BRRI rice varieties are submergence tolerant for flash floods?');
      expect(res.answer).toBeTruthy();
      expect(res.answer).toContain('RAG Knowledge Assessment'); // structured heuristic rendering
      expect(res.suggested_followups).toHaveLength(3);

      // RAG retrieval really ran against the indexed knowledge base
      expect(res.retrieved_sources.length).toBeGreaterThan(0);
      expect(res.retrieved_sources[0]).toMatchObject({
        title: expect.any(String),
        category: expect.any(String),
        relevanceScore: expect.any(Number),
      });

      // District context (fix #3: baselines are keyed by `name`)
      expect(res.district_baseline).toBeTruthy();
      expect(res.district_baseline.name).toBe('Sunamganj');
      expect(res.district_contacts).toMatchObject({ district: 'Sunamganj' });

      expect(res.govt_directory).toBeTruthy();
      expect(res.provider_source).toMatch(/Offline Heuristic/i);
      expect(res.cached).toBe(false);
    } finally {
      restoreLlmKeys();
    }
  });
});

describe('handleChatQuery — LLM tier (mocked free-tier provider)', () => {
  test('returns the LLM Markdown answer, followups, and provider provenance', async () => {
    clearLlmKeys();
    process.env.GROQ_API_KEY = 'test-groq-key';
    const { fn, restore } = mockFetchWith(JSON.stringify({
      answer: '### 🌾 Rice Advice\n**BRRI dhan51** and **dhan52** survive 12–15 days of submergence.',
      followups: ['What about salinity-tolerant varieties?', 'Where do I get certified seeds?', 'When should I replant?'],
    }));
    try {
      const res = await handleChatQuery({ query: 'Which rice varieties survive floods in the haor region?' });

      expect(res.answer).toContain('BRRI dhan51');
      expect(res.suggested_followups).toEqual([
        'What about salinity-tolerant varieties?',
        'Where do I get certified seeds?',
        'When should I replant?',
      ]);
      // Fix #2: the answering provider is stamped
      expect(res.provider_source).toContain('Groq');
      expect(res.cached).toBe(false);

      // The RAG context + strict JSON contract were sent to the provider
      expect(fn).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/chat/completions',
        expect.objectContaining({ method: 'POST' })
      );
      const body = JSON.parse(fn.mock.calls[0][1].body);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].content).toContain('RETRIEVED RAG KNOWLEDGE BASE DOCUMENTS');
      expect(body.messages[1].content).toContain('{"answer":');
      expect(body.response_format).toEqual({ type: 'json_object' });
    } finally {
      restore();
      restoreLlmKeys();
    }
  });
});

describe('generateAdvisoryWithFallback — cache-key + provenance invariants', () => {
  test('different prompts with identical params are answered separately; identical prompts hit the cache', async () => {
    clearLlmKeys();
    process.env.GROQ_API_KEY = 'test-groq-key';
    const { fn, restore } = mockFetchWith('{"answer":"ok","followups":["q1","q2","q3"]}');
    try {
      const params = { district_name: 'Sunamganj', hazard_type: 'chat', severity_score: 0.5 };

      const r1 = await generateAdvisoryWithFallback(params, 'sys', 'question about rice');
      const r2 = await generateAdvisoryWithFallback(params, 'sys', 'question about fisheries');

      // Fix #1: the prompt distinguishes the cache entries
      expect(r1.provider_source).toContain('Groq');
      expect(r2.provider_source).toContain('Groq');
      expect(fn).toHaveBeenCalledTimes(2);

      // Same prompt again → served from cache, no new upstream call
      const r3 = await generateAdvisoryWithFallback(params, 'sys', 'question about rice');
      expect(r3.cached).toBe(true);
      expect(r3.provider_source).toContain('Groq');
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      restore();
      restoreLlmKeys();
    }
  });

  test('circuit breaker trips after repeated provider failures and falls through to the heuristic tier', async () => {
    clearLlmKeys();
    process.env.GROQ_API_KEY = 'test-groq-key';
    const original = global.fetch;
    global.fetch = jest.fn(async () => ({ ok: false, status: 429, text: async () => 'rate limited' }));
    try {
      const params = { district_name: 'Kurigram', hazard_type: 'chat', severity_score: 0.5 };
      const first = await generateAdvisoryWithFallback(params, 'sys', 'breaker prompt A');
      expect(first.provider_source).toMatch(/Offline Heuristic/i);

      // Breaker now TRIPPED for groq: a new prompt must not even attempt it.
      const callsAfterFirst = global.fetch.mock.calls.length;
      const second = await generateAdvisoryWithFallback(params, 'sys', 'breaker prompt B');
      expect(second.provider_source).toMatch(/Offline Heuristic/i);
      expect(global.fetch.mock.calls.length).toBe(callsAfterFirst);
    } finally {
      global.fetch = original;
      restoreLlmKeys();
    }
  });
});
