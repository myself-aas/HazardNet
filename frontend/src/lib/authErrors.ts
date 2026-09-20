/**
 * Centralized Firebase Auth error handling for email/password flows.
 *
 * Firebase Auth errors have codes like `auth/email-already-in-use`,
 * `auth/invalid-credential`, etc. We map them to user-friendly messages
 * that do not leak whether an email exists (except where UX requires it).
 */

export interface AuthErrorInfo {
  code: string;
  message: string;
  userMessage: string;
}

export function parseAuthError(err: unknown): AuthErrorInfo {
  const code = (err as { code?: string } | null)?.code ?? '';
  const rawMessage = err instanceof Error ? err.message : String(err ?? '');
  const lower = `${code} ${rawMessage}`.toLowerCase();

  let userMessage = rawMessage || 'Authentication failed. Please try again.';

  if (lower.includes('email-already-in-use') || lower.includes('email already in use')) {
    userMessage = 'An account already exists with this email. Sign in instead — or reset your password if you forgot it.';
  } else if (lower.includes('invalid-credential') || lower.includes('invalid login credentials') || lower.includes('user-not-found') || lower.includes('wrong-password')) {
    userMessage = 'That email and password combination doesn’t match. Check for typos or reset your password.';
  } else if (lower.includes('weak-password') || lower.includes('password should be at least')) {
    userMessage = 'That password is too weak — use at least 6 characters (8+ with upper, lower, number and symbol recommended).';
  } else if (lower.includes('invalid-email')) {
    userMessage = 'Enter a valid email address.';
  } else if (lower.includes('too many requests') || lower.includes('rate limit') || lower.includes('too-many-requests')) {
    userMessage = 'Too many attempts — wait a minute and try again, or reset your password.';
  } else if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('network-request-failed')) {
    userMessage = 'Network problem while contacting auth server. Check your connection and retry.';
  } else if (lower.includes('operation-not-allowed')) {
    userMessage = 'Email/password sign-in is not enabled on this project yet. Enable it in Firebase console.';
  } else if (lower.includes('requires-recent-login')) {
    userMessage = 'For security, please sign in again before changing your email or password.';
  } else if (lower.includes('popup-closed-by-user')) {
    userMessage = 'Sign-in window was closed before finishing. Try again.';
  } else if (lower.includes('popup-blocked')) {
    userMessage = 'Popup blocked by browser. Allow popups for this site, or we will try redirect sign-in.';
  }

  return { code, message: rawMessage, userMessage };
}

/**
 * Safe wrapper for async auth calls that logs and re-throws with parsed info.
 */
export async function withAuthErrorHandling<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const info = parseAuthError(err);
    console.warn(`Auth error [${info.code}]:`, info.message);
    // Preserve original error code for callers that check it
    throw err;
  }
}
