/**
 * @jest-environment node
 */

/**
 * Unit tests for the @hazardnet/api client.
 *
 * These tests run under node (not jsdom) because Response is a Node 18+ global.
 */

/// <reference lib="dom" />

import { createClient } from '../src/client';
import { OfflineError, TimeoutError, ClientError, AuthError, ServerError } from '../src/errors';
import { retryDelayMs, shouldRetry, DEFAULT_RETRY_POLICY } from '../src/retry';

function makeFetch(responses: Array<{ status: number; body?: unknown; delayMs?: number }>) {
  let callIdx = 0;
  return async (_url: string, _init: RequestInit) => {
    const idx = callIdx++;
    const r = responses[idx] ?? responses[responses.length - 1];
    if (r.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, r.delayMs));
    }
    return new Response(r.body !== undefined ? JSON.stringify(r.body) : null, {
      status: r.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

describe('retry helpers', () => {
  it('exponentially backs off with jitter', () => {
    // attempt is 1-indexed.
    for (let i = 1; i <= 5; i++) {
      const d = retryDelayMs(DEFAULT_RETRY_POLICY, i);
      const max = Math.min(
        DEFAULT_RETRY_POLICY.maxDelayMs,
        DEFAULT_RETRY_POLICY.baseDelayMs * Math.pow(DEFAULT_RETRY_POLICY.factor, i - 1),
      );
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(max + 1);
    }
  });

  it('retries on 5xx and 429, not 4xx', () => {
    expect(shouldRetry(DEFAULT_RETRY_POLICY, 0, new ClientError(500, 'server'))).toBe(true);
    expect(shouldRetry(DEFAULT_RETRY_POLICY, 0, new ClientError(429, 'ratelimited'))).toBe(true);
    expect(shouldRetry(DEFAULT_RETRY_POLICY, 0, new ClientError(400, 'bad req'))).toBe(false);
    expect(shouldRetry(DEFAULT_RETRY_POLICY, 0, new OfflineError())).toBe(true);
    expect(shouldRetry(DEFAULT_RETRY_POLICY, 10, new OfflineError())).toBe(false); // past max retries
    expect(shouldRetry(DEFAULT_RETRY_POLICY, 0, new AuthError())).toBe(false);
  });
});

describe('createClient', () => {
  const baseConfig = {
    baseUrl: 'https://api.example.com/v1',
    platform: 'ios' as const,
    appVersion: '1.0.0',
  };

  it('sends X-Platform and X-App-Version headers and returns JSON', async () => {
    const seenHeaders: Record<string, string> = {};
    const fetchImpl = async (url: string, init: RequestInit) => {
      Object.assign(seenHeaders, init.headers as Record<string, string>);
      return new Response(JSON.stringify({ hello: 'world' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const client = createClient({ ...baseConfig, fetchImpl });
    const res = await client.get('/ping', { retry: { maxRetries: 0 } });
    expect(res).toEqual({ hello: 'world' });
    expect(seenHeaders['X-Platform']).toBe('ios');
    expect(seenHeaders['X-App-Version']).toBe('1.0.0');
    expect(seenHeaders['Content-Type']).toBe('application/json');
  });

  it('throws ClientError on 4xx and ServerError on 5xx', async () => {
    const client404 = createClient({ ...baseConfig, fetchImpl: makeFetch([{ status: 404, body: { message: 'no' } }]) });
    await expect(client404.get('/missing', { retry: { maxRetries: 0 } })).rejects.toThrow(ClientError);
    const client500 = createClient({ ...baseConfig, fetchImpl: makeFetch([{ status: 500, body: { message: 'boom' } }]) });
    await expect(client500.get('/err', { retry: { maxRetries: 0 } })).rejects.toThrow(ServerError);
  });

  it('appends fields as a comma-separated query parameter', async () => {
    let capturedUrl = '';
    const client = createClient({
      ...baseConfig,
      fetchImpl: async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    });
    await client.get('/alerts', { fields: ['id', 'level', 'hazard_type'], retry: { maxRetries: 0 } });
    expect(capturedUrl).toContain('fields=id%2Clevel%2Chazard_type');
  });

  it('aborts with TimeoutError after timeout', async () => {
    const client = createClient({
      ...baseConfig,
      defaultTimeoutMs: 50,
      fetchImpl: async (_url: string, init: RequestInit) => {
        // Respect the abort signal so the timeout can cancel us.
        await new Promise<void>((resolve, reject) => {
          const signal = init.signal!;
          const t = setTimeout(resolve, 200);
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              // fetch() always rejects with an AbortError DOMException on abort;
              // the abort *reason* is what distinguishes timeout vs user cancel.
              const err = new DOMException('The operation was aborted.', 'AbortError');
              reject(err);
            },
            { once: true },
          );
        });
        return new Response(null, { status: 200 });
      },
    });
    await expect(client.get('/slow', { retry: { maxRetries: 0 } })).rejects.toThrow(TimeoutError);
  });

  it('fails fast with OfflineError when isOnline returns false', async () => {
    const client = createClient({ ...baseConfig, isOnline: () => false, fetchImpl: async () => new Response(null, { status: 200 }) });
    await expect(client.get('/ping', { retry: { maxRetries: 0 } })).rejects.toThrow(OfflineError);
  });
});
