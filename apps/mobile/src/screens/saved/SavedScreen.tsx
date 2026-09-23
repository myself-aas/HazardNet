/**
 * Saved Places (Phase 5) — local-only CRUD + Phase 6 notification education.
 */

import React, { useCallback, useRef, useState } from 'react';
import { Alert as RNAlert, Pressable, ScrollView } from 'react-native';
import { Screen } from '../../components/Screen';
import { Box, VStack, HStack } from '../../design-system/primitives';
import { Title1, BodyBold, Caption } from '../../design-system/Text';
import { Card } from '../../design-system/Card';
import { Button } from '../../design-system/Button';
import { Chip } from '../../design-system/Chip';
import { ListEmptyState } from '../../design-system/EmptyState';
import { Divider } from '../../design-system/primitives';
import { useSavedPlaces } from '../../hooks/useSavedPlaces';
import { useLocation } from '../../hooks/useLocation';
import { useHaptics } from '../../hooks/useHaptics';
import { usePushPermission } from '../../lib/notifications/usePushPermission';
import { SCREEN_H_PADDING } from '../../theme/nativeTokens';
import { useNavigation } from '@react-navigation/native';
import { AddPlaceSheet, type AddMode } from './AddPlaceSheet';
import { hasSeenLocationEducation, markLocationEducationSeen } from '../../components/map/LocationPermissionEducationSheet';
import { hasSeenNotifEducation, markNotifEducationSeen, PermissionEducationSheet as NotifEdu } from '../../components/notifications/PermissionEducationSheet';

type SheetMode = 'closed' | AddMode;

export function SavedScreen() {
  const { places, isReady, addPlace, removePlace, seedDefaults } = useSavedPlaces();
  const { permission, requestPermission, getCurrentLocation, openSettings } = useLocation();
  const { permission: notifPerm, requestPermission: requestNotif } = usePushPermission();
  const { trigger } = useHaptics();
  const nav = useNavigation<any>();
  const [addMode, setAddMode] = useState<SheetMode>('closed');
  const [manualName, setManualName] = useState('');
  const [showNotifEdu, setShowNotifEdu] = useState(false);
  const justAddedRef = useRef(false);

  // After first saved place added, show notification-permission education once.
  React.useEffect(() => {
    if (!isReady || places.length === 0 || !justAddedRef.current) return;
    justAddedRef.current = false;
    if (notifPerm === 'granted') return;
    (async () => {
      const seen = await hasSeenNotifEducation();
      if (!seen) setShowNotifEdu(true);
    })();
  }, [places, isReady, notifPerm]);

  const trackAdd = useCallback((place: any) => {
    justAddedRef.current = true;
    return addPlace(place);
  }, [addPlace]);

  const openSheet = useCallback(() => {
    trigger('selection');
    setAddMode((m) => (m === 'closed' ? 'current' : 'closed'));
  }, [trigger]);

  const acceptNotifEdu = useCallback(async () => {
    await markNotifEducationSeen();
    setShowNotifEdu(false);
    await requestNotif();
  }, [requestNotif]);
  const dismissNotifEdu = useCallback(async () => {
    await markNotifEducationSeen();
    setShowNotifEdu(false);
  }, []);

  const actuallyAddCurrent = useCallback(async () => {
    if (permission === 'denied') { openSettings(); return; }
    let perms: 'unknown' | 'granted' | 'denied' = permission;
    if (perms !== 'granted') perms = await requestPermission();
    if (perms !== 'granted') return;
    trigger('confirmation');
    const fix = await getCurrentLocation();
    if (!fix) { RNAlert.alert('Could not get location', 'Try again outside or add a place manually.'); return; }
    trackAdd({
      label: 'Current location',
      kind: 'other' as const,
      location: { lat: fix.lat, lng: fix.lng },
      placeName: 'Current location',
    });
    setAddMode('closed');
  }, [permission, requestPermission, getCurrentLocation, trackAdd, openSettings, trigger]);

  const handleAddCurrent = useCallback(async () => {
    if (permission === 'granted' || permission === 'denied') { await actuallyAddCurrent(); return; }
    const seen = await hasSeenLocationEducation();
    if (seen) { await actuallyAddCurrent(); return; }
    RNAlert.alert(
      'Location access',
      'HazardNet uses your location only on-device to match alerts. It never leaves this device.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Continue', onPress: async () => { await markLocationEducationSeen(); await actuallyAddCurrent(); } },
      ],
    );
  }, [permission, actuallyAddCurrent]);

  const handleAddManual = useCallback(() => {
    if (!manualName.trim()) return;
    const name = manualName.trim();
    const low = name.toLowerCase();
    trigger('confirmation');
    trackAdd({
      label: name,
      kind: low === 'home' ? 'home' : low === 'work' ? 'work' : 'other' as const,
      location: null,
      placeName: name,
    });
    setManualName('');
    setAddMode('closed');
  }, [manualName, trackAdd, trigger]);

  const confirmRemove = useCallback((id: string, label: string) => {
    RNAlert.alert(`Remove ${label}?`, 'You will stop receiving notifications for this place.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { trigger('warning'); removePlace(id); } },
    ]);
  }, [removePlace, trigger]);

  const listContent = (
    <VStack space={16}>
      <Title1>Saved places</Title1>
      <Card padded={false}>
        <Box px={16}>
          {places.map((p, i) => (
            <React.Fragment key={p.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => nav.navigate('SavedPlaceDetail', { id: p.id })}
                onLongPress={() => confirmRemove(p.id, p.label)}
                accessibilityRole="button"
                style={({ pressed }) => ({ paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
              >
                <HStack space={12} align="center" justify="space-between">
                  <Box flex={1}>
                    <BodyBold>{p.label}</BodyBold>
                    <Caption color="textMuted">
                      {p.notes
                        ? p.notes
                        : p.location
                          ? `${p.location.lat.toFixed(2)}, ${p.location.lng.toFixed(2)}`
                          : p.districtId === 'bd-national' ? 'National' : p.districtId}
                    </Caption>
                  </Box>
                  <Chip
                    label={p.notifications.enabled ? 'Alerts on' : 'Off'}
                    severity={p.notifications.enabled ? 'severe' : null}
                  />
                </HStack>
              </Pressable>
            </React.Fragment>
          ))}
        </Box>
      </Card>

      <Button variant="primary" size="md" label="+ Add a place" onPress={openSheet} />

      {addMode !== 'closed' ? (
        <AddPlaceSheet
          mode={addMode}
          onModeChange={(m) => setAddMode(m)}
          manualName={manualName}
          onManualNameChange={setManualName}
          onUseCurrent={handleAddCurrent}
          onSaveManual={handleAddManual}
          permission={permission}
        />
      ) : null}

      <Caption align="center" color="textMuted">
        Saved places stay on this device. Long-press a place to delete.
      </Caption>
    </VStack>
  );

  const emptyContent = (
    <Box px={SCREEN_H_PADDING} py={24} flex={1} justify="center">
      <ListEmptyState
        icon="★"
        headline="Saved places"
        body="Save home, work, and family locations to get alerts specific to those places. Data stays on this device."
        primaryAction={{ label: 'Add your first place', onPress: () => { seedDefaults(); openSheet(); } }}
      />
    </Box>
  );

  return (
    <Screen scroll={false} edges={['left', 'right', 'bottom']}>
      {showNotifEdu ? (
        <Box px={SCREEN_H_PADDING} pt={12}>
          <NotifEdu visible onAccept={acceptNotifEdu} onDismiss={dismissNotifEdu} />
        </Box>
      ) : null}
      {places.length === 0 && isReady ? emptyContent : (
        <ScrollView contentContainerStyle={{ padding: SCREEN_H_PADDING, paddingBottom: 32 }}>
          {listContent}
        </ScrollView>
      )}
    </Screen>
  );
}
