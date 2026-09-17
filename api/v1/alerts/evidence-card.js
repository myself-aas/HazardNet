// Vercel Serverless Function — GET /api/v1/alerts/evidence-card?id=<alert-id>
//
// The artefact a duty officer reviews before approving (§1.6). Published alerts
// are public; unpublished cards need the pipeline key or a duty-officer token.
// `?format=markdown` returns the plain-text rendering, `?format=card` the printable
// one; the default is JSON.

import { authenticateAlertRequest } from '../../../backend/utils/alertAuth.js';
import { alertFromDocument, getAlertStore } from '../../../backend/alerts/service.js';
import { buildEvidenceCard } from '../../../backend/alerts/report.js';
import { guardRequest } from '../../../backend/middleware/serverlessGuard.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  if (guardRequest(req, res, { bucket: 'alerts' })) return;
  const id = req.query.id || req.query.alert_id;
  if (!id || id === '_meta') {
    res.status(400).json({ error: 'an ?id=<alert-id> query parameter is required' });
    return;
  }
  const { privileged } = await authenticateAlertRequest(req);
  try {
    const document = await getAlertStore().getDocument(String(id));
    if (!document) {
      res.status(404).json({ error: `alert ${id} not found` });
      return;
    }
    const alert = alertFromDocument(document);
    if (!privileged && alert.state !== 'PUBLISHED') {
      res.status(403).json({
        error: `evidence cards for ${alert.state} alerts are visible to duty officers only`,
      });
      return;
    }
    const card = buildEvidenceCard(alert);
    if (req.query.format === 'markdown') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.status(200).send(card.markdown);
      return;
    }
    res.setHeader('Cache-Control', privileged ? 'no-store, max-age=0' : 'public, max-age=60');
    res.status(200).json({ generated_at: new Date().toISOString(), card });
  } catch (error) {
    res.status(500).json({ error: `could not build evidence card: ${error.message}` });
  }
}
