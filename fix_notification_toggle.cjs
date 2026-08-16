const fs = require('fs');

let content = `import React, { useState } from 'react';
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
`;

fs.writeFileSync('frontend/src/components/NotificationToggle.tsx', content);

// And fix DisasterDetailModalUI.tsx districtId and export name
let uiContent = fs.readFileSync('frontend/src/components/DisasterDetailModalUI.tsx', 'utf8');
uiContent = uiContent.replace('isOpen && (', 'isOpen && data && (');
// The second error was "Cannot find name 'DisasterDetailModal'. Did you mean 'DisasterDetailModalUI'?" at line 545
// This means there's an `export default DisasterDetailModal;` at the bottom of DisasterDetailModalUI.tsx. Let's just remove it.
uiContent = uiContent.replace('export default DisasterDetailModal;', '');

fs.writeFileSync('frontend/src/components/DisasterDetailModalUI.tsx', uiContent);
