/**
 * The deployment's own artifacts, read the same way every time.
 *
 * The site publishes its state as files: `/data/forecasts-latest.json`,
 * `/data/alerts-latest.json`, `/data/daily-advisories-v1.json`, `/data/freshness.json`,
 * `/data/model-performance.json`. Four pages and two hooks each fetched them by hand, and
 * each got a slightly different version of the same six decisions:
 *
 *   `frontend/src/lib/alerts.ts`      6 s timeout, `?fresh=` cache-buster, `Accept` header,
 *                                     `X-HazardNet-Stale`, abort propagation, `null` on 5xx
 *   `frontend/src/lib/freshness.ts`   6 s timeout, `?fresh=`, `Accept`, no stale marker
 *   `frontend/src/pages/FrontDoor.tsx` `cache: 'no-cache'`, **no timeout**, two artifacts
 *                                     in one `useEffect`, its own `failed` flag
 *   `frontend/src/pages/LastRunPage.tsx` `cache: 'no-cache'`, no timeout, no status check
 *   `frontend/src/lib/reports.ts`     `cache: 'no-cache'`, no timeout, returns `null` on
 *                                     *any* failure including a 404
 *
 * The consequence was measurable. A visitor on 2G could wait on `LastRunPage`'s freshness
 * read for as long as the browser's own connect timeout, because that page had no deadline;
 * `reports` could not tell "this report does not exist" (a 404, which is an answer) from
 * "the network dropped" (which is a failure); and the front door and the status page could
 * disagree about whether the same file had loaded.
 *
 * This module owns those decisions once. Callers state *which artifact* and *what to do with
 * the parsed value*; they do not restate transport policy.
 *
 * What a caller must know (the interface):
 *
 *   · `readArtifact(path, {signal, timeoutMs, validate})` resolves — it never throws. The
 *     result is a tagged union: `{ok: true, data, fetchedAt}` or
 *     `{ok: false, reason, status, error, fetchedAt}`. `reason` is one of
 *     `'missing' | 'unavailable' | 'timeout' | 'malformed' | 'invalid' | 'offline'`, which is
 *     the vocabulary the pages already render ("unavailable", "unreadable", "failed").
 *   · A **404 is `'missing'`**, not `'unavailable'`: the deployment does not ship that file,
 *     which is a fact a page may print, and the difference between it and a network failure
 *     is exactly the difference between "we have no report for that day" and "we could not
 *     reach the server".
 *   · A **non-2xx is `'unavailable'`** with the status attached; a **parse or validation
 *     failure is `'malformed'`/`'invalid'`** and never yields a half-parsed object. This is
 *     the honesty rule the freshness and alerts modules already apply one at a time.
 *   · **Cache busting is default-on** (`?fresh=`), because every one of these artifacts
 *     changes on deploy and a stale CDN copy is the failure mode the whole freshness
 *     apparatus exists to surface. `cacheBust: false` is for a caller that wants the cached
 *     copy on purpose.
 *   · The `signal` a caller passes is honoured *and* the internal deadline still applies:
 *     whichever fires first aborts the request.
 *
 * Dependency category: in-process (a `fetch` call). Tests pass `fetcher`; no network needed.
 */

/** The reasons a read can fail, in the vocabulary the pages already render. */
export type ArtifactFailure =
  /** 404 — the deployment does not ship this file. */
  | 'missing'
  /** Any other non-2xx, or a thrown network error. */
  | 'unavailable'
  /** The internal deadline fired (or the caller's signal did). */
  | 'timeout'
  /** The body was not JSON. */
  | 'malformed'
  /** JSON, but not the shape the caller's `validate` accepted. */
  | 'invalid'
  /** `navigator.onLine === false`. */
  | 'offline';

export interface ArtifactLoaded<T> {
  ok: true;
  data: T;
  /** When this read completed (ISO). Never a timestamp the artifact itself stated. */
  fetchedAt: string;
  /** True when the service worker answered from its offline cache. */
  stale: boolean;
}

export interface ArtifactFailed {
  ok: false;
  reason: ArtifactFailure;
  /** HTTP status when there was one; `null` for a network failure or a timeout. */
  status: number | null;
  /** The message to log. Never rendered verbatim: a page prints its own sentence. */
  error: string;
  fetchedAt: string;
}

export type ArtifactResult<T> = ArtifactLoaded<T> | ArtifactFailed;

export interface ReadArtifactOptions<T> {
  /** The body was JSON; this decides whether it is the artifact the caller expects. */
  validate?: (value: unknown) => T | null;
  signal?: AbortSignal;
  /** Deadline for this read. Defaults to 6 s — the value two of the four old copies used. */
  timeoutMs?: number;
  /** Pass `false` to read the cached copy on purpose. Defaults to `true`. */
  cacheBust?: boolean;
  /** Injected for tests and for a caller with its own fetch (a mobile shim). */
  fetcher?: typeof fetch;
}

/** The deadline two of the four hand-rolled readers already agreed on. */
export const ARTIFACT_TIMEOUT_MS = 6000;

const nowIso = () => new Date().toISOString();

/**
 * Read one deployed artifact.
 *
 * Never throws: every failure becomes a tagged result, because every caller of this module is
 * a page that has to render *something* honest when the file is missing.
 */
export async function readArtifact<T = unknown>(
  url: string,
  options: ReadArtifactOptions<T> = {}
): Promise<ArtifactResult<T>> {
  const {
    validate,
    signal,
    timeoutMs = ARTIFACT_TIMEOUT_MS,
    cacheBust = true,
    fetcher = typeof fetch === 'function' ? fetch : undefined,
  } = options;

  const fetchedAt = nowIso();
  const fail = (reason: ArtifactFailure, error: string, status: number | null = null): ArtifactFailed => ({
    ok: false,
    reason,
    status,
    error,
    fetchedAt,
  });

  if (typeof fetcher !== 'function') return fail('unavailable', 'no fetch implementation available');

  // A metered visitor should not watch a request time out for six seconds before the cached
  // copy renders; `useAlertsData` already made this call for the alert list.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return fail('offline', 'the browser reports it is offline');
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    const target = cacheBust
      ? `${url}${url.includes('?') ? '&' : '?'}fresh=${Date.now()}`
      : url;
    const response = await fetcher(target, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 404) return fail('missing', `HTTP 404 at ${url}`, 404);
      return fail('unavailable', `HTTP ${response.status} at ${url}`, response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return fail('malformed', `${url} is not JSON`, response.status);
    }

    if (validate) {
      const parsed = validate(payload);
      if (parsed === null || parsed === undefined) {
        // A schema mismatch is not a load: rendering a future format as today's is the failure
        // mode `lib/freshness.ts` and `lib/alerts.ts` each already refuse on their own.
        return fail('invalid', `${url} is not the expected shape`, response.status);
      }
      return {
        ok: true,
        data: parsed,
        fetchedAt,
        stale: response.headers?.get?.('X-HazardNet-Stale') === '1',
      };
    }

    return {
      ok: true,
      data: payload as T,
      fetchedAt,
      stale: response.headers?.get?.('X-HazardNet-Stale') === '1',
    };
  } catch (error) {
    const message = (error as Error)?.message || 'fetch failed';
    if (timedOut) return fail('timeout', `${url} exceeded ${timeoutMs} ms`);
    if ((error as Error)?.name === 'AbortError') return fail('timeout', `${url} was aborted`);
    return fail('unavailable', message);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/**
 * Read several artifacts in one go, and report them separately.
 *
 * The front door needs two files and must be able to say *which* one failed; `Promise.all`
 * over two `readArtifact` calls loses that, and `Promise.all` over two throwing readers loses
 * the successful one as well.
 */
export async function readArtifacts<R extends Record<string, unknown>>(
  requests: { [K in keyof R]: { url: string; validate?: (value: unknown) => R[K] } },
  options: Omit<ReadArtifactOptions<unknown>, 'validate'> = {}
): Promise<{ [K in keyof R]: ArtifactResult<R[K]> }> {
  type Keys = keyof R & string;
  const keys = Object.keys(requests) as Keys[];
  const results = await Promise.all(
    keys.map((key) => readArtifact<R[Keys]>(requests[key].url, { ...options, validate: requests[key].validate }))
  );
  return Object.fromEntries(keys.map((key, index) => [key, results[index]])) as {
    [K in keyof R]: ArtifactResult<R[K]>;
  };
}

/**
 * The sentence a page prints for a failure.
 *
 * Kept here so four pages cannot describe the same failure three different ways, and so the
 * wording stays in one place when the vocabulary changes. It says what the reader can know —
 * never a stack trace, never an internal path.
 */
export function describeArtifactFailure(result: ArtifactFailed): string {
  switch (result.reason) {
    case 'missing':
      return 'This deployment does not publish that file.';
    case 'offline':
      return 'You are offline; this value cannot be read right now.';
    case 'timeout':
      return 'The request took too long. The value is not shown rather than shown stale.';
    case 'malformed':
      return 'The file is not readable JSON, so no value is shown.';
    case 'invalid':
      return 'The file is in a format this page does not recognise, so no value is shown.';
    default:
      return 'The file could not be read, so no value is shown.';
  }
}
