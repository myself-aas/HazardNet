/**
 * Map screen — Phase 5.
 *
 * Implementation:
 *   - SVG fallback map (BangladeshMap) renders 8 division polygons colored
 *     by highest active alert severity. Division presses open a bottom sheet
 *     listing the relevant alerts (synchronized viewport list per §5).
 *   - Recenter button asks When-in-Use permission on first tap, then drops
 *     a blue dot on the user's location and animates to it.
 *   - "Layers" button opens a simple layer menu (future: MapLibre controls).
 *   - MapLibre-native integration is deferred to Phase 5b (gradle/pod build
 *     cannot be verified in this sandbox); the SVG fallback is the guaranteed
 *     offline renderer so the map tab is never blank.
 *   - Offline/stale/delayed banners appear automatically via Screen (Phase 4).
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Dimensions, LayoutChangeEvent, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../components/Screen';
import { NATIVE_RADIUS } from '../../theme/nativeTokens';
import { Box, VStack, HStack } from '../../design-system/primitives';
import { Title3, Body, Caption, Metadata } from '../../design-system/Text';
import { Button } from '../../design-system/Button';
import { Icon } from '../../components/Icon';
import { Card } from '../../design-system/Card';
import { Chip } from '../../design-system/Chip';
import { BangladeshMap } from '../../components/map/BangladeshMap';
import { useAlerts } from '../../hooks/useAlerts';
import { useLocation } from '../../hooks/useLocation';
import { useTheme } from '../../theme/ThemeProvider';
import { type Division } from '../../lib/geo/divisions';
import { AlertRow } from '../../components/alerts/AlertRow';
import { useHaptics } from '../../hooks/useHaptics';
import { EmergencyCTARow } from '../../components/alerts/EmergencyCTA';
import { LocationPermissionEducationSheet, hasSeenLocationEducation, markLocationEducationSeen } from '../../components/map/LocationPermissionEducationSheet';
import { MapToolsSheet } from '../../components/map/MapToolsSheet';
import { useOrientationLock } from '../../hooks/useOrientationLock';

const { width: SCREEN_W } = Dimensions.get('window');

export function MapScreen() {
  useOrientationLock('all'); // Map allows landscape per Phase 8 plan.
  const { theme } = useTheme();
  const nav = useNavigation<any>();
  const { data: alerts = [] } = useAlerts();
  const { permission, coords, locating, requestPermission, getCurrentLocation, openSettings } = useLocation();
  const { trigger } = useHaptics();
  const [size, setSize] = useState({ w: SCREEN_W, h: Math.round(SCREEN_W * 1.3) });
  const [selectedDiv, setSelectedDiv] = useState<Division | null>(null);
  const [showTools, setShowTools] = useState(false);
  const [showDivisions, setShowDivisions] = useState(true);
  const [showAlerts, setShowAlerts] = useState(true);
  const [showLocEdu, setShowLocEdu] = useState(false);
  const alertsForDiv = useMemo(() => {
    if (!selectedDiv) return [];
    return alerts.filter((a) => a.district_name.toLowerCase().includes(selectedDiv.id) || a.district_name === selectedDiv.name);
  }, [alerts, selectedDiv]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    setSize({ w: width, h: Math.max(width * 1.2, 320) });
  }, []);

  const doRecenter = useCallback(async () => {
    if (permission === 'denied') { openSettings(); return; }
    if (permission !== 'granted') {
      const result = await requestPermission();
      if (result !== 'granted') return;
    }
    trigger('selection');
    await getCurrentLocation();
  }, [permission, requestPermission, getCurrentLocation, openSettings, trigger]);

  const handleRecenter = useCallback(async () => {
    if (permission === 'granted' || permission === 'denied') { await doRecenter(); return; }
    // First-time unknown: gate with education sheet (in-context per §10/§12).
    const seen = await hasSeenLocationEducation();
    if (seen) { await doRecenter(); return; }
    setShowLocEdu(true);
  }, [permission, doRecenter]);

  const acceptLocEdu = useCallback(async () => {
    await markLocationEducationSeen();
    setShowLocEdu(false);
    await doRecenter();
  }, [doRecenter]);

  const dismissLocEdu = useCallback(async () => {
    await markLocationEducationSeen();
    setShowLocEdu(false);
  }, []);

  const handleDivisionPress = useCallback((d: Division) => {
    trigger('selection');
    setSelectedDiv(d);
  }, [trigger]);

  const openAlert = useCallback((id: string) => {
    nav.navigate('Alerts', { screen: 'AlertDetail', params: { id } });
  }, [nav]);

  const locationDot = useMemo(() => (coords ? { lat: coords.lat, lng: coords.lng } : null), [coords]);

  return (
    <Screen scroll={false} bg="surfaceTint" edges={['left', 'right', 'bottom']}>
      <Box flex={1} onLayout={onLayout} style={{ position: 'relative' }}>
        <BangladeshMap
          width={size.w}
          height={size.h}
          alerts={alerts}
          userLocation={locationDot}
          onDivisionPress={handleDivisionPress}
          showDivisions={showDivisions}
          showAlertMarkers={showAlerts}
        />

        {/* Legend */}
        <Box px={16} py={8} style={{ position: 'absolute', left: 12, bottom: 12, backgroundColor: theme.colors.surface as string, borderRadius: NATIVE_RADIUS.control, padding: 8 }}>
          <VStack space={4}>
            <Metadata color="textMuted">SEVERITY</Metadata>
            <HStack space={8} align="center"><Box w={10} h={10} bg={theme.colors.severeSolid} /><Caption>Severe</Caption></HStack>
            <HStack space={8} align="center"><Box w={10} h={10} bg={theme.colors.warningSolid} /><Caption>Warning</Caption></HStack>
            <HStack space={8} align="center"><Box w={10} h={10} bg={theme.colors.watchSolid} /><Caption>Watch</Caption></HStack>
            <HStack space={8} align="center"><Box w={10} h={10} bg={theme.colors.allClearSolid} /><Caption>No alerts</Caption></HStack>
          </VStack>
        </Box>

        {/* One labelled control instead of two glyph buttons: `◎` and `⌾` were only named in an
            accessibility label, so a sighted user had to guess what they did (backlog 8). */}
        <Box style={{ position: 'absolute', top: 16, right: 16 }}>
          <Button
            variant={showTools || coords ? 'primary' : 'secondary'}
            size="sm"
            label="Map layers"
            leadingIcon={<Icon name="Layers" size="meta" color={theme.colors.textPrimary} />}
            onPress={() => { trigger('selection'); setShowTools((v) => !v); }}
          />
        </Box>

        {showLocEdu ? (
          <Box style={{ position: 'absolute', left: 12, right: 60, top: 12 }}>
            <LocationPermissionEducationSheet visible onAccept={acceptLocEdu} onDismiss={dismissLocEdu} />
          </Box>
        ) : null}

        <MapToolsSheet
          visible={showTools}
          onClose={() => setShowTools(false)}
          locationState={
            permission === 'denied' ? 'denied'
              : locating ? 'locating'
                : coords ? 'following' : 'idle'
          }
          onRecenter={handleRecenter}
          showDivisions={showDivisions}
          onToggleDivisions={setShowDivisions}
          showAlerts={showAlerts}
          onToggleAlerts={setShowAlerts}
        />

        {/* Bottom sheet: division's alerts */}
        {selectedDiv ? (
          <Box
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              backgroundColor: theme.colors.background as string,
              borderTopLeftRadius: 16, borderTopRightRadius: 16,
              paddingTop: 12, paddingHorizontal: 16, paddingBottom: 24,
              maxHeight: '55%',
            }}
          >
            <VStack space={10}>
              <HStack space={12} justify="space-between" align="center">
                <Title3>{selectedDiv.name}</Title3>
                <Pressable accessibilityRole="button" accessibilityLabel="Close division details" onPress={() => setSelectedDiv(null)} hitSlop={10}>
                  <Icon name="X" size="control" color={theme.colors.textMuted} />
                </Pressable>
              </HStack>
              {alertsForDiv.length > 0 ? (
                <VStack space={0}>
                  {alertsForDiv.map((a) => (
                    <AlertRow key={a.id} alert={a} onPress={() => openAlert(a.id)} />
                  ))}
                </VStack>
              ) : (
                <Body color="textSecondary">No active alerts for {selectedDiv.name}. Showing data for all of Bangladesh.</Body>
              )}
              <Box pt={4}>
                <EmergencyCTARow compact />
              </Box>
            </VStack>
          </Box>
        ) : null}
      </Box>
    </Screen>
  );
}
