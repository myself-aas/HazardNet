/**
 * Typed error hierarchy for the API client.
 *
 * Using distinct error subclasses lets the UI layer branch on failure cause
 * without parsing error messages:
 *
 *   } catch (e) {
 *     if (e instanceof OfflineError) { showOfflineState(); return; }
 *     if (e instanceof TimeoutError) { showRetry(); return; }
 *     if (e instanceof ServerError && e.status === 401) { refreshAuth(); return; }
 *     if (e instanceof ValidationError) { logBug(e.issues); showAppError(); return; }
 *     showGenericError();
 *   }
 */

/**
 * Base error with a machine-readable code.
 */
export class ApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

/** Network is offline, or the request never reached the server. */
export class OfflineError extends ApiError {
  constructor(message = 'Offline') {
    super('OFFLINE', message);
    this.name = 'OfflineError';
  }
}

/** Request did not complete within the configured timeout. */
export class TimeoutError extends ApiError {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super('TIMEOUT', `Request timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** 4xx response from the server. */
export class ClientError extends ApiError {
  readonly status: number;
  readonly responseBody: unknown;
  constructor(status: number, message: string, body: unknown = null) {
    super(`HTTP_${status}`, message);
    this.name = 'ClientError';
    this.status = status;
    this.responseBody = body;
  }
}

/** 5xx response from the server. */
export class ServerError extends ApiError {
  readonly status: number;
  readonly responseBody: unknown;
  constructor(status: number, message: string, body: unknown = null) {
    super(`HTTP_${status}`, message);
    this.name = 'ServerError';
    this.status = status;
    this.responseBody = body;
  }
}

/** The server returned a success response that did not match our Zod schema. */
export class ValidationError extends ApiError {
  readonly issues: ReadonlyArray<{ path: string; message: string }>;
  constructor(issues: ReadonlyArray<{ path: (string | number)[]; message: string }>) {
    super(
      'VALIDATION',
      `Response failed schema validation: ${issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
    this.name = 'ValidationError';
    this.issues = issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
  }
}

/** A request was aborted because a newer identical request superseded it. */
export class AbortedError extends ApiError {
  constructor() {
    super('ABORTED', 'Request aborted');
    this.name = 'AbortedError';
  }
}

/** Auth token is invalid / expired AND refresh failed. */
export class AuthError extends ClientError {
  constructor(status = 401, message = 'Authentication required') {
    super(status, message);
    this.name = 'AuthError';
  }
}
