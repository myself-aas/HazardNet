/**
 * useDeepLinking — wire expo-notifications response + URL open events to
 * navigation actions. Parses hazardnet:// URLs like:
 *
 *   hazardnet://alert/:id            → AlertDetail (Alerts stack)
 *   hazardnet://place/:id            → SavedPlaceDetail (Saved stack)
 *   hazardnet://settings/notifications → NotificationPreferences
 *   https://hazardnet.live/a/:id     → AlertDetail (App Links / Universal Links)
 */

import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Notifications } from './configurePush';

export interface ParsedLink {
  type: 'alert' | 'place' | 'settings' | 'unknown';
  id?: string;
  section?: string;
}

export function parseDeepLink(url: string | null | undefined): ParsedLink {
  if (!url) return { type: 'unknown' };
  try {
    // Strip scheme + host. path begins after the first "://" or after the host.
    let rest = url;
    const schemeSep = rest.indexOf('://');
    if (schemeSep >= 0) rest = rest.slice(schemeSep + 3);
    // Strip host (everything up to first '/').
    const firstSlash = rest.indexOf('/');
    if (firstSlash < 0) return { type: 'unknown' };
    let path = rest.slice(firstSlash + 1);
    // If host was hazardnet.live (https App Links), /a/:id — first segment after path was 'a'.
    // After above strip we already land at the segment after the first '/', which is correct
    // because https://hazardnet.live/a/id → rest="hazardnet.live/a/id", firstSlash after dot-separated
    // host... wait our strip lands at "a/id" which is correct.
    // But for hazardnet://alert/id → rest="alert/id", firstSlash at 5 → "id"? That's wrong.
    // Detect: if URL began with hazardnet:// there's no host between scheme and first '/' segment root.
    if (url.startsWith('hazardnet://')) {
      rest = url.slice('hazardnet://'.length);
      path = rest;
    }
    path = path.split('?')[0];
    const parts = path.split('/').filter(Boolean);
    if (parts[0] === 'a' && parts[1]) return { type: 'alert', id: parts[1] };
    if (parts[0] === 'alert' && parts[1]) return { type: 'alert', id: parts[1] };
    if (parts[0] === 'place' && parts[1]) return { type: 'place', id: parts[1] };
    if (parts[0] === 'settings') return { type: 'settings', section: parts[1] };
    return { type: 'unknown' };
  } catch { return { type: 'unknown' }; }
}

export function useDeepLinking() {
  const nav = useNavigation<any>();
  const navRef = useRef(nav);
  navRef.current = nav;

  const route = useRef((parsed: ParsedLink) => {
    const n = navRef.current;
    if (!n) return;
    if (parsed.type === 'alert' && parsed.id) {
      n.navigate('Alerts', { screen: 'AlertDetail', params: { id: parsed.id } });
    } else if (parsed.type === 'place' && parsed.id) {
      n.navigate('Saved', { screen: 'SavedPlaceDetail', params: { id: parsed.id } });
    } else if (parsed.type === 'settings') {
      n.navigate('More', { screen: 'NotificationPreferences' });
    }
  }).current;

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let urlSub: any = null;

    (async () => {
      // Initial URL (cold start).
      try {
        const initial = await Linking.getInitialURL();
        if (initial) {
          const parsed = parseDeepLink(initial);
          // Small delay so nav is mounted.
          setTimeout(() => route(parsed), 300);
        }
      } catch {}
      urlSub = Linking.addEventListener('url', ({ url }) => route(parseDeepLink(url)));

      // Notification responses (tap on push while cold/background/foreground).
      if (Notifications) {
        try {
          const subAny = Notifications.addNotificationResponseReceivedListener?.((response: any) => {
            const data = response?.notification?.request?.content?.data;
            const url = data?.url;
            if (url) route(parseDeepLink(url));
          });
          if (subAny && typeof subAny.remove === 'function') sub = subAny;
        } catch {}
      }
    })();

    return () => {
      if (urlSub) urlSub.remove?.();
      if (sub) sub.remove();
    };
  }, [route]);
}
