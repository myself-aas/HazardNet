/**
 * SavedPlaceDetail — per-place notification prefs, hazard toggles, quiet hours.
 * Phase 5 MVP.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Alert as RNAlert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Screen } from '../../components/Screen';
import { Box, VStack, HStack } from '../../design-system/primitives';
import { Title1, Title3, Body, BodyBold, Caption, Metadata } from '../../design-system/Text';
import { Card } from '../../design-system/Card';
import { Chip } from '../../design-system/Chip';
import { Button } from '../../design-system/Button';
import { Switch } from '../../design-system/Switch';
import { useSavedPlaces } from '../../hooks/useSavedPlaces';
import { SCREEN_H_PADDING } from '../../theme/nativeTokens';
import { HAZARD_TYPES } from '@hazardnet/core';

export function SavedPlaceDetailScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { id } = route.params as { id: string };
  const { places, updatePlace, removePlace } = useSavedPlaces();
  const place = places.find((p) => p.id === id);

  const [enabled, setEnabled] = useState(!!place?.notifications.enabled);
  const [quietHoursOn, setQuietHoursOn] = useState(!!place?.notifications.quietHours.enabled);
  const [hazards, setHazards] = useState<Set<string>>(() => {
    if (!place) return new Set();
    const prefs = place.notifications;
    // prefs.hazards is a record: missing entries = default ON.
    const set = new Set<string>();
    for (const h of HAZARD_TYPES) {
      const val = (prefs.hazards as Record<string, boolean>)[h];
      if (val === false) continue;
      set.add(h);
    }
    return set;
  });

  useEffect(() => { try { nav.setOptions({ title: place?.label ?? 'Place' }); } catch {} }, [nav, place]);

  const toggleHazard = useCallback((h: string) => {
    setHazards((prev) => {
      const next = new Set(prev);
      if (next.has(h)) next.delete(h); else next.add(h);
      return next;
    });
  }, []);

  const save = useCallback(() => {
    if (!place) return;
    const hazardsRec: Record<string, boolean> = {};
    for (const h of HAZARD_TYPES) hazardsRec[h] = hazards.has(h);
    updatePlace(place.id, {
      notifications: {
        ...place.notifications,
        enabled,
        hazards: hazardsRec,
        quietHours: { ...place.notifications.quietHours, enabled: quietHoursOn },
      },
    });
    nav.goBack();
  }, [place, enabled, quietHoursOn, hazards, updatePlace, nav]);

  const remove = useCallback(() => {
    if (!place) return;
    RNAlert.alert(`Remove ${place.label}?`, 'You will stop receiving notifications for this place.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { removePlace(place.id); nav.goBack(); } },
    ]);
  }, [place, removePlace, nav]);

  if (!place) {
    return <Screen><Box px={16} py={24}><Body>Place not found.</Body></Box></Screen>;
  }

  const locationSummary = useMemo(() => {
    if (place.notes) return place.notes;
    if (place.location) return `${place.location.lat.toFixed(3)}, ${place.location.lng.toFixed(3)}`;
    return place.districtId === 'bd-national' ? 'National' : place.districtId;
  }, [place]);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Box px={SCREEN_H_PADDING} py={16} flex={1}>
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
          <VStack space={16}>
            <Title1>{place.label}</Title1>
            <Caption color="textMuted">{locationSummary}</Caption>

            <Card>
              <VStack space={10}>
                <HStack justify="space-between" align="center">
                  <VStack space={2} flex={1}>
                    <BodyBold>Alerts for this place</BodyBold>
                    <Caption color="textMuted">Push notifications when alerts are issued for this location.</Caption>
                  </VStack>
                  <Switch value={enabled} onValueChange={setEnabled} />
                </HStack>
              </VStack>
            </Card>

            <Card>
              <VStack space={10}>
                <Title3>Hazard types</Title3>
                <Caption color="textMuted">Select which hazards to notify you about.</Caption>
                <HStack style={{ flexWrap: 'wrap' }} space={8}>
                  {HAZARD_TYPES.map((h) => {
                    const on = hazards.has(h);
                    return (
                      <Chip
                        key={h}
                        label={h.replace(/_/g, ' ')}
                        selected={on}
                        severity={on ? 'warning' : null}
                        onPress={() => toggleHazard(h)}
                      />
                    );
                  })}
                </HStack>
              </VStack>
            </Card>

            <Card>
              <VStack space={10}>
                <HStack justify="space-between" align="center">
                  <VStack space={2} flex={1}>
                    <BodyBold>Quiet hours</BodyBold>
                    <Caption color="textMuted">Suppress non-critical alerts overnight.</Caption>
                  </VStack>
                  <Switch value={quietHoursOn} onValueChange={setQuietHoursOn} />
                </HStack>
                {quietHoursOn ? (
                  <HStack space={8}>
                    <Metadata color="textMuted">22:00 – 07:00</Metadata>
                    <Caption color="textMuted">(SEVERE alerts bypass quiet hours)</Caption>
                  </HStack>
                ) : null}
              </VStack>
            </Card>

            <Button variant="primary" size="lg" label="Save" onPress={save} />
            <Button variant="danger" size="md" label="Remove this place" onPress={remove} />
          </VStack>
        </ScrollView>
      </Box>
    </Screen>
  );
}
