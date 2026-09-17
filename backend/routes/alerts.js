/**
 * /api/v1/alerts — the alert engine's public read surface and the §1.6
 * human-in-the-loop review surface.
 *
 * Read model, deliberately asymmetric:
 *
 *   - **PUBLISHED alerts are public.** §1.3 puts alerts on the public map and in
 *     the public API; anyone can read them, export them and pull an evidence card.
 *   - **Everything else needs a duty officer.** DRAFT / PENDING_REVIEW / REJECTED
 *     records are operational: they carry unreviewed claims and reviewer reasoning.
 *     A Firebase token for a duty officer (or the pipeline API key) is required.
 *   - **A reviewer's email is not public.** §1.6 requires the identity to be
 *     *stored* on the alert; that is not the same as publishing a volunteer's
 *     address. The public view exposes the reviewer id and whether the publication
 *     was automatic or human; the full identity is returned to duty officers only.
 *
 * Write model, all of it keyed: `run`/`preview` need `BACKEND_API_KEY` (fail-closed
 * 503 when unset, same as the other write routes), and `review` needs either that
 * key with an attested reviewer or a duty-officer token. No endpoint accepts an
 * unauthenticated state change.
 */

import express from 'express';
import { requireApiKey } from '../utils/apiKeyAuth.js';
import { authenticateAlertRequest } from '../utils/alertAuth.js';
import { alertLimiter, alertReviewLimiter } from '../middleware/rateLimit.js';
import { ALERT_LEVELS, describePolicy, getPolicy } from '../alerts/policy.js';
import {
  getAlertStore, listAlerts, reviewAlert, runAlertEngine, previewAssessments,
  collectForecastRows, alertFromDocument, alertIdFor, stateCounts,
} from '../alerts/service.js';
import { buildEvidenceCard, alertsToCsv, buildReportMarkdown } from '../alerts/report.js';
import { notifyAlert } from '../alerts/notify.js';
import { describeSmsTransport, getSmsConfig } from '../alerts/channels/sms.js';
import { getTelegramConfig } from '../alerts/channels/telegram.js';
import { ALERT_STATES } from '../alerts/lifecycle.js';

const router = express.Router();

/**
 * Public projection of a stored alert. §1.6 requires the reviewer identity to be
 * *stored*; publishing a volunteer's email address to the open internet is a
 * different act, so the public view keeps the decision, the timestamp and the
 * reason (which is what makes an alert auditable) and drops the contact details
 * and the raw event log.
 */
const redactActor = (actor) => {
  if (!actor) return actor;
  const value = String(actor);
  if (value === 'alert-pipeline') return value;
  if (value.includes('@')) return 'reviewer (contact redacted)';
  return value;
};

export const publicAlertView = (alert, { includeReviewerContact = false } = {}) => {
  const view = { ...alert };
  delete view.assessment;
  if (!includeReviewerContact) {
    view.history = (alert.history || []).map((entry) => ({
      at: entry.at,
      from: entry.from,
      to: entry.to,
      level: entry.level,
      automatic: entry.actor === 'alert-pipeline',
      actor: redactActor(entry.actor),
      reason: entry.reason,
      rejection_reason: entry.rejection_reason,
    }));
    if (view.review) view.review = { ...view.review, reviewer: redactActor(view.review.reviewer) };
    if (view.published) {
      view.published = {
        ...view.published,
        reviewer: redactActor(view.published.reviewer),
        contact_redacted: 'reviewer email is available to duty officers only',
      };
    }
  }
  return view;
};

/** Who is calling? Returns {ok, via, actor} or a refusal. */
async function resolveReviewer(req) {
  const { user, apiKey: key, dutyOfficer } = await authenticateAlertRequest(req);
  if (key.ok) {
    // The pipeline key may act only if it names the human it is acting for: §1.6
    // requires a named reviewer, and an unattributed "the service approved it"
    // would defeat the rule this endpoint exists to enforce.
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

// ─────────────────────────────────────────────────────────────────────────
// GET /api/v1/alerts/policy — public. The thresholds and caveats in force.
// ─────────────────────────────────────────────────────────────────────────
router.get('/policy', alertLimiter, (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    ...describePolicy(getPolicy()),
    levels: ALERT_LEVELS,
    states: ALERT_STATES,
    transports: {
      sms: describeSmsTransport(getSmsConfig()),
      telegram: { channel: 'telegram', configured: getTelegramConfig().configured },
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/v1/alerts/transports — duty officer/pipeline view of exactly what
// is wired up (never includes credentials).
// ─────────────────────────────────────────────────────────────────────────
router.get('/transports', alertLimiter, requireApiKey, (req, res) => {
  res.json({
    sms: describeSmsTransport(getSmsConfig()),
    telegram: { channel: 'telegram', configured: getTelegramConfig().configured },
    auto_publish: /^(0|false|no|off)$/i.test(String(process.env.ALERT_AUTO_PUBLISH ?? 'true'))
      ? 'disabled' : 'enabled',
    duty_officers_configured: Boolean(process.env.ALERT_DUTY_OFFICERS),
  });
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/v1/alerts — published alerts by default; duty officers see the queue.
// ─────────────────────────────────────────────────────────────────────────
router.get('/', alertLimiter, async (req, res) => {
  const store = getAlertStore();
  const policy = getPolicy();
  const { privileged } = await authenticateAlertRequest(req);

  const requestedState = req.query.state ? String(req.query.state).toUpperCase() : null;
  if (requestedState && !ALERT_STATES.includes(requestedState)) {
    return res.status(400).json({ error: `unknown state ${requestedState}` });
  }
  const level = req.query.level ? String(req.query.level).toUpperCase() : null;
  if (level && !ALERT_LEVELS.includes(level)) {
    return res.status(400).json({ error: `unknown level ${level}` });
  }
  const state = privileged ? (requestedState || null) : 'PUBLISHED';

  try {
    const alerts = await listAlerts({
      store,
      state,
      level,
      horizon: req.query.horizon ? String(req.query.horizon) : undefined,
      districtId: req.query.district_id || req.query.districtId || undefined,
      max: Math.min(Number(req.query.limit) > 0 ? Number(req.query.limit) : 200, 500),
    });
    const view = alerts.map((alert) => publicAlertView(alert, {
      includeReviewerContact: privileged,
    }));
    res.set('Cache-Control', privileged ? 'no-store' : 'public, max-age=60');
    res.json({
      generated_at: new Date().toISOString(),
      policy_version: policy.version,
      count: view.length,
      state_counts: stateCounts(alerts),
      states_visible: privileged ? 'all' : ['PUBLISHED'],
      filters: { state, level, horizon: req.query.horizon || null,
        district_id: req.query.district_id || null },
      max_auto_publish_level: policy.max_auto_publish_level,
      disclaimer: policy.disclaimer,
      alerts: view,
    });
  } catch (error) {
    res.status(500).json({ error: `could not list alerts: ${error.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/v1/alerts/export.csv — CSV with the §1.7 disclaimer column.
// ─────────────────────────────────────────────────────────────────────────
router.get('/export.csv', alertLimiter, async (req, res) => {
  const { privileged } = await authenticateAlertRequest(req);
  try {
    const alerts = await listAlerts({
      store: getAlertStore(),
      state: privileged && req.query.state ? String(req.query.state).toUpperCase() : 'PUBLISHED',
      level: req.query.level ? String(req.query.level).toUpperCase() : undefined,
      horizon: req.query.horizon ? String(req.query.horizon) : undefined,
      max: Math.min(Number(req.query.limit) > 0 ? Number(req.query.limit) : 500, 2000),
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="hazardnet-alerts.csv"');
    res.send(alertsToCsv(alerts));
  } catch (error) {
    res.status(500).json({ error: `could not export alerts: ${error.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/v1/alerts/preview — score rows through the policy without storing.
// ─────────────────────────────────────────────────────────────────────────
router.post('/preview', requireApiKey, alertReviewLimiter, async (req, res) => {
  const policy = getPolicy();
  try {
    const rows = Array.isArray(req.body && req.body.rows) && req.body.rows.length > 0
      ? req.body.rows
      : await collectForecastRows({});
    const batch = previewAssessments({ rows, policy });
    res.json({
      policy: describePolicy(policy),
      batch,
      report: buildReportMarkdown(batch),
    });
  } catch (error) {
    res.status(500).json({ error: `preview failed: ${error.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/v1/alerts/run — the scheduled engine pass (pipeline only).
// ─────────────────────────────────────────────────────────────────────────
router.post('/run', requireApiKey, alertReviewLimiter, async (req, res) => {
  const notify = req.body && req.body.notify === false ? null : notifyAlert;
  try {
    const result = await runAlertEngine({ notify });
    res.json({
      ...result,
      batch: req.body && req.body.include_alerts === true
        ? result.batch
        : { ...result.batch, alerts: undefined, alerts_omitted: result.batch.alerts.length },
    });
  } catch (error) {
    res.status(500).json({ error: `alert run failed: ${error.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Helper routes used by tooling/tests: the deterministic id for a key.
// ─────────────────────────────────────────────────────────────────────────
router.get('/id/for', alertLimiter, (req, res) => {
  res.json({
    id: alertIdFor({
      district_id: req.query.district_id,
      horizon: req.query.horizon,
      hazard_type: req.query.hazard_type,
      target_date: req.query.target_date,
    }),
  });
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/v1/alerts/:id — one alert; unpublished states need a duty officer.
// ─────────────────────────────────────────────────────────────────────────
router.get('/:id', alertLimiter, async (req, res) => {
  if (req.params.id === '_meta') return res.status(404).json({ error: 'Not found' });
  const { privileged } = await authenticateAlertRequest(req);
  try {
    const document = await getAlertStore().getDocument(String(req.params.id));
    if (!document) return res.status(404).json({ error: `alert ${req.params.id} not found` });
    const alert = alertFromDocument(document);
    if (!privileged && alert.state !== 'PUBLISHED') {
      return res.status(403).json({
        error: `alert ${req.params.id} is ${alert.state}; only published alerts are public (§1.6)`,
      });
    }
    res.set('Cache-Control', privileged ? 'no-store' : 'public, max-age=60');
    res.json({
      generated_at: new Date().toISOString(),
      policy_version: getPolicy().version,
      alert: publicAlertView(alert, { includeReviewerContact: privileged }),
      history_visible: privileged,
    });
  } catch (error) {
    res.status(500).json({ error: `could not read alert: ${error.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/v1/alerts/:id/evidence-card — the artefact §1.6 is reviewed on.
// ─────────────────────────────────────────────────────────────────────────
router.get('/:id/evidence-card', alertLimiter, async (req, res) => {
  if (req.params.id === '_meta') return res.status(404).json({ error: 'Not found' });
  const { privileged } = await authenticateAlertRequest(req);
  try {
    const document = await getAlertStore().getDocument(String(req.params.id));
    if (!document) return res.status(404).json({ error: `alert ${req.params.id} not found` });
    const alert = alertFromDocument(document);
    if (!privileged && alert.state !== 'PUBLISHED') {
      return res.status(403).json({
        error: `evidence cards for ${alert.state} alerts are visible to duty officers only`,
      });
    }
    const card = buildEvidenceCard(alert);
    if (req.query.format === 'markdown') {
      res.set('Content-Type', 'text/markdown; charset=utf-8');
      return res.send(card.markdown);
    }
    if (req.query.format === 'card') {
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8">` +
        `<title>Evidence card ${card.alert_id}</title></head><body><pre>` +
        `${card.markdown.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}` +
        '</pre></body></html>');
    }
    res.set('Cache-Control', privileged ? 'no-store' : 'public, max-age=60');
    res.json({ generated_at: new Date().toISOString(), card });
  } catch (error) {
    res.status(500).json({ error: `could not build evidence card: ${error.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/v1/alerts/:id/review — approve / reject / submit / supersede.
// ─────────────────────────────────────────────────────────────────────────
router.post('/:id/review', alertReviewLimiter, async (req, res) => {
  const body = req.body || {};
  const action = String(body.action || '').toLowerCase();
  // Method first, then identity: a nonsense action is a 400 for everyone, which
  // keeps the auth branch from turning a client bug into a misleading 422.
  if (!['approve', 'reject', 'submit-for-review', 'supersede'].includes(action)) {
    return res.status(400).json({
      error: `unknown action "${body.action}"; expected approve, reject, submit-for-review or supersede`,
    });
  }
  const actor = await resolveReviewer(req);
  if (!actor.ok) return res.status(actor.code).json({ error: actor.error });
  try {
    const result = await reviewAlert({
      id: String(req.params.id),
      action,
      user: actor.actor,
      authVia: actor.via,
      reason: body.reason ? String(body.reason).slice(0, 2000) : null,
      // A publication is a publication: the fan-out runs whether a duty officer
      // clicked approve or the pipeline attested one (§1.6).
      notify: notifyAlert,
    });
    if (!result.ok) return res.status(result.code).json({ error: result.error, state: result.state });
    res.json({
      ok: true,
      action: result.action,
      state: result.state,
      level: result.level,
      reviewer: result.actor,
      published: result.published,
      notification: result.notification || null,
      alert: publicAlertView(result.alert, { includeReviewerContact: true }),
    });
  } catch (error) {
    res.status(500).json({ error: `review failed: ${error.message}` });
  }
});

export default router;
