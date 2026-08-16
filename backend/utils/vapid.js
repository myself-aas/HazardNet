import webpush from 'web-push';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_PUBLIC_KEY = 'BEO1bxiFpFAXQf0vQasl2C0i7DhZOdKzl8EyAiESkxTLP6B0JZ5gomHCb938bwP2ct6srfLB_URuEZSCnPoyLUw';
const CONTACT_EMAIL = process.env.WEB_PUSH_CONTACT || 'mailto:admin@hazardnet.org';

let activePublicKey = process.env.VAPID_PUBLIC_KEY || DEFAULT_PUBLIC_KEY;
let activePrivateKey = process.env.VAPID_PRIVATE_KEY;

// If no private key is provided in environment, generate ephemeral keypair for dev/testing
if (!activePrivateKey) {
  const ephemeralKeys = webpush.generateVAPIDKeys();
  activePrivateKey = ephemeralKeys.privateKey;
  // Keep activePublicKey as configured or ephemeral if needed
  if (!activePublicKey) {
    activePublicKey = ephemeralKeys.publicKey;
  }
}

try {
  webpush.setVapidDetails(CONTACT_EMAIL, activePublicKey, activePrivateKey);
} catch (err) {
  console.warn('VAPID Configuration warning:', err.message);
}

export function getVapidPublicKey() {
  return activePublicKey;
}

export async function sendWebPushNotification(subscription, payload) {
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return webpush.sendNotification(subscription, payloadString);
}

export default {
  getVapidPublicKey,
  sendWebPushNotification,
  webpush,
};
