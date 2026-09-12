// Frontend Web Push Notification Service using VAPID Key pair certificates

export const DEFAULT_VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BDiZRhvhtY3Dy6BMKXfM0_tE55WwoIx7r8UiYY1n8foTAOlv53WUMtKEx7VPvnnawvQ6H87KWLJkX81CdOFdmUU';

/**
 * Convert a base64url encoded VAPID public key string into a Uint8Array suitable for PushManager.subscribe()
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Fetch active VAPID public key from backend or fallback to constant
 */
export async function getVapidPublicKey(): Promise<string> {
  try {
    const res = await fetch('/api/push/vapid-key');
    if (res.ok) {
      const data = await res.json();
      if (data.publicKey) return data.publicKey;
    }
  } catch (err) {
    console.warn('[Push] Error fetching VAPID public key from API, using fallback:', err);
  }
  return DEFAULT_VAPID_PUBLIC_KEY;
}

/**
 * Request notification permission from browser
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    throw new Error('This browser does not support desktop notifications.');
  }
  return Notification.requestPermission();
}

/**
 * Subscribe browser to Web Push notifications with VAPID Key
 */
export async function subscribeToPushNotifications(): Promise<{ success: boolean; subscription?: PushSubscription; error?: string }> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { success: false, error: 'Web Push is not supported in this browser environment.' };
    }

    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Notification permission was denied by user.' };
    }

    const registration = await navigator.serviceWorker.ready;
    const publicKey = await getVapidPublicKey();
    const applicationServerKey = urlBase64ToUint8Array(publicKey);

    // Existing subscription check
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as any,
      });
    }

    // Register subscription with backend
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with ${res.status}`);
    }

    return { success: true, subscription };
  } catch (err: any) {
    console.error('[Push] Subscription failed:', err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Unsubscribe from Web Push notifications
 */
export async function unsubscribeFromPushNotifications(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { success: false, error: 'Web Push not supported' };
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      // Notify backend
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      }).catch((e) => console.warn('[Push] Failed to notify backend of unsubscription:', e));
    }

    return { success: true };
  } catch (err: any) {
    console.error('[Push] Unsubscribe failed:', err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Check current push notification subscription status
 */
export async function getPushSubscriptionState(): Promise<{
  isSupported: boolean;
  permission: NotificationPermission | 'unsupported';
  isSubscribed: boolean;
  subscription: PushSubscription | null;
}> {
  const isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!isSupported) {
    return { isSupported: false, permission: 'unsupported', isSubscribed: false, subscription: null };
  }

  const permission = Notification.permission;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return {
      isSupported: true,
      permission,
      isSubscribed: !!subscription,
      subscription,
    };
  } catch (err) {
    return {
      isSupported: true,
      permission,
      isSubscribed: false,
      subscription: null,
    };
  }
}

/**
 * Send a test push notification broadcast via API
 */
export async function triggerTestPushNotification(title?: string, body?: string): Promise<any> {
  const res = await fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: title || 'HazardNet Emergency Telemetry Alert',
      body: body || 'Pre-monsoon flash flood surge index spike detected in Sunamganj (Severity: 0.88).',
      data: { url: '/' },
    }),
  });
  return res.json();
}
