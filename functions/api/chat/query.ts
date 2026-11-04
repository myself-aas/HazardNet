/**
 * `POST /api/chat/query` — the AI Advisor question endpoint, on the edge.
 *
 * Why this file exists: after the 2026-10-26 Cloudflare Pages cutover there was no
 * `functions/api/chat/**`, so `_routes.json`'s `/api/*` matched no Function and the
 * request fell through to the static asset server — which answers **405 for every
 * non-GET method**. The widget's POST therefore always saw "The AI service is
 * unreachable (HTTP 405)" on the deployed site. These two routes moved out of the
 * Node-only disposition in `docs/ops/route-register.json` (there is no Node host any
 * more — Vercel was removed 2026-10-26) and into `functions/api/chat/`.
 *
 * The handler is the SAME `handleChatQuery` the Express route and the Node function
 * twin call (`backend/routes/chat.js`, `serverless/chat/query.js`); only the
 * transport differs. Since 2026-11-04 the chat import graph is Worker-safe:
 * portable SHA-256 instead of `node:crypto` (`backend/utils/portableHash.js`),
 * Gemini over REST `fetch` instead of the `@google/genai` SDK, and secrets from
 * `context.env` instead of `process.env` (`backend/utils/runtimeEnv.js`).
 *
 * With no provider keys set in the Pages project's environment variables the cascade
 * lands on the deterministic offline tier, so the widget still answers — it never
 * returns the 405 again. Keys, when set as Pages env vars (GEMINI_API_KEY,
 * GEMINI_API_KEY_BACKUP, OPENROUTER_API_KEY, GROQ_API_KEY, HUGGINGFACE_API_KEY),
 * reach the providers through the same cascade the Node runtime uses.
 */

import { handleChatQuery } from '../../../backend/utils/chatService.js';

interface PagesContext {
  request: Request;
  env?: Record<string, string | undefined>;
}

/** Same cap as the telemetry Function: bound the raw body before parsing it. */
const BODY_MAX_BYTES = 64 * 1024;

/** Mirrors `BUCKETS.ai` in `backend/middleware/serverlessGuard.js` (20/min). */
const AI_LIMIT = 20;
const WINDOW_MS = 60_000;

/**
 * Per-instance rate-limit state — the same honest scope as the Node guard
 * (`serverlessGuard.js` documents it): one Worker isolate, so this stops a single
 * client hammering one instance, not a globally coordinated one.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

/** Best-effort client identity: the first XFF entry is the client as seen by the edge. */
function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return 'unknown';
}

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request } = context;
  const env = context.env ?? {};

  // Metered first, exactly like the Node twin's `guardRequest`: even a request that
  // will be rejected below spends AI-bucket budget.
  const now = Date.now();
  const key = clientKey(request);
  const entry = hits.get(key);
  if (!entry || now >= entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else if (entry.count >= AI_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return json(
      { error: 'Too many requests. Slow down and retry shortly.', retry_after_seconds: retryAfter },
      429,
      { 'retry-after': String(retryAfter) }
    );
  } else {
    entry.count += 1;
  }

  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405, { allow: 'POST' });
  }

  // Read as text and bound *before* parsing, as `functions/api/v1/telemetry.ts` does:
  // `await request.json()` would buffer a body of any size.
  const raw = await request.text();
  if (raw.length > BODY_MAX_BYTES) {
    return json({ error: 'payload too large' }, 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'body must be valid JSON' }, 400);
  }

  try {
    // One shared implementation with the Express route and the Node twin; `env` is
    // `context.env` here because a Worker has no `process.env`.
    const result = await handleChatQuery(payload as { query: string }, env);
    return json(result, 200);
  } catch (err) {
    const statusCode = typeof (err as { statusCode?: unknown } | null)?.statusCode === 'number'
      ? (err as { statusCode: number }).statusCode
      : null;
    if (statusCode) {
      // Validation errors carry `statusCode` (400) so transports map them as-is.
      return json({ error: (err as Error).message }, statusCode);
    }
    console.error('[chat/query] error:', err instanceof Error ? err.message : err);
    return json(
      { error: 'Failed to process RAG chat query', message: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}
