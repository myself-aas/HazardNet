/**
 * NotificationsProvider — wires up:
 *   - Android channel / iOS category configuration on mount
 *   - Deep link + notification-response routing
 *   - Incoming-alert observer that fires local notifications / foreground banner
 *   - Foreground notification banner at top of screen
 *
 * Must be rendered inside NavigationContainer (so useNavigation works) and
 * QueryClientProvider (so useAlerts works).
 */

import React, { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { useAlerts } from '../../hooks/useAlerts';
import { useIncomingAlertNotifier } from '../../lib/notifications/useIncomingAlertNotifier';
import { useDeepLinking } from '../../lib/notifications/useDeepLinking';
import { configurePushChannels } from '../../lib/notifications/configurePush';
import { ForegroundNotificationBanner } from '../banner/ForegroundNotificationBanner';
import { useForegroundBannerState } from '../../state/foregroundBannerStore';
import { useNavigation } from '@react-navigation/native';
import type { MatchOutcome } from '@hazardnet/core';
import type { AlertItemType } from '@hazardnet/core';
import { markNotifEducationSeen } from './PermissionEducationSheet';

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { data: alerts } = useAlerts();
  const nav = useNavigation<any>();
  const { banner, showBanner, dismissBanner } = useForegroundBannerState();

  useDeepLinking();

  React.useEffect(() => { configurePushChannels(); }, []);

  const onForegroundAlert = useCallback((m: MatchOutcome, _a: AlertItemType) => {
    showBanner({
      id: `${m.dedupeKey}:${Date.now()}`,
      title: m.title,
      body: m.body,
      channel: m.channel,
      alertId: undefined,
      placeId: m.placeId,
      onPress: () => {
        dismissBanner();
        // We don't have alertId here because match doesn't carry it; navigate to place detail.
        if (m.placeId) nav.navigate('Saved', { screen: 'SavedPlaceDetail', params: { id: m.placeId } });
      },
    });
    void markNotifEducationSeen();
  }, [showBanner, dismissBanner, nav]);

  useIncomingAlertNotifier(alerts, onForegroundAlert);

  return (
    <View style={{ flex: 1 }}>
      {children}
      <ForegroundNotificationBanner banner={banner} onDismiss={dismissBanner} />
    </View>
  );
}
