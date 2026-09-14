import express from 'express';
import { pushStore as subscriptions } from '../pushStore.js';
import { getVapidPublicKey, sendWebPushNotification } from '../utils/vapid.js';
import { verifyApiKey } from '../utils/apiKeyAuth.js';

const router = express.Router();

// Durable private Firestore subscriptions shared across Vercel and Express.
const MAX_SUBSCRIPTIONS = 5000;


/**
 * GET /api/push/vapid-key
 * Returns the active VAPID public key for Web Push subscription.
 */
router.get('/vapid-key', (req, res) => {
  const publicKey = getVapidPublicKey();
  res.json({ publicKey });
});

/**
 * GET /api/push/status
 * Returns subscription statistics and push service status.
 */
router.get('/status', handle(async (req, res) => {
  res.json({
    status: 'active',
    activeSubscriptions: await subscriptions.size(),
    vapidPublicKey: getVapidPublicKey(),
  });
}));

/**
 * POST /api/push/subscribe
 * Registers a new client Web Push subscription.
 */
router.post('/subscribe', handle(async (req, res) => {
  const subscription = req.body;

  if (!subscription || !subscription.endpoint || typeof subscription.endpoint !== 'string') {
    return res.status(400).json({ error: 'Invalid push subscription payload' });
  }

  // Restrict browser-provided URLs to real push services (SSRF defense).
  let endpoint;
  try { endpoint = new URL(subscription.endpoint); } catch { return res.status(400).json({ error: 'Malformed push endpoint' }); }
  const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port
      || !allowed.includes(endpoint.hostname) || subscription.endpoint.length > 2048
      || typeof subscription.keys?.p256dh !== 'string' || typeof subscription.keys?.auth !== 'string'
      || subscription.keys.p256dh.length > 256 || subscription.keys.auth.length > 256) {
    return res.status(400).json({ error: 'Unsupported push endpoint or keys' });
  }
  if (await subscriptions.size() >= MAX_SUBSCRIPTIONS) {
    return res.status(503).json({ error: 'Push subscription capacity reached' });
  }

  await subscriptions.set(subscription.endpoint, {
    subscription,
    subscribedAt: new Date().toISOString(),
  });

  console.log(`[Push] New web push subscription registered: ${subscription.endpoint.slice(0, 40)}...`);

  res.status(201).json({
    success: true,
    message: 'Push subscription registered successfully',
    totalSubscriptions: await subscriptions.size(),
  });
}));

/**
 * POST /api/push/unsubscribe
 * Unregisters an existing Web Push subscription.
 */
router.post('/unsubscribe', handle(async (req, res) => {
  const { endpoint } = req.body || {};

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is required for unsubscription' });
  }

  const existed = await subscriptions.delete(endpoint);

  res.json({
    success: true,
    unsubscribed: existed,
    totalSubscriptions: await subscriptions.size(),
  });
}));

/**
 * POST /api/push/send
 * Broadcasts a push notification to registered Web Push clients.
 */
router.post('/send', handle(async (req, res) => {
  // Restrict broadcast capability to authenticated backend jobs
  // (timing-safe compare, fail-closed when BACKEND_API_KEY is unset — SEC-06).
  const auth = verifyApiKey(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { title = 'HazardNet Alert', body = 'New disaster severity telemetry updated.', icon = '/hazardnet-logo.svg', data = {} } = req.body || {};

  const safeTitle = String(title).slice(0, 150);
  const safeBody = String(body).slice(0, 500);
  const safeIcon = typeof icon === 'string' && icon.length <= 255 ? icon : '/hazardnet-logo.svg';

  const notificationPayload = {
    title: safeTitle,
    body: safeBody,
    icon: safeIcon,
    badge: '/hazardnet-logo.svg',
    timestamp: Date.now(),
    data: {
      url: typeof data?.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//') && data.url.length <= 500 ? data.url : '/',
    },
  };

  const results = {
    total: await subscriptions.size(),
    successful: 0,
    failed: 0,
    errors: [],
  };

  if (await subscriptions.size() === 0) {
    return res.json({
      success: true,
      message: 'No active web push subscriptions found',
      results,
    });
  }

  const entries = await subscriptions.entries();
  const send = async ([endpoint, entry]) => {
    try {
      await sendWebPushNotification(entry.subscription, notificationPayload);
      results.successful++;
    } catch (err) {
      results.failed++;
      results.errors.push({ endpoint: endpoint.slice(0, 30), error: err.message });

      // Clean up expired (410 Gone / 404 Not Found) subscriptions
      if (err.statusCode === 410 || err.statusCode === 404) {
        await subscriptions.delete(endpoint);
      }
    }
  };
  for (let i = 0; i < entries.length; i += 10) {
    await Promise.all(entries.slice(i, i + 10).map(send));
  }

  res.json({
    success: true,
    message: `Push notification broadcast complete`,
    results,
  });
}));

function handle(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
}

router.use((err, req, res, _next) => {
  console.error('[push] Store or delivery unavailable:', err.code || err.name);
  res.status(503).json({ error: 'Push service temporarily unavailable' });
});

export default router;
