/**
 * POST /api/v1/alerts/review — approve / reject / submit / update / expire /
 * all-clear / supersede one alert.
 *
 * The alert id travels in the body here (id field), where the Express twin takes it as
 * :id (backend/routes/alerts.js POST /:id/review); the auth contract is unchanged —
 * either a duty-officer Firebase user, or the pipeline key *naming the human it acts
 * for* ({"reviewer": {"id"|"email": …}}) because §1.6 requires an attributable
 * approver. Mutating actions strictly require the reviewer role (TRD §7.4); an
 * unauthorized attempt is audited onto the alert document.
 *
 * Deployed through api/v1/alerts/[action].js.
 */

import { guardRequest } from '../../../backend/middleware/serverlessGuard.js';
import { authenticateAlertRequest } from '../../../backend/utils/alertAuth.js';
import { getAlertStore, reviewAlert } from '../../../backend/alerts/service.js';
import { notifyAlert } from '../../../backend/alerts/notify.js';
import { isDutyOfficer } from '../../../backend/alerts/lifecycle.js';

const VALID_ACTIONS = ['approve', 'reject', 'submit-for-review', 'update', 'expire', 'all-clear', 'supersede'];
const MUTATING_ACTIONS = ['approve', 'reject', 'update', 'expire', 'all-clear'];

/** Who is calling? Returns {ok, via, actor} or a refusal. Mirrors the Express twin. */
async function resolveReviewer(req) {
  const { user, apiKey: key, dutyOfficer } = await authenticateAlertRequest(req);
  if (key.ok) {
    const named = req.body && (req.body.reviewer || req.body.reviewed_by);
    if (!named || !(named.id || named.email)) {
      return {
        ok: false,
        code: 422,
        error: 'this endpoint needs a named reviewer: pass {"reviewer": {"id"|"email": …}} ' +
          'alongside the API key so the approval is attributable (§1.6)',
      };
    }
    return {
      ok: true,
      via: 'api-key',
      actor: {
        id: named.id || named.email,
        email: named.email || null,
        name: named.name || named.displayName || null,
        role: named.role || 'duty_officer',
      },
    };
  }
  if (user) {
    return { ok: true, via: 'firebase', actor: user, dutyOfficer };
  }
  if (!key.configured) {
    return {
      ok: false,
      code: 503,
      error: 'Service authentication is not configured (BACKEND_API_KEY missing)',
    };
  }
  return {
    ok: false,
    code: 401,
    error: 'sign in as a duty officer or present the pipeline API key with a named reviewer',
  };
}

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'alerts' })) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const body = req.body || {};
  const id = typeof body.id === 'string' && body.id ? body.id : null;
  if (!id) {
    return res.status(400).json({ error: 'the alert id must be a body field ("id")' });
  }
  const action = String(body.action || '').toLowerCase();
  if (!VALID_ACTIONS.includes(action)) {
    return res.status(400).json({
      error: `unknown action "${body.action}"; expected ${VALID_ACTIONS.join(', ')}`,
    });
  }

  const actor = await resolveReviewer(req);
  if (!actor.ok) return res.status(actor.code).json({ error: actor.error });

  if (MUTATING_ACTIONS.includes(action) && !isDutyOfficer(actor.actor, process.env)) {
    try {
      const raw = await getAlertStore().getDocument(id);
      if (raw) {
        raw.events = [...(raw.events || []), {
          type: 'audit',
          action: 'unauthorized_review_attempt',
          at: new Date().toISOString(),
          actor: actor.actor?.id || actor.actor?.uid || actor.actor?.email,
          role: actor.actor?.role,
          attempted_action: action,
          error: 'REVIEW_ROLE_REQUIRED',
        }];
        await getAlertStore().putDocument(raw);
      }
    } catch (e) {
      console.warn('Could not record unauthorized review audit event:', e.message);
    }
    return res.status(403).json({
      error: 'REVIEW_ROLE_REQUIRED',
      message: 'Only users with the reviewer role may perform alert reviews (§7.4)',
    });
  }

  try {
    const expectedVersion = body.version !== undefined ? body.version : req.headers?.['if-match'];
    const result = await reviewAlert({
      id,
      action,
      user: actor.actor,
      authVia: actor.via,
      reason: body.reason ? String(body.reason).slice(0, 2000) : null,
      expectedVersion,
      // A publication is a publication: the fan-out runs whether a duty officer clicked
      // approve or the pipeline attested one (§1.6).
      notify: notifyAlert,
    });
    if (!result.ok) {
      return res.status(result.code).json({
        error: result.error,
        message: result.message,
        current_version: result.current_version,
        expected_version: result.expected_version,
      });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (error) {
    console.error('[alerts/review] failed:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
