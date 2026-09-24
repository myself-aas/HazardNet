/**
 * LocationPermissionEducationSheet — simple bottom-sheet card shown the FIRST
 * time the user taps the recenter button or "use my location" (§10/§12).
 *
 * Explains why we ask (for local severe-weather matching), what data we use,
 * and reassures them that no data leaves the device. Only shows once per
 * install (keyed in AsyncStorage).
 */

import React, { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Box, VStack, HStack } from '../../design-system/primitives';
import { Title3, Body, BodyBold, Caption, Metadata } from '../../design-system/Text';
import { Card } from '../../design-system/Card';
import { Button } from '../../design-system/Button';
import { Chip } from '../../design-system/Chip';

const KEY = 'hazardnet:location-edu:v1';

export async function hasSeenLocationEducation(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(KEY)) === '1'; } catch { return false; }
}

export async function markLocationEducationSeen() {
  try { await AsyncStorage.setItem(KEY, '1'); } catch {}
}

interface Props {
  visible: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

export function LocationPermissionEducationSheet({ visible, onAccept, onDismiss }: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  if (!visible || !ready) return null;
  return (
    <Card>
      <VStack space={10}>
        <HStack align="center" space={8}>
          <Chip label="📍" severity="info" />
          <Title3>Why we ask for location</Title3>
        </HStack>
        <BodyBold>We only use your location to match alerts to where you are right now.</BodyBold>
        <Body color="textSecondary">
          • Low-accuracy GPS is used to pick your nearest division/district.{`\n`}
          • Your location never leaves this device — matching happens on-device.{`\n`}
          • You can deny permission and still use HazardNet in national mode.
        </Body>
        <HStack space={8}>
          <Button variant="secondary" size="md" label="Not now" onPress={onDismiss} />
          <Button variant="primary" size="md" label="Continue" onPress={onAccept} />
        </HStack>
        <Caption color="textMuted" align="center">You can change this later in Settings.</Caption>
      </VStack>
    </Card>
  );
}
