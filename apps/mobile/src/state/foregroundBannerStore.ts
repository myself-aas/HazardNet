/**
 * foregroundBannerStore — holds the current in-app notification banner
 * ("toast") displayed when an alert arrives while the app is open.
 *
 * Rendered by <ForegroundNotificationBanner /> at the top of the nav tree.
 * Auto-dismisses after 6s.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ForegroundBanner {
  id: string;
  title: string;
  body: string;
  channel: 'critical' | 'warning' | 'watch' | 'info';
  alertId?: string;
  placeId?: string;
  onPress?: () => void;
}

const BANNER_AUTO_DISMISS_MS = 6000;

export function useForegroundBannerState() {
  const [banner, setBannerState] = useState<ForegroundBanner | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = useCallback((b: ForegroundBanner) => {
    if (timer.current) clearTimeout(timer.current);
    setBannerState(b);
    timer.current = setTimeout(() => setBannerState(null), BANNER_AUTO_DISMISS_MS);
  }, []);

  const dismissBanner = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setBannerState(null);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { banner, showBanner, dismissBanner };
}
