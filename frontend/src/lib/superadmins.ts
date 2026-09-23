/**
 * Primary superadmin allowlist for HazardNet content administration.
 *
 * Only these accounts may create, edit and delete blog articles. The check
 * is enforced client-side for the UI and MUST be enforced at the data layer
 * with the matching RLS policies (see docs/blog-admin-setup.md) — the blog
 * table's row-level security restricts writes to exactly these emails.
 *
 * Emails are matched case-insensitively after trimming.
 */

const PRIMARY_SUPERADMIN_EMAILS = [
  'shuvo.1807016@bau.edu.bd',
  'shuvoasifahmed@gmail.com',
  'asifahmedshuvo.aas@gmail.com',
] as const;

const NORMALIZED = new Set(PRIMARY_SUPERADMIN_EMAILS.map((email) => email.toLowerCase()));

/** The immutable primary superadmin emails (display/use only). */
export const primarySuperAdminEmails: readonly string[] = PRIMARY_SUPERADMIN_EMAILS;

/** True when the given signed-in email belongs to a primary superadmin. */
export function isPrimarySuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return NORMALIZED.has(email.trim().toLowerCase());
}
