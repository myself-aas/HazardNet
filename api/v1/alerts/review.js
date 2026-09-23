// Vercel Serverless Function — POST /api/v1/alerts/review
//
// The §1.6 human-in-the-loop decision: {"id": "...", "action": "approve"|"reject"|
// "submit-for-review"|"supersede", "reason": "..."} plus, when the pipeline API key
// is used instead of a Firebase token, {"reviewer": {"id"|"email": ...}} so the
// decision is attributable to a named human.
//
// Refusals are explicit: 401 without a caller, 403 for a signed-in non-officer,
// 422 for a rejection with no reason (§1.6 requires it as an eval label) or for a
// publication missing reviewer identity / model version / data cutoff / evidence
// snapshot.

import { authenticateAlertRequest } from '../../../backend/utils/alertAuth.js';
import { reviewAlert } from '../../../backend/alerts/service.js';
import { publicAlertView } from '../../../backend/routes/alerts.js';
import { guardRequest } from '../../../backend/middleware/serverlessGuard.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  if (guardRequest(req, res, { bucket: 'pipeline' })) return;
  const body = req.body || {};
  const action = String(body.action || '').toLowerCase();
  if (!['approve', 'reject', 'submit-for-review', 'supersede'].includes(action)) {
    res.status(400).json({
      error: `unknown action "${body.action}"; expected approve, reject, submit-for-review or supersede`,
    });
    return;
  }
  const { user, apiKey, dutyOfficer } = await authenticateAlertRequest(req);
  const named = body.reviewer || body.reviewed_by || null;
  let actor = null;
  let via = 'firebase';
  if (apiKey.ok) {
    if (!named || !(named.id || named.email)) {
      res.status(422).json({
        error: 'the pipeline API key must name the reviewer it acts for: ' +
          '{"reviewer": {"id"|"email": …}} (§1.6)',
      });
      return;
    }
    via = 'api-key';
    actor = {
      id: named.id || named.email,
      email: named.email || null,
      name: named.name || null,
      role: named.role || 'duty_officer',
    };
  } else if (user) {
    actor = user;
  } else if (!apiKey.configured) {
    res.status(503).json({ error: 'Service authentication is not configured (BACKEND_API_KEY missing)' });
    return;
  } else {
    res.status(401).json({
      error: 'sign in as a duty officer or present the pipeline API key with a named reviewer',
    });
    return;
  }

  try {
    const result = await reviewAlert({
      id: String(body.id || body.alert_id || ''),
      action,
      user: actor,
      authVia: via,
      reason: body.reason ? String(body.reason).slice(0, 2000) : null,
    });
    if (!result.ok) {
      res.status(result.code).json({ error: result.error, state: result.state });
      return;
    }
    res.status(200).json({
      ok: true,
      action: result.action,
      state: result.state,
      level: result.level,
      duty_officer: dutyOfficer || via === 'api-key',
      reviewer: result.actor,
      published: result.published,
      alert: publicAlertView(result.alert, { includeReviewerContact: true }),
    });
  } catch (error) {
    res.status(500).json({ error: `review failed: ${error.message}` });
  }
}
