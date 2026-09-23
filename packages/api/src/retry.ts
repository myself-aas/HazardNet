/**
 * Exponential backoff with jitter.
 *
 * Mobile-backend.md requires: exponential backoff, jitter, immediate retry on
 * network-return, deduplication of in-flight requests, and a retry cap. This
 * module provides the delay calculator and a `shouldRetry` predicate; the
 * actual retry loop lives in client.ts so it can work with abort signals.
 */

export interface RetryPolicy {
  /** Maximum number of retries (not counting the initial attempt). */
  maxRetries: number;
  /** Base delay in ms before the first retry. */
  baseDelayMs: number;
  /** Maximum delay between retries (caps exponential growth). */
  maxDelayMs: number;
  /** Multiplier per attempt. 2 = standard exponential backoff. */
  factor: number;
  /** If true, add full jitter (random(0, delay)) to avoid thundering herds. */
  jitter: boolean;
  /** Response status codes we retry on. */
  retryableStatuses: ReadonlySet<number>;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60 * 60 * 1000, // 1 hour hard cap
  factor: 2,
  jitter: true,
  // Retry on: 408 (timeout), 409 (conflict — rare), 425 (too early), 429 (rate-limited), 5xx
  retryableStatuses: new Set([408, 409, 425, 429, 500, 502, 503, 504]),
};

/**
 * Compute the delay (ms) before the nth retry (1-indexed: attempt 1 is first retry).
 *
 * Uses "full jitter" when enabled: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 * Without jitter, returns the deterministic capped exponential delay.
 */
export function retryDelayMs(policy: RetryPolicy, attempt: number): number {
  if (attempt <= 0) return 0;
  const exponential = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * policy.factor ** (attempt - 1),
  );
  if (!policy.jitter) return exponential;
  // Full jitter: uniform random in [0, exponential).
  return Math.floor(Math.random() * exponential);
}

/**
 * Decide whether a failure should be retried given the current attempt count
 * and the error. `attempt` is zero-indexed (0 = initial attempt).
 */
export function shouldRetry(
  policy: RetryPolicy,
  attempt: number,
  error: unknown,
): boolean {
  if (attempt >= policy.maxRetries) return false;
  if (error instanceof TypeError || (error instanceof Error && error.message === 'Network request failed')) {
    // fetch() throws TypeError on network failure in many environments.
    return true;
  }
  // Let callers pass a DOMException-like abort error name.
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'AbortError'
  ) {
    return false;
  }
  // We don't have access to our own error classes here without a circular import,
  // so check by name/shape.
  if (typeof error === 'object' && error !== null) {
    const e = error as { code?: string; status?: number; name?: string };
    if (e.name === 'OfflineError' || e.code === 'OFFLINE') return true;
    if (e.name === 'TimeoutError' || e.code === 'TIMEOUT') return true;
    if (e.name === 'AbortedError' || e.code === 'ABORTED') return false;
    if (e.name === 'AuthError') return false;
    if (typeof e.status === 'number') {
      return policy.retryableStatuses.has(e.status);
    }
  }
  return false;
}

/**
 * Wait for the specified duration, with an optional AbortSignal that rejects.
 */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort);
  });
}
