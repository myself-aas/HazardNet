/**
 * Username pipeline for HazardNet profile URLs (/u/<username>).
 *
 * Rules (mirrored server-side in scripts/db/003_user_dashboard.sql):
 *   · 3–20 characters
 *   · lowercase letters a–z, digits 0–9 and underscores only
 *   · must start with a letter
 *   · no consecutive underscores, no trailing underscore
 *   · cannot be a reserved word (routes / system names)
 *
 * `sanitizeUsernameInput` powers the as-you-type field: it lowercases and
 * strips anything invalid so the user physically cannot type a bad character.
 * `suggestUsernames` powers the suggestion chips shown while the field is
 * invalid or already taken.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** Route/system names that may never be claimed as a username. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin', 'administrator', 'moderator', 'superadmin', 'root',
  'hazardnet', 'hazard', 'support', 'help', 'security', 'api',
  'www', 'mail', 'email', 'official', 'team', 'staff', 'system',
  'login', 'signup', 'signin', 'register', 'auth',
  'dashboard', 'settings', 'account', 'profile', 'u', 'user',
  'blog', 'blogs', 'about', 'contact', 'terms', 'privacy',
  'docs', 'documentation', 'analytics', 'advisories', 'forecast', 'forecasts',
  'upload', 'download', 'home', 'null', 'undefined', 'billing', 'webhook',
  'connectors', 'password', 'set-password', 'update-password',
]);

export type UsernameIssue =
  | 'too_short'
  | 'too_long'
  | 'invalid_chars'
  | 'must_start_letter'
  | 'double_underscore'
  | 'trailing_underscore'
  | 'reserved';

export interface UsernameValidation {
  /** Fully valid (format only — availability is checked separately). */
  valid: boolean;
  /** Ordered format problems, empty when valid. */
  issues: UsernameIssue[];
  /** Human-readable copy for the first issue (or null). */
  message: string | null;
}

export const USERNAME_RULES = [
  '3–20 characters',
  'lowercase letters (a–z)',
  'numbers (0–9)',
  'underscores ( _ )',
  'must start with a letter',
] as const;

/** Lowercase + strip anything that is not a–z, 0–9 or underscore. */
export function sanitizeUsernameInput(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

/** Validate a username against the format rules. */
export function validateUsername(raw: string): UsernameValidation {
  const value = sanitizeUsernameInput(raw);
  const issues: UsernameIssue[] = [];

  if (value.length < USERNAME_MIN) issues.push('too_short');
  if (value.length > USERNAME_MAX) issues.push('too_long');
  if (value.length > 0 && !/^[a-z]/.test(value)) issues.push('must_start_letter');
  if (value.includes('__')) issues.push('double_underscore');
  if (/_$/.test(value)) issues.push('trailing_underscore');
  if (value.length >= USERNAME_MIN && /^[a-z0-9_]+$/.test(value) && RESERVED_USERNAMES.has(value)) {
    issues.push('reserved');
  }

  const messages: Record<UsernameIssue, string> = {
    too_short: `Usernames need at least ${USERNAME_MIN} characters.`,
    too_long: `Keep it under ${USERNAME_MAX} characters.`,
    invalid_chars: 'Only lowercase letters, numbers and underscores are allowed.',
    must_start_letter: 'Usernames must start with a letter.',
    double_underscore: 'Avoid consecutive underscores.',
    trailing_underscore: 'Usernames can’t end with an underscore.',
    reserved: 'That username is reserved — try another.',
  };

  return {
    valid: issues.length === 0,
    issues,
    message: issues.length > 0 ? messages[issues[0]] : null,
  };
}

/** Turn "Ashif Ahmed" or "ashif.92@mail.co" into a clean username seed. */
export function seedFromIdentity(name?: string | null, email?: string | null): string {
  const source = (name && name.trim()) || (email ? email.split('@')[0] : '') || '';
  let seed = source
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 16);
  if (seed.length < 3 || !/^[a-z]/.test(seed)) seed = `farmer_${seed.replace(/[^a-z0-9]/g, '')}`.slice(0, 12);
  return seed;
}

export interface UsernameSuggestionContext {
  /** Current (possibly invalid/taken) username input. */
  username: string;
  /** Full display name, e.g. "Ashif Ahmed". */
  fullName?: string | null;
  /** Email — the local part is a good seed. */
  email?: string | null;
}

/**
 * Generate 3–4 available-looking username ideas, favouring the classic
 * lowercase/underscore/number patterns users expect. Deduplicated and
 * format-valid by construction.
 */
export function suggestUsernames({ username, fullName, email }: UsernameSuggestionContext): string[] {
  const raw = sanitizeUsernameInput(username);
  const pool: string[] = [];

  const push = (value: string) => {
    const candidate = value.slice(0, USERNAME_MAX).replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
    if (!candidate) return;
    if (candidate.length < USERNAME_MIN) return;
    if (RESERVED_USERNAMES.has(candidate)) return;
    if (!pool.includes(candidate)) pool.push(candidate);
  };

  const nameSeed = seedFromIdentity(fullName, null);
  const emailSeed = seedFromIdentity(null, email);
  const base = raw.length >= USERNAME_MIN ? raw : nameSeed !== 'farmer' ? nameSeed : emailSeed;

  // 1 · The input itself, cleaned up.
  push(base);
  // 2 · Full name with an underscore: ashif_ahmed
  if (nameSeed && nameSeed !== base) push(nameSeed);
  if (nameSeed.includes('_')) push(nameSeed.replace('_', ''));
  // 3 · Email local part.
  if (emailSeed && emailSeed !== base && emailSeed !== nameSeed) push(emailSeed);
  // 4 · Numbered variants of the strongest seed (the `_42` pattern).
  const strongest = (raw.length >= USERNAME_MIN ? raw : nameSeed) || emailSeed;
  const shortStrongest = strongest.slice(0, USERNAME_MAX - 4);
  push(`${shortStrongest}_1`);
  push(`${shortStrongest}_42`);
  push(`${shortStrongest}_${new Date().getFullYear()}`);

  return pool.slice(0, 4);
}

/** Build the canonical public profile path for a username. */
export function profilePath(username: string): string {
  return `/u/${encodeURIComponent(sanitizeUsernameInput(username))}`;
}
