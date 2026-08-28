import express from 'express';
import { getVapidPublicKey, sendWebPushNotification } from '../utils/vapid.js';
import { verifyApiKey } from '../utils/apiKeyAuth.js';

const router = express.Router();

// In-memory web push subscription store with max capacity limit
const MAX_SUBSCRIPTIONS = 5000;
const subscriptions = new Map();

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
router.get('/status', (req, res) => {
  res.json({
    status: 'active',
    activeSubscriptions: subscriptions.size,
    vapidPublicKey: getVapidPublicKey(),
  });
});

/**
 * POST /api/push/subscribe
 * Registers a new client Web Push subscription.
 */
router.post('/subscribe', (req, res) => {
  const subscription = req.body;

  if (!subscription || !subscription.endpoint || typeof subscription.endpoint !== 'string') {
    return res.status(400).json({ error: 'Invalid push subscription payload' });
  }

  // Validate endpoint URL structure and length
  if (subscription.endpoint.length > 2048 || (!subscription.endpoint.startsWith('https://') && !subscription.endpoint.startsWith('http://localhost'))) {
    return res.status(400).json({ error: 'Malformed push subscription endpoint' });
  }

  if (subscriptions.size >= MAX_SUBSCRIPTIONS && !subscriptions.has(subscription.endpoint)) {
    // Evict oldest subscription if over limit
    const oldestKey = subscriptions.keys().next().value;
    subscriptions.delete(oldestKey);
  }

  subscriptions.set(subscription.endpoint, {
    subscription,
    subscribedAt: new Date().toISOString(),
  });

  console.log(`[Push] New web push subscription registered: ${subscription.endpoint.slice(0, 40)}...`);

  res.status(201).json({
    success: true,
    message: 'Push subscription registered successfully',
    totalSubscriptions: subscriptions.size,
  });
});

/**
 * POST /api/push/unsubscribe
 * Unregisters an existing Web Push subscription.
 */
router.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body || {};

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is required for unsubscription' });
  }

  const existed = subscriptions.delete(endpoint);

  res.json({
    success: true,
    unsubscribed: existed,
    totalSubscriptions: subscriptions.size,
  });
});

/**
 * POST /api/push/send
 * Broadcasts a push notification to registered Web Push clients.
 */
router.post('/send', async (req, res) => {
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
      url: typeof data?.url === 'string' && data.url.length <= 500 ? data.url : '/',
      ...(typeof data === 'object' && data !== null ? data : {}),
    },
  };

  const results = {
    total: subscriptions.size,
    successful: 0,
    failed: 0,
    errors: [],
  };

  if (subscriptions.size === 0) {
    return res.json({
      success: true,
      message: 'No active web push subscriptions found',
      results,
    });
  }

  const sendPromises = Array.from(subscriptions.entries()).map(async ([endpoint, entry]) => {
    try {
      await sendWebPushNotification(entry.subscription, notificationPayload);
      results.successful++;
    } catch (err) {
      results.failed++;
      results.errors.push({ endpoint: endpoint.slice(0, 30), error: err.message });

      // Clean up expired (410 Gone / 404 Not Found) subscriptions
      if (err.statusCode === 410 || err.statusCode === 404) {
        subscriptions.delete(endpoint);
      }
    }
  });

  await Promise.all(sendPromises);

  res.json({
    success: true,
    message: `Push notification broadcast complete`,
    results,
  });
});

export default router;
