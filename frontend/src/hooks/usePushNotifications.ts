import { useState, useEffect } from 'react';
import {
  getPushSubscriptionState,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  triggerTestPushNotification,
  DEFAULT_VAPID_PUBLIC_KEY,
} from '../services/pushNotification';

export const usePushNotifications = () => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      const state = await getPushSubscriptionState();
      setIsSupported(state.isSupported);
      setIsSubscribed(state.isSubscribed);
    };
    checkStatus();
  }, []);

  const handleTogglePush = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      if (isSubscribed) {
        const success = await unsubscribeFromPushNotifications();
        if (success) {
          setIsSubscribed(false);
          setStatusMessage('Alerts disabled for this browser.');
        } else {
          setStatusMessage('Failed to disable alerts.');
        }
      } else {
        const success = await subscribeToPushNotifications();
        if (success) {
          setIsSubscribed(true);
          setStatusMessage('Emergency push alerts enabled!');
        } else {
          setStatusMessage('Push subscription was denied or failed.');
        }
      }
    } catch (err) {
      setStatusMessage('An error occurred configuring push.');
    } finally {
      setLoading(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleTestPush = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const success = await triggerTestPushNotification();
      if (success) {
        setStatusMessage('Test alert fired via Service Worker!');
      } else {
        setStatusMessage('Failed to send test alert.');
      }
    } catch (err) {
      setStatusMessage('Error triggering test alert.');
    } finally {
      setLoading(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  return {
    isSubscribed,
    isSupported,
    loading,
    statusMessage,
    vapidKey: DEFAULT_VAPID_PUBLIC_KEY,
    handleTogglePush,
    handleTestPush
  };
};
