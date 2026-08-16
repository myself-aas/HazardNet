import { useState } from 'react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { NotificationToggleUI } from './NotificationToggleUI';

export const NotificationToggle: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  
  const {
    isSubscribed,
    isSupported,
    loading,
    statusMessage,
    vapidKey,
    handleTogglePush,
    handleTestPush
  } = usePushNotifications();

  return (
    <NotificationToggleUI
      isOpen={isOpen}
      isSubscribed={isSubscribed}
      loading={loading}
      statusMessage={statusMessage}
      isSupported={isSupported}
      vapidKey={vapidKey}
      onToggleOpen={() => setIsOpen(!isOpen)}
      onClose={() => setIsOpen(false)}
      onTogglePush={handleTogglePush}
      onTestPush={handleTestPush}
    />
  );
};
