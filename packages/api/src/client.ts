/**
 * Cross-platform API client for HazardNet.
 *
 * Uses the WHATWG `fetch` API, available natively in:
 *   - Modern browsers (web)
 *   - React Native 0.74+ / Hermes (Expo SDK 51+)
 *   - Node 18+
 *
 * Features:
 *   - Base URL + JSON serialization
 *   - Mobile-specific headers (X-App-Version, X-Platform, X-Device-ID)
 *   - Timeout via AbortController
 *   - Exponential backoff with jitter (optional, on by default for GET)
 *   - Request deduplication key (not implemented here as a built-in deduper;
 *     the caller can use `requestDedupeKey` to build its own in-flight map)
 *   - Field selection via `?fields=` for low-bandwidth responses
 *   - Cursor-pagination helpers
 *   - Auth-token injection via optional `getToken` hook (refresh logic is the
 *     caller's responsibility — the client calls `getToken` each request, and
 *     calls it again once on a 401 to allow silent refresh).
 *   - Response validation against Zod schemas
 *   - Typed errors (see ./errors)
 */

import { z } from 'zod';
import {
  ClientError,
  ServerError,
  TimeoutError,
  OfflineError,
  ValidationError,
  AuthError,
  AbortedError,
} from './errors';
import { DEFAULT_RETRY_POLICY, retryDelayMs, shouldRetry, wait, type RetryPolicy } from './retry';

/** JSON primitive types for query-string serialization. */
export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

/** Platform identifier sent as X-Platform header. */
export type ClientPlatform = 'web' | 'ios' | 'android';

/** Per-request options. */
export interface RequestOptions<T extends z.ZodTypeAny = z.ZodUnknown> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Request body; serialized as JSON when object. */
  body?: unknown;
  /** Query parameters; serialized with URLSearchParams. Arrays repeat keys. */
  params?: QueryParams;
  /** Optional field selection for compact responses (mobile-backend.md). */
  fields?: string[];
  /** Zod schema to validate the response. If omitted, unknown is returned. */
  schema?: T;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
  /** Per-request timeout override (ms). Default 15000. */
  timeoutMs?: number;
  /** Retry policy override. Pass `{ maxRetries: 0 }` to disable. Default GET retry. */
  retry?: Partial<RetryPolicy>;
  /** If true, treat non-2xx responses as errors (default true). */
  throwOnError?: boolean;
  /** Explicit extra headers. Merged over defaults. */
  headers?: Record<string, string>;
}

/** Client configuration (set once at app init). */
export interface ClientConfig {
  /** Base URL for API requests, e.g. 'https://hazardnet.live/api/v1'. */
  baseUrl: string;
  /** Platform identifier sent in X-Platform header. */
  platform: ClientPlatform;
  /** App version string (e.g. '2.2.0' / CFBundleShortVersionString / versionName). */
  appVersion: string;
  /** Installation/device UUID. Generated on first launch, stored securely. */
  deviceId?: string | (() => string | Promise<string | undefined>);
  /** Auth token provider. If provided, called each request to add Authorization. */
  getAuthToken?: () => Promise<string | null>;
  /** Called once on 401 to allow a silent token refresh before failing. */
  refreshAuthToken?: () => Promise<boolean>;
  /**
   * Optional online-state probe. When this returns false, requests fail fast
   * with OfflineError instead of waiting on a socket timeout.
   */
  isOnline?: () => boolean;
  /** Default request timeout in ms. */
  defaultTimeoutMs?: number;
  /** Fetch implementation override (for testing or environments without global fetch). */
  fetchImpl?: typeof fetch;
}

export interface ApiClient {
  /** Perform a JSON request and return the validated response. */
  request<T extends z.ZodTypeAny = z.ZodUnknown>(
    path: string,
    opts?: RequestOptions<T>,
  ): Promise<z.infer<T>>;
  /** GET shorthand. */
  get<T extends z.ZodTypeAny = z.ZodUnknown>(path: string, opts?: Omit<RequestOptions<T>, 'method'>): Promise<z.infer<T>>;
  /** POST shorthand. */
  post<T extends z.ZodTypeAny = z.ZodUnknown>(path: string, body?: unknown, opts?: Omit<RequestOptions<T>, 'method' | 'body'>): Promise<z.infer<T>>;
}

export function createClient(config: ClientConfig): ApiClient {
  const fetchImpl: typeof fetch = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  if (!fetchImpl) {
    throw new Error('@hazardnet/api: global fetch is not available; pass fetchImpl in config.');
  }

  const defaultTimeout = config.defaultTimeoutMs ?? 15_000;

  async function buildHeaders(opts: RequestOptions<z.ZodTypeAny>): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Platform': config.platform,
      'X-App-Version': config.appVersion,
    };
    if (config.deviceId) {
      const id = typeof config.deviceId === 'function' ? await config.deviceId() : config.deviceId;
      if (id) headers['X-Device-ID'] = id;
    }
    const token = config.getAuthToken ? await config.getAuthToken() : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.headers) Object.assign(headers, opts.headers);
    return headers;
  }

  function buildUrl(path: string, opts: RequestOptions<z.ZodTypeAny>): string {
    let url = path.startsWith('http') ? path : `${config.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    const params = { ...(opts.params ?? {}) };
    if (opts.fields?.length) params.fields = opts.fields.join(',');
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === undefined) continue;
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item !== null && item !== undefined) usp.append(k, String(item));
        }
      } else {
        usp.append(k, String(v));
      }
    }
    const qs = usp.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    return url;
  }

  async function performRequest(path: string, opts: RequestOptions<z.ZodTypeAny>, attemptHasRefreshed = false): Promise<unknown> {
    if (config.isOnline && !config.isOnline()) {
      throw new OfflineError();
    }

    const timeoutMs = opts.timeoutMs ?? defaultTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
    if (opts.signal) {
      if (opts.signal.aborted) {
        clearTimeout(timeoutId);
        throw new AbortedError();
      }
      opts.signal.addEventListener('abort', () => controller.abort(opts.signal?.reason), { once: true });
    }

    const url = buildUrl(path, opts);
    const headers = await buildHeaders(opts);

    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body === undefined || opts.body === null
          ? undefined
          : opts.body instanceof FormData
            ? (opts.body as unknown as BodyInit)
            : JSON.stringify(opts.body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if ((err as Error).name === 'AbortError') {
        if ((controller.signal.reason as Error | undefined)?.name === 'TimeoutError') {
          throw new TimeoutError(timeoutMs);
        }
        throw new AbortedError();
      }
      if (err instanceof TypeError) {
        // fetch throws TypeError on network failure (DNS, offline, CORS).
        throw new OfflineError((err as Error).message);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    // Auth retry: on 401, if we haven't tried refreshing yet, attempt refresh once.
    if (res.status === 401 && config.refreshAuthToken && !attemptHasRefreshed) {
      const refreshed = await config.refreshAuthToken();
      if (refreshed) {
        return performRequest(path, opts, true);
      }
      throw new AuthError();
    }

    const throwOnError = opts.throwOnError ?? true;
    if (!res.ok && throwOnError) {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // ignore parse error, we'll throw with status
      }
      const bodyObj = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
      const message =
        (bodyObj && typeof bodyObj.message === 'string' ? bodyObj.message : null) ||
        `HTTP ${res.status}`;
      if (res.status >= 500) throw new ServerError(res.status, message, body);
      if (res.status === 401) throw new AuthError(res.status, message);
      throw new ClientError(res.status, message, body);
    }

    // 204 No Content
    if (res.status === 204) return null;

    const text = await res.text();
    if (!text) return null;
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ValidationError([{ path: ['(root)'], message: 'Response was not valid JSON' }]);
    }
    return json;
  }

  async function request<T extends z.ZodTypeAny = z.ZodUnknown>(
    path: string,
    opts: RequestOptions<T> = {},
  ): Promise<z.infer<T>> {
    const retryPolicy: RetryPolicy = {
      ...DEFAULT_RETRY_POLICY,
      ...(opts.retry ?? {}),
      retryableStatuses: opts.retry?.retryableStatuses
        ? new Set(opts.retry.retryableStatuses)
        : DEFAULT_RETRY_POLICY.retryableStatuses,
    };

    // Non-GET defaults to zero retries unless caller opts in.
    const effectivePolicy =
      (opts.method ?? 'GET') === 'GET' || opts.retry !== undefined
        ? retryPolicy
        : { ...retryPolicy, maxRetries: 0 };

    let attempt = 0;
    while (true) {
      try {
        const data = await performRequest(path, opts);
        if (opts.schema) {
          const parsed = await opts.schema.safeParseAsync(data);
          if (!parsed.success) {
            throw new ValidationError(parsed.error.issues.map((i) => ({ path: i.path, message: i.message })));
          }
          return parsed.data;
        }
        return data as z.infer<T>;
      } catch (err) {
        if (!shouldRetry(effectivePolicy, attempt, err)) {
          throw err;
        }
        const delay = retryDelayMs(effectivePolicy, attempt + 1);
        try {
          await wait(delay, opts.signal);
        } catch {
          throw new AbortedError();
        }
        attempt += 1;
      }
    }
  }

  return {
    request,
    get: <T extends z.ZodTypeAny = z.ZodUnknown>(path: string, opts?: Omit<RequestOptions<T>, 'method'>) =>
      request<T>(path, { ...opts, method: 'GET' }),
    post: <T extends z.ZodTypeAny = z.ZodUnknown>(path: string, body?: unknown, opts?: Omit<RequestOptions<T>, 'method' | 'body'>) =>
      request<T>(path, { ...opts, method: 'POST', body }),
  };
}

/**
 * Build a cursor-paginated URL parameter set.
 * `limit` is the page size; `after` is the opaque cursor returned by the server.
 */
export function cursorParams(limit: number, after?: string | null): QueryParams {
  return after ? { limit, after } : { limit };
}
