/**
 * @jest-environment node
 *
 * The artifacts reader (frontend/src/lib/artifacts.ts).
 *
 * The point of this module is that four pages used to fetch the same deployed files with four
 * different sets of decisions, and the differences were observable:
 *
 *   · no deadline at all on two of them, so a slow connection held a card open;
 *   · a 404 and a dropped connection both became `null`, so a page could not say "this
 *     deployment does not publish that file";
 *   · a schema mismatch was rendered as if it were today's format in one place, and refused in
 *     another. (`lib/freshness.ts` refused — and said so in its own header — while
 *     `pages/LastRunPage.tsx` accepted whatever parsed.)
 *
 * These tests pin the decisions, not the plumbing.
 *
 * Node environment, not jsdom: this module is written against the platform's `Response` and
 * `navigator.onLine`, which is what a browser and a Workers runtime both have. Node 22 ships
 * `Response` globally, so the suite exercises the real object instead of a `{ok, status, json}`
 * stub — and a stub here would test the stub, not the reader.
 */
import {
  ARTIFACT_TIMEOUT_MS,
  describeArtifactFailure,
  readArtifact,
  readArtifacts,
} from '../artifacts';

const jsonResponse = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

/** A fetcher that records what it was asked for. */
function recordingFetcher(response: Response | (() => Promise<Response>)) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return typeof response === 'function' ? response() : response.clone();
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe('readArtifact — a successful read', () => {
  it('resolves the parsed body, the read time, and whether it came from the offline cache', async () => {
    const { fetcher } = recordingFetcher(jsonResponse({ ok: 1 }, { headers: { 'X-HazardNet-Stale': '1' } }));
    const result = await readArtifact<{ ok: number }>('/data/x.json', { fetcher });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ ok: 1 });
    expect(result.stale).toBe(true);
    expect(Number.isNaN(Date.parse(result.fetchedAt))).toBe(false);
  });

  it('busts the cache by default, and can be told not to', async () => {
    const first = recordingFetcher(jsonResponse({}));
    await readArtifact('/data/x.json', { fetcher: first.fetcher });
    expect(first.calls[0].url).toMatch(/^\/data\/x\.json\?fresh=\d+$/);

    const second = recordingFetcher(jsonResponse({}));
    await readArtifact('/data/x.json', { fetcher: second.fetcher, cacheBust: false });
    expect(second.calls[0].url).toBe('/data/x.json');
  });

  it('appends to an existing query string rather than replacing it', async () => {
    const { fetcher, calls } = recordingFetcher(jsonResponse({}));
    await readArtifact('/api/v1/kaggle?horizon=7_days', { fetcher });
    expect(calls[0].url).toMatch(/^\/api\/v1\/kaggle\?horizon=7_days&fresh=\d+$/);
  });
});

describe('readArtifact — the failure taxonomy', () => {
  it('calls a 404 "missing": the deployment does not publish that file', async () => {
    const { fetcher } = recordingFetcher(new Response('', { status: 404 }));
    const result = await readArtifact('/reports/2026-01-01.md', { fetcher });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('missing');
    expect(result.status).toBe(404);
  });

  it('calls any other non-2xx "unavailable", with the status attached', async () => {
    const { fetcher } = recordingFetcher(new Response('', { status: 503 }));
    const result = await readArtifact('/data/x.json', { fetcher });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unavailable');
    expect(result.status).toBe(503);
  });

  it('separates "not JSON" from "JSON of the wrong shape"', async () => {
    const html = recordingFetcher(new Response('<html></html>', { status: 200 }));
    const malformed = await readArtifact('/data/x.json', { fetcher: html.fetcher });
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.reason).toBe('malformed');

    const wrong = recordingFetcher(jsonResponse({ schema: 'something-else' }));
    const invalid = await readArtifact('/data/x.json', {
      fetcher: wrong.fetcher,
      validate: () => null,
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.reason).toBe('invalid');
  });

  it('never resolves a half-parsed value: a rejected payload is a failure, not partial data', async () => {
    const { fetcher } = recordingFetcher(jsonResponse({ schema: 'v2', rows: [1, 2] }));
    const result = await readArtifact('/data/x.json', {
      fetcher,
      validate: (value) => ((value as { schema?: string }).schema === 'v1' ? (value as never) : null),
    });
    expect(result.ok).toBe(false);
    expect('data' in result).toBe(false);
  });

  it('reports a thrown network error as "unavailable"', async () => {
    const fetcher = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const result = await readArtifact('/data/x.json', { fetcher });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unavailable');
    expect(result.status).toBeNull();
  });

  it('applies its own deadline', async () => {
    const fetcher = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      })) as unknown as typeof fetch;

    const result = await readArtifact('/data/x.json', { fetcher, timeoutMs: 5 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('timeout');
  });

  it('honours the caller\'s signal as well as its own deadline', async () => {
    const controller = new AbortController();
    const fetcher = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
        controller.abort();
      })) as unknown as typeof fetch;

    const result = await readArtifact('/data/x.json', { fetcher, signal: controller.signal });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('timeout');
  });

  it('does not even open a request when the browser says it is offline', async () => {
    const { fetcher, calls } = recordingFetcher(jsonResponse({}));
    // Node 22 exposes `navigator` but not `onLine`; the browser does. Define it for this test
    // and put it back, so the offline branch is exercised rather than assumed.
    const target = globalThis.navigator ?? (globalThis as { navigator?: object }).navigator;
    const descriptor = Object.getOwnPropertyDescriptor(target ?? {}, 'onLine');
    Object.defineProperty(target as object, 'onLine', { configurable: true, value: false });
    try {
      const result = await readArtifact('/data/x.json', { fetcher });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('offline');
      expect(calls).toHaveLength(0);
    } finally {
      if (descriptor) Object.defineProperty(target as object, 'onLine', descriptor);
      else Object.defineProperty(target as object, 'onLine', { configurable: true, value: true });
    }
  });
});

describe('readArtifacts — several files, reported separately', () => {
  it('keeps the successful file when its sibling fails', async () => {
    const results = await readArtifacts(
      {
        freshness: { url: '/data/freshness.json' },
        scorecard: { url: '/data/model-performance.json' },
      },
      {
        fetcher: (async (url: string) =>
          url.startsWith('/data/freshness')
            ? jsonResponse({ built_at: '2026-11-09T00:00:00Z' })
            : new Response('', { status: 404 })) as unknown as typeof fetch,
      }
    );

    expect(results.freshness.ok).toBe(true);
    expect(results.scorecard.ok).toBe(false);
    if (!results.scorecard.ok) expect(results.scorecard.reason).toBe('missing');
  });

  it('applies each entry\'s own validator', async () => {
    const results = await readArtifacts(
      { a: { url: '/a', validate: () => 'parsed-a' }, b: { url: '/b' } },
      { fetcher: (async () => jsonResponse({ raw: true })) as unknown as typeof fetch }
    );
    expect(results.a).toMatchObject({ ok: true, data: 'parsed-a' });
    expect(results.b).toMatchObject({ ok: true, data: { raw: true } });
  });
});

describe('the sentences a page prints', () => {
  it('never mentions a path, a status or a stack', () => {
    for (const reason of ['missing', 'offline', 'timeout', 'malformed', 'invalid', 'unavailable'] as const) {
      const sentence = describeArtifactFailure({ ok: false, reason, status: 500, error: '/data/x.json HTTP 500', fetchedAt: '' });
      expect(sentence).not.toContain('/data/');
      expect(sentence).not.toContain('500');
      expect(sentence.length).toBeGreaterThan(20);
    }
  });

  it('says a missing file is missing, not that the network failed', () => {
    const missing = describeArtifactFailure({ ok: false, reason: 'missing', status: 404, error: '', fetchedAt: '' });
    const unavailable = describeArtifactFailure({ ok: false, reason: 'unavailable', status: 500, error: '', fetchedAt: '' });
    expect(missing).not.toBe(unavailable);
    expect(missing).toMatch(/does not publish/);
  });
});

describe('the default deadline', () => {
  it('is the value two of the four old readers already agreed on', () => {
    expect(ARTIFACT_TIMEOUT_MS).toBe(6000);
  });
});
