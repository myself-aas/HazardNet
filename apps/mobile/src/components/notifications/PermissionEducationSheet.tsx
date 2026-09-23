/**
 * PermissionEducationSheet — shown the FIRST time the user is asked to
 * enable notifications (after they save their first place, per Phase 6 plan).
 * Never shown on launch. Dismissal is persisted in AsyncStorage.
 */

import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VStack, HStack } from '../../design-system/primitives';
import { Title3, Body, BodyBold, Caption } from '../../design-system/Text';
import { Card } from '../../design-system/Card';
import { Button } from '../../design-system/Button';
import { Chip } from '../../design-system/Chip';

const KEY = 'hazardnet:notif-edu:v1';

export async function hasSeenNotifEducation(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(KEY)) === '1'; } catch { return false; }
}

export async function markNotifEducationSeen() {
  try { await AsyncStorage.setItem(KEY, '1'); } catch {}
}

interface Props {
  visible: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

export function PermissionEducationSheet({ visible, onAccept, onDismiss }: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  if (!visible || !ready) return null;
  return (
    <Card>
      <VStack space={10}>
        <HStack align="center" space={8}>
          <Chip label="🔔" severity="warning" />
          <Title3>Turn on alerts</Title3>
        </HStack>
        <BodyBold>Get notified when SEVERE weather affects your saved places.</BodyBold>
        <Body color="textSecondary">
          • Sound + vibration for severe cyclones, floods, and cold waves.{`\n`}
          • Quiet hours overnight — SEVERE alerts bypass quiet hours.{`\n`}
          • Tap a notification to jump straight to the alert.
        </Body>
        <HStack space={8}>
          <Button variant="secondary" size="md" label="Not now" onPress={onDismiss} />
          <Button variant="primary" size="md" label="Enable alerts" onPress={onAccept} />
        </HStack>
        <Caption color="textMuted" align="center">You can turn this off any time in Settings.</Caption>
      </VStack>
    </Card>
  );
}
