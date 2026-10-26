/**
 * GET /api/v1/alerts/evidence-card?id=<alert-id> — the artefact §1.6 is reviewed on.
 *
 * `format=markdown` (text/markdown) and `format=card` (standalone HTML) mirror the
 * Express twin (backend/routes/alerts.js GET /:id/evidence-card); the default is JSON.
 * Evidence cards for non-public states require a duty officer; anyone may read a
 * published alert's card.
 *
 * Deployed through api/v1/alerts/[action].js; the id arrives as a query parameter here
 * (the URL family's single-segment contract) rather than as Express's `:id`.
 */

import { guardRequest } from '../../../backend/middleware/serverlessGuard.js';
import { authenticateAlertRequest } from '../../../backend/utils/alertAuth.js';
import { getAlertStore, alertFromDocument } from '../../../backend/alerts/service.js';
import { buildEvidenceCard } from '../../../backend/alerts/report.js';

const PUBLIC_STATES = ['PUBLISHED', 'UPDATED', 'EXPIRED', 'ALL_CLEAR'];

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'alerts' })) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const id = typeof req.query?.id === 'string' ? req.query.id : null;
  if (!id || id === '_meta') {
    return res.status(400).json({ error: 'the id query parameter is required' });
  }

  const { privileged } = await authenticateAlertRequest(req);
  try {
    const document = await getAlertStore().getDocument(id);
    if (!document) return res.status(404).json({ error: `alert ${id} not found` });
    const alert = alertFromDocument(document);
    if (!privileged && !PUBLIC_STATES.includes(alert.state)) {
      return res.status(403).json({
        error: `evidence cards for ${alert.state} alerts are visible to duty officers only`,
      });
    }
    const card = buildEvidenceCard(alert);
    if (req.query?.format === 'markdown') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      return res.status(200).end(card.markdown);
    }
    if (req.query?.format === 'card') {
      const escaped = card.markdown.replace(/[&<>]/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
      }[c]));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).end(
        `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
        `<title>Evidence card ${card.alert_id}</title></head><body><pre>${escaped}</pre></body></html>`,
      );
    }
    res.setHeader('Cache-Control', privileged ? 'no-store' : 'public, max-age=60');
    return res.status(200).json({ generated_at: new Date().toISOString(), card });
  } catch (error) {
    console.error('[alerts/evidence-card] failed:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
