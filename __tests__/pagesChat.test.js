/**
 * @jest-environment node
 *
 * `POST /api/chat/query` + `GET /api/chat/sample-questions` on the edge — the AI
 * Advisor port (Action 21, 2026-11-04).
 *
 * Before this port there was no `functions/api/chat/**`, so on the Pages deployment
 * `_routes.json`'s `/api/*` matched no Function and the request fell through to the
 * static asset server: **405 for the widget's POST** (the asset server rejects every
 * non-GET) and 404 for the sample-questions GET. That is exactly the reported symptom
 * — "The AI service is unreachable (HTTP 405)".
 *
 * These tests pin what the edge route must do: serve the SAME shared
 * `handleChatQuery` / `SAMPLE_QUESTIONS` the Express route and the Node twin serve,
 * take provider keys from `context.env` (a Worker has no `process.env`), bound the
 * body before parsing, gate the method with an explicit `allow` header, and meter
 * the ai bucket per client like `serverlessGuard.js` does on the Node surface.
 */

const { onRequest: chatQuery } = require('../functions/api/chat/query.ts');
const { onRequest: sampleQuestions } = require('../functions/api/chat/sample-questions.ts');

const URL_BASE = 'https://www.hazardnet.live';

const postQuery = (body, env = {}, headers = {}) =>
  chatQuery({
    request: new Request(`${URL_BASE}/api/chat/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
  });

describe('POST /api/chat/query — edge handler', () => {
  test('answers 200 from the deterministic offline tier when env carries no provider keys', async () => {
    const response = await postQuery({ query: 'How do I protect fish ponds during floods?' }, {});
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    // `CACHE.noStore` in `backend/edge/response.ts`: one name for "this body must never be
    // cached", instead of a literal retyped per route.
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    const body = await response.json();
    expect(body.query).toBe('How do I protect fish ponds during floods?');
    expect(body.answer).toContain('RAG Knowledge Assessment');
    expect(body.provider_source).toMatch(/Offline Heuristic/i);
    expect(body.suggested_followups).toHaveLength(3);
  });

  test('reads provider keys from context.env, never process.env — a Worker has no process global', async () => {
    // Jest runs in Node, where process.env exists; passing an explicit env holding
    // only GROQ_API_KEY proves the edge path consults context.env alone (the
    // gemini tiers must skip without their keys even if the host has some).
    const original = global.fetch;
    const fn = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({ answer: 'LLM answer: BRRI dhan51 survives submergence.', followups: ['q1', 'q2', 'q3'] }),
          },
        }],
      }),
    }));
    global.fetch = fn;
    try {
      const response = await postQuery({ query: 'Which rice varieties survive floods?' }, { GROQ_API_KEY: 'edge-test-key' });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.answer).toBe('LLM answer: BRRI dhan51 survives submergence.');
      expect(body.provider_source).toContain('Groq');
      expect(body.suggested_followups).toEqual(['q1', 'q2', 'q3']);
      expect(fn).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/chat/completions',
        expect.objectContaining({ method: 'POST' })
      );
    } finally {
      global.fetch = original;
    }
  });

  test('rejects an empty query with the shared 400 contract', async () => {
    const response = await postQuery({ query: '   ' }, {});
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Query parameter is required');
  });

  test('rejects a non-POST method with 405 and allow: POST', async () => {
    const response = await chatQuery({
      request: new Request(`${URL_BASE}/api/chat/query`, { method: 'GET' }),
      env: {},
    });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect((await response.json()).error).toBe('method not allowed');
  });

  test('bounds the body before parsing (413) and rejects invalid JSON (400)', async () => {
    const big = await postQuery({ query: 'x'.repeat(200 * 1024) }, {});
    expect(big.status).toBe(413);
    expect((await big.json()).error).toBe('payload too large');

    const bad = await postQuery('not json at all', {});
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('body must be valid JSON');
  });

  test('meters the ai bucket per client: the 21st call inside a minute is 429', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.77' };
    for (let i = 0; i < 20; i += 1) {
      const res = await postQuery({ query: `rate-limit probe ${i}` }, {}, headers);
      expect(res.status).toBe(200);
    }
    const last = await postQuery({ query: 'one too many' }, {}, headers);
    expect(last.status).toBe(429);
    expect(last.headers.get('retry-after')).toBeTruthy();
    expect((await last.json()).error).toMatch(/Too many requests/);
  });
});

describe('GET /api/chat/sample-questions — edge handler', () => {
  test('serves the shared SAMPLE_QUESTIONS list with edge caching', async () => {
    const response = await sampleQuestions({
      request: new Request(`${URL_BASE}/api/chat/sample-questions`, { method: 'GET' }),
      env: {},
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    const body = await response.json();
    expect(body.categories).toHaveLength(5);
    expect(body.categories[0].name).toContain('Agriculture');
    expect(body.categories[0].questions).toHaveLength(3);
    expect(body.categories[3].questions[0]).toContain('Upazila Agriculture Office');
  });

  test('rejects a non-GET method with 405 and allow: GET', async () => {
    const response = await sampleQuestions({
      request: new Request(`${URL_BASE}/api/chat/sample-questions`, { method: 'POST', body: '{}' }),
      env: {},
    });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect((await response.json()).error).toBe('method not allowed');
  });
});
