import { useEffect, useRef } from 'react';
import { ALL_64_DISTRICTS, getDistrictById } from '../data/bangladeshDistricts';

export const useHazardNotifications = (homeDistrictId?: string) => {
  const lastNotifiedDistrictRef = useRef<string | null>(null);

  useEffect(() => {
    let intervalId: any;

    const requestPermissionAndSetup = async () => {
      try {
        if (typeof window === 'undefined' || !('Notification' in window)) {
          return;
        }

        if (Notification.permission === 'granted') {
          startPolling();
        } else if (Notification.permission === 'default') {
          // Do not prompt aggressively without user gesture; but listen if granted later
        }
      } catch (err) {
        // Silent catch for sandboxed iframes
      }
    };

    const startPolling = () => {
      // Periodic check every 60 seconds based on user's district
      intervalId = setInterval(() => {
        try {
          if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
            return;
          }

          const userDistId = homeDistrictId || localStorage.getItem('hazardnet_home_district');
          const userDistrict = userDistId ? getDistrictById(userDistId) : null;

          if (userDistrict && userDistrict.severity >= 0.6) {
            // Avoid duplicate spam for the same district in the same session
            if (lastNotifiedDistrictRef.current !== userDistrict.id) {
              lastNotifiedDistrictRef.current = userDistrict.id;
              const severityPct = Math.round(userDistrict.severity * 100);
              new Notification(`District Hazard Alert: ${userDistrict.name}`, {
                body: `District Hazard Identified: ${userDistrict.hazardType} (${severityPct}% Severity, ${userDistrict.risk} Risk). Vulnerable Crop: ${userDistrict.mainCrop}.`,
                icon: '/hazardnet-logo.svg',
                tag: `district-hazard-${userDistrict.id}`
              });
            }
          }
        } catch (pollErr) {
          // Notification execution fail safe
        }
      }, 60000);
    };

    requestPermissionAndSetup();

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [homeDistrictId]);
};

export default useHazardNotifications;
