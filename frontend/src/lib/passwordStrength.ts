/**
 * Shared password strength scoring (0–4) with a live requirement checklist.
 * Used by the /set-password page (email verification → password setup) and
 * the dashboard account section.
 */

export interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'Upper & lowercase letters', test: (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  { label: 'At least one number', test: (pw) => /\d/.test(pw) },
  { label: 'At least one symbol', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  barClass: string;
  textClass: string;
}

const STRENGTH_LEVELS: PasswordStrength[] = [
  { score: 0, label: 'Too weak', barClass: 'bg-rose-500', textClass: 'text-rose-700' },
  { score: 1, label: 'Weak', barClass: 'bg-orange-500', textClass: 'text-orange-700' },
  { score: 2, label: 'Fair', barClass: 'bg-amber-500', textClass: 'text-amber-700' },
  { score: 3, label: 'Good', barClass: 'bg-lime-600', textClass: 'text-lime-700' },
  { score: 4, label: 'Strong', barClass: 'bg-emerald-600', textClass: 'text-emerald-700' },
];

/** Legacy 0–4 score kept for existing tests/importers. */
export function scorePassword(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(score, 4);
}

export function scorePasswordRequirements(pw: string): number {
  return PASSWORD_REQUIREMENTS.filter((requirement) => requirement.test(pw)).length;
}

export function passwordStrength(pw: string): PasswordStrength {
  return STRENGTH_LEVELS[Math.min(scorePassword(pw), 4)];
}
