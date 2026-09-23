/**
 * NotificationPreferences — global + per-channel notification settings.
 * Phase 6 MVP: master toggle, sound, haptics, critical-alert bypass,
 * quiet hours (default 22:00–07:00), rate limit, lock-screen privacy,
 * "Send test notification" button, and denied-permission recovery.
 *
 * Per-place customization lives in SavedPlaceDetail (Phase 5).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Alert as RNAlert } from 'react-native';
import { Screen } from '../../components/Screen';
import { Box, VStack, HStack } from '../../design-system/primitives';
import { Title1, Title3, Body, BodyBold, Caption, Metadata } from '../../design-system/Text';
import { Card } from '../../design-system/Card';
import { Chip } from '../../design-system/Chip';
import { Switch } from '../../design-system/Switch';
import { Button } from '../../design-system/Button';
import { usePushPermission } from '../../lib/notifications/usePushPermission';
import { useNotificationSettings } from '../../lib/notifications/useNotificationSettings';
import { scheduleTestNotification } from '../../lib/notifications/notifyAlert';
import { SCREEN_H_PADDING } from '../../theme/nativeTokens';

export function NotificationPreferencesScreen() {
  const { permission, requestPermission, openSettings } = usePushPermission();
  const { settings, isReady, updateSettings } = useNotificationSettings();
  const [sentCount, setSentCount] = useState(0);

  useEffect(() => { setSentCount(settings.testNotificationsSent); }, [settings.testNotificationsSent]);

  const enable = useCallback(async () => {
    const r = await requestPermission();
    if (r === 'granted') updateSettings({ enabled: true });
  }, [requestPermission, updateSettings]);

  const sendTest = useCallback(async () => {
    if (permission !== 'granted') {
      const r = await requestPermission();
      if (r !== 'granted') return;
    }
    const id = await scheduleTestNotification();
    if (id) {
      updateSettings({ testNotificationsSent: settings.testNotificationsSent + 1 });
      RNAlert.alert('Test sent', 'A test notification should appear momentarily.');
    } else {
      RNAlert.alert('Could not send test', 'Notifications may be unavailable on this device or simulator.');
    }
  }, [permission, requestPermission, scheduleTestNotification, updateSettings, settings.testNotificationsSent]);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Box px={SCREEN_H_PADDING} py={16} flex={1}>
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
          <VStack space={16}>
            <Title1>Notifications</Title1>

            {permission === 'denied' ? (
              <Card>
                <VStack space={8}>
                  <BodyBold>Notifications are off for this device</BodyBold>
                  <Caption color="textSecondary">Open system settings to allow HazardNet to send alerts.</Caption>
                  <Button variant="primary" size="md" label="Open settings" onPress={openSettings} />
                </VStack>
              </Card>
            ) : permission !== 'granted' ? (
              <Card>
                <VStack space={8}>
                  <BodyBold>Enable push notifications</BodyBold>
                  <Caption color="textSecondary">Allow alerts to appear when the app is closed.</Caption>
                  <Button variant="primary" size="md" label="Turn on notifications" onPress={enable} />
                </VStack>
              </Card>
            ) : null}

            <Card>
              <VStack space={10}>
                <HStack justify="space-between" align="center">
                  <VStack space={2} flex={1}>
                    <BodyBold>Enable alerts</BodyBold>
                    <Caption color="textMuted">Master switch — when off, no notifications are sent.</Caption>
                  </VStack>
                  <Switch value={settings.enabled} onValueChange={(v) => updateSettings({ enabled: v })} disabled={permission !== 'granted'} />
                </HStack>
              </VStack>
            </Card>

            <Card>
              <VStack space={10}>
                <Title3>Delivery</Title3>
                <HStack justify="space-between" align="center">
                  <VStack space={2} flex={1}><BodyBold>Sound</BodyBold></VStack>
                  <Switch value={settings.soundEnabled} onValueChange={(v) => updateSettings({ soundEnabled: v })} />
                </HStack>
                <HStack justify="space-between" align="center">
                  <VStack space={2} flex={1}><BodyBold>Haptics</BodyBold></VStack>
                  <Switch value={settings.hapticsEnabled} onValueChange={(v) => updateSettings({ hapticsEnabled: v })} />
                </HStack>
                <HStack justify="space-between" align="center">
                  <VStack space={2} flex={1}>
                    <BodyBold>SEVERE bypasses quiet hours</BodyBold>
                    <Caption color="textMuted">Life-threatening alerts sound even during Do-Not-Disturb / quiet hours.</Caption>
                  </VStack>
                  <Switch value={settings.criticalAlertsEnabled} onValueChange={(v) => updateSettings({ criticalAlertsEnabled: v })} />
                </HStack>
              </VStack>
            </Card>

            <Card>
              <VStack space={10}>
                <Title3>Quiet hours</Title3>
                <HStack justify="space-between" align="center">
                  <VStack space={2} flex={1}>
                    <BodyBold>Suppress overnight</BodyBold>
                    <Caption color="textMuted">Non-SEVERE alerts are held 22:00–07:00 and summarised in the morning.</Caption>
                  </VStack>
                  <Switch
                    value={settings.globalQuietHours.enabled}
                    onValueChange={(v) => updateSettings({ globalQuietHours: { ...settings.globalQuietHours, enabled: v } })}
                  />
                </HStack>
                {settings.globalQuietHours.enabled ? (
                  <Metadata color="textMuted">22:00 – 07:00 (custom times land in Phase 6b)</Metadata>
                ) : null}
              </VStack>
            </Card>

            <Card>
              <VStack space={10}>
                <Title3>Channels</Title3>
                <HStack style={{ flexWrap: 'wrap' }} space={8}>
                  <Chip label="Severe" severity="severe" selected />
                  <Chip label="Warnings" severity="warning" selected />
                  <Chip label="Watches" severity="watch" selected />
                  <Chip label="Info" selected />
                </HStack>
                <Caption color="textMuted">Per-hazard-type granularity is configured per saved place.</Caption>
              </VStack>
            </Card>

            <Card>
              <VStack space={10}>
                <Title3>Privacy</Title3>
                <HStack justify="space-between" align="center">
                  <VStack space={2} flex={1}>
                    <BodyBold>Hide details on lock screen</BodyBold>
                    <Caption color="textMuted">Show only "HazardNet alert" for shared phones.</Caption>
                  </VStack>
                  <Switch
                    value={settings.showDetailsOnLockScreen === false}
                    onValueChange={(v) => updateSettings({ showDetailsOnLockScreen: !v })}
                  />
                </HStack>
              </VStack>
            </Card>

            <Button
              variant="primary"
              size="lg"
              label={`Send test notification (${sentCount})`}
              onPress={sendTest}
            />
          </VStack>
        </ScrollView>
      </Box>
    </Screen>
  );
}
