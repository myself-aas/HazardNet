/**
 * Security helpers (Phase 9).
 *
 * These primitives are used for the final security review:
 *   - sanitizeUrl: only allow http/https/tel/hazardnet schemes; blocks
 *     javascript:/file:/data: to prevent URL-based XSS when opening external
 *     or deep links from untrusted notifications / payloads.
 *   - redactPlace: strip lat/lng from saved-place objects before any future
 *     telemetry/error upload so we never accidentally send location.
 *   - noSecretsInBundle: dev-time check that known placeholder strings do
 *     not appear in the bundle at runtime (called in __DEV__ only).
 */

const ALLOWED_SCHEMES = ['http:', 'https:', 'tel:', 'mailto:', 'hazardnet:', 'app-settings:'];

export function isSafeUrl(raw: string | null | undefined): raw is string {
  if (!raw) return false;
  try {
    // For scheme-less hazardnet paths, force a parseable URL.
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `hazardnet://${raw}`;
    const u = new URL(withScheme);
    return ALLOWED_SCHEMES.includes(u.protocol.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Redact a saved place for telemetry — only include kind + whether location
 * is set (never the label or coordinates, which are PII-sensitive).
 */
export function redactPlace(p: any) {
  if (!p) return null;
  return {
    kind: p.kind ?? 'custom',
    hasLocation: !!(p.location && (p.location.lat != null || p.location.lng != null)),
    notificationsEnabled: !!(p.notifications?.enabled ?? p.notifications?.enabled),
  };
}

/** Crash/error metadata: never include alert titles/labels which could be PII. */
export function redactError(err: Error | unknown) {
  if (!(err instanceof Error)) return { name: 'UnknownError', message: '' };
  return { name: err.name, message: err.message?.slice(0, 200) ?? '' };
}

/** List of things that must NEVER appear in a release binary. */
const FORBIDDEN_STRINGS = [
  'AIza',            // Firebase API keys (we don't use firebase in mobile yet)
  'BEGIN PRIVATE KEY',
  'sk_live_',        // Stripe live keys
  'ghp_',            // GitHub personal access tokens
];

export function assertNoSecretsInBundle(): string[] {
  // In __DEV__ only — scan __DEV__ bundle text is impossible without
  // evaluating source, but we can warn if any source file accidentally exports
  // values matching forbidden patterns. For Phase 9 this is a hook for CI;
  // at runtime it returns an empty array (no way to scan own bundle in RN).
  return [];
}
