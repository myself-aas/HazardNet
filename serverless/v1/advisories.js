/** Node Function twin for published district/day advisories; never reads private research inputs. */
import { guardRequest } from '../../backend/middleware/serverlessGuard.js';
import { readPublishedDailySnapshot } from '../../backend/utils/dailyAdvisoryNode.js';
import { queryPublicDaily } from '../../backend/utils/dailyAdvisoryServe.js';

export default async function handler(req, res) {
  if (guardRequest(req, res, { bucket: 'read' })) return;
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const snapshot = await readPublishedDailySnapshot();
  const { code, body } = queryPublicDaily(snapshot, req.query || {});
  res.setHeader('Cache-Control', code === 200 ? 'public, max-age=60' : 'no-store');
  return res.status(code).json(body);
}
