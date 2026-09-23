/**
 * Today / Situation Summary (default launch tab).
 *
 * Phase 3: real severity card (largest element), location header, status
 * banner, emergency CTA chips, active-alert chips, conditions line, disclaimer.
 *
 * States handled (Phase 3): loading (skeleton), loaded (no events),
 * loadedActive (highest severity), error (via banner). Additional
 * stale/delayed/offline banners land in Phase 4.
 */

import React, { useCallback, useMemo } from 'react';
import { Alert as RNAlert, RefreshControl } from 'react-native';
import { safeOpenUrl } from '../../lib/security/openUrl';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../components/Screen';
import { Box, VStack, HStack } from '../../design-system/primitives';
import { Title1, Title3, Body, Caption, Metadata, DisplayLarge } from '../../design-system/Text';
import { Card } from '../../design-system/Card';
import { Chip, SeverityBadge } from '../../design-system/Chip';
import { EmergencyCTARow, DisclaimerFooter } from '../../components/alerts/EmergencyCTA';
import { useAlerts, useAlertCounts } from '../../hooks/useAlerts';
import { useAppStateStore } from '../../state/appStateStore';
import { useSeverityVisual, formatAge } from '../../lib/severity';
import { highestAlert, getExtrasFor } from '../../lib/mockAlerts';
import { TodaySkeleton } from '../../design-system/LoadingSkeleton';
import { Button } from '../../design-system/Button';
import { SCREEN_H_PADDING } from '../../theme/nativeTokens';
import { ListEmptyState } from '../../design-system/EmptyState';
import { AlertRow } from '../../components/alerts/AlertRow';
import { EMERGENCY_CONTACTS } from '@hazardnet/core';
import { useLocation } from '../../hooks/useLocation';
import { useSavedPlaces } from '../../hooks/useSavedPlaces';
import { divisionForPoint } from '../../lib/geo/divisions';
import { hasSeenLocationEducation, markLocationEducationSeen } from '../../components/map/LocationPermissionEducationSheet';

const ARROW = '\u2192';

export function TodayScreen() {
  const nav = useNavigation<any>();
  const { data: alerts, isLoading, isError, refetch, isRefetching, dataUpdatedAt } = useAlerts();
  const setBanner = useAppStateStore((s) => s.setBanner);
  const { permission, coords, locating, requestPermission, getCurrentLocation, openSettings } = useLocation();
  useSavedPlaces(); // ensure Provider is mounted; places list used by nav only

  // Active location: user location (if granted + fix), else first saved place, else national.
  const activeDivision = useMemo(() => {
    if (coords) {
      const d = divisionForPoint(coords.lat, coords.lng);
      if (d) return d.name;
    }
    return 'Bangladesh';
  }, [coords]);

  const locDotState = useMemo(() => {
    if (locating) return 'locating';
    if (permission === 'denied') return 'denied';
    if (coords) return 'showing';
    return 'idle';
  }, [locating, permission, coords]);

  const actuallyUseLocation = useCallback(async () => {
    if (permission === 'denied') { openSettings(); return; }
    if (permission !== 'granted') {
      const r = await requestPermission();
      if (r !== 'granted') return;
    }
    await getCurrentLocation();
  }, [permission, requestPermission, getCurrentLocation, openSettings]);

  const handleChangeLocation = useCallback(async () => {
    // Quick in-context picker: national summary vs use my location.
    // Full saved-place selector lands in 5b; for 5a we show the user dot state + a CTA.
    if (permission !== 'granted' && permission !== 'denied') {
      const seen = await hasSeenLocationEducation();
      if (!seen) {
        RNAlert.alert(
          'Location access',
          'HazardNet uses your location only on-device to match alerts. It never leaves this device.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Continue', onPress: async () => { await markLocationEducationSeen(); await actuallyUseLocation(); } },
          ],
        );
        return;
      }
    }
    await actuallyUseLocation();
  }, [permission, actuallyUseLocation]);

  const top = useMemo(() => (alerts ? highestAlert(alerts) : null), [alerts]);
  const counts = useAlertCounts(alerts);

  const onRefresh = useCallback(() => { refetch().catch(() => {}); }, [refetch]);

  React.useEffect(() => {
    if (isError) {
      setBanner({ tone: 'error', headline: 'Could not reach HazardNet', body: 'Showing last-known data.' });
    } else {
      setBanner(null);
    }
  }, [isError, setBanner]);

  const openAlert = useCallback((id: string) => {
    nav.navigate('Alerts', { screen: 'AlertDetail', params: { id } });
  }, [nav]);

  if (isLoading && !alerts) {
    return (
      <Screen scroll={false}>
        <TodaySkeleton />
      </Screen>
    );
  }

  const sev = top ? useSeverityVisual(top.level) : useSeverityVisual('NO_ALERT');
  const topExtras = top ? getExtrasFor(top.id) : null;
  const updatedLabel = dataUpdatedAt ? 'Updated ' + formatAge(new Date(dataUpdatedAt).toISOString()) : 'Waiting for data\u2026';

  const cardEdge = top
    ? (top.level === 'SEVERE' ? 'severe' : top.level === 'WARNING' ? 'warning' : top.level === 'WATCH' ? 'watch' : 'allClear')
    : 'allClear';

  const ctaVariant = top
    ? (top.level === 'SEVERE' ? 'danger' : top.level === 'WARNING' ? 'primary' : 'secondary')
    : 'secondary';

  const ctaLabel = top && (top.level === 'SEVERE' || top.level === 'WARNING')
    ? 'See instructions ' + ARROW
    : top ? ('View alert ' + ARROW) : '';

  const topMeta = top
    ? Math.round(top.severity_score * 100) + '% severity · ' + top.district_name
    : 'No active alerts';

  const heroText = top ? sev.shortLabel : 'All clear';
  const heroBody = (topExtras && topExtras.headline) || 'No active alerts for the national summary at this time.';

  return (
    <Screen
      scroll
      refreshing={isRefetching}
      onRefresh={onRefresh}
      edges={['left', 'right', 'bottom']}
    >
      <Box px={SCREEN_H_PADDING} py={16}>
        <VStack space={12}>
          <VStack space={2}>
            <Metadata color="textMuted">MY LOCATION</Metadata>
            <HStack space={8} align="center" justify="space-between">
              <HStack space={8} align="center">
                <Title1>{activeDivision}</Title1>
                <Chip
                  label={locDotState === 'locating' ? 'Locating…' : locDotState === 'showing' ? '📍 You' : locDotState === 'denied' ? '⍉ Denied' : 'National'}
                  severity={locDotState === 'showing' ? 'info' : locDotState === 'denied' ? 'severe' : null}
                />
              </HStack>
              <Button
                variant="ghost"
                size="sm"
                label={locDotState === 'showing' ? 'National' : 'Use my location'}
                accessibilityLabel="Switch location"
                onPress={handleChangeLocation}
              />
            </HStack>
            <Caption color="textMuted">{updatedLabel}</Caption>
          </VStack>

          <Card edge={cardEdge} raised style={{ paddingHorizontal: 20, paddingVertical: 24 }}>
            <VStack space={16}>
              <HStack space={10} align="center">
                <SeverityBadge level={(top && top.level) || 'NO_ALERT'} />
                <Metadata color="textMuted">{topMeta}</Metadata>
              </HStack>
              <DisplayLarge color={sev.color} style={{ lineHeight: 42 }}>{heroText}</DisplayLarge>
              <Body>{heroBody}</Body>

              <VStack space={8}>
                {top ? (
                  <Button
                    variant={ctaVariant as any}
                    size="lg"
                    label={ctaLabel}
                    onPress={() => openAlert(top.id)}
                    accessibilityHint="Opens details for the highest-severity alert"
                  />
                ) : null}
                <Box>
                  <EmergencyCTARow compact />
                </Box>
              </VStack>
            </VStack>
          </Card>

          {alerts && alerts.length > 0 ? (
            <VStack space={10}>
              <HStack space={8} align="center" justify="space-between">
                <Title3>Active alerts</Title3>
                <Caption color="textMuted">{counts.total} total · {counts.severe} severe</Caption>
              </HStack>
              <VStack space={0}>
                {alerts.slice(0, 3).map((a) => (
                  <AlertRow key={a.id} alert={a} unread={a.level === 'SEVERE'} onPress={() => openAlert(a.id)} />
                ))}
              </VStack>
              {alerts.length > 3 ? (
                <Button variant="ghost" size="sm" label={'See all ' + alerts.length + ' alerts ' + ARROW} onPress={() => nav.navigate('Alerts')} />
              ) : null}
            </VStack>
          ) : (
            <Card>
              <ListEmptyState
                icon={'\u2713'}
                headline="No active alerts"
                body="No alerts are published above the WATCH threshold at this time. Pull down to refresh."
                primaryAction={{ label: 'Refresh', onPress: onRefresh }}
              />
            </Card>
          )}

          <Card>
            <VStack space={4}>
              <Metadata color="textMuted">TODAY&apos;S CONDITIONS</Metadata>
              <Caption color="textSecondary">
                Weather summary (7-day) lands in Phase 5. Emergency numbers always work.
              </Caption>
              <HStack space={8} pt={4}>
                {EMERGENCY_CONTACTS.slice(0, 1).map((c) => (
                  <Chip
                    key={c.number}
                    label={'\u260E ' + c.number + ' (' + c.label + ')'}
                    severity="severe"
                    onPress={() => { safeOpenUrl('tel:' + c.number, 'emergency').catch(() => {}); }}
                  />
                ))}
              </HStack>
            </VStack>
          </Card>
        </VStack>

        <DisclaimerFooter />
      </Box>
    </Screen>
  );
}
