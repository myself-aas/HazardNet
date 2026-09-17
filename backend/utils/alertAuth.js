/**
 * Access control for the alert surface, shared by the Express router and the
 * Vercel serverless handlers so the two deployments cannot drift apart.
 *
 * Three kinds of caller, in increasing privilege:
 *
 *   1. **Anonymous.** Published alerts are public (PRODUCT_SPEC §1.3). Everything
 *      else — the review queue, unreviewed claims, reviewer reasoning, exports of
 *      non-published rows — is not.
 *   2. **A signed-in user.** Identity is attached (`req.user`) and returned here,
 *      but reading the queue still requires duty-officer standing: a signed-in
 *      stranger is not a reviewer (§1.6 asks for a *named* duty officer).
 *   3. **A duty officer or the pipeline.** `ALERT_DUTY_OFFICERS` (uids/emails), a
 *      token claim of admin/duty_officer, or `BACKEND_API_KEY` — the key is
 *      fail-closed: an unset key means "no privileged path", never "allow".
 *
 * `authenticateAlertRequest` performs no I/O beyond the Firebase token check that
 * the middleware already does, and never throws.
 */

import { verifyFirebaseIdToken, bearerToken } from '../middleware/firebaseAuth.js';
import { verifyApiKey } from './apiKeyAuth.js';
import { isDutyOfficer } from '../alerts/lifecycle.js';

export async function authenticateAlertRequest(req, { env = process.env, user = undefined } = {}) {
  const headers = (req && req.headers) || {};
  const resolvedUser = user !== undefined ? user : (req && req.user) || await verifyFirebaseIdToken(bearerToken(headers));
  const key = verifyApiKey({ headers });
  const dutyOfficer = isDutyOfficer(resolvedUser, env);
  return {
    user: resolvedUser || null,
    apiKey: { ok: key.ok === true, status: key.status || null, configured: key.status !== 503 },
    dutyOfficer,
    /** May read unpublished alerts, the queue and the reviewer contact details. */
    privileged: dutyOfficer || key.ok === true,
  };
}

/** §1.6: only a published alert may be served to an anonymous caller. */
export function isPublicReadable(alert) {
  return Boolean(alert) && alert.state === 'PUBLISHED';
}
