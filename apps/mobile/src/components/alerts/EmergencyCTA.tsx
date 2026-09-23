/**
 * Emergency call/link chips — 48dp tall, horizontal scrollable.
 *
 * These are the thumb-zone primary actions. Tel: links always work
 * (including offline and when JS has errored).
 */

import React from 'react';
import { ScrollView } from 'react-native';
import { HStack, Box } from '../../design-system/primitives';
import { Text } from '../../design-system/Text';
import { Button } from '../../design-system/Button';
import { EMERGENCY_CONTACTS, OFFICIAL_DISCLAIMER } from '@hazardnet/core';
import { safeOpenUrl } from '../../lib/security/openUrl';

function openLink(url: string) { safeOpenUrl(url).catch(() => {}); }

export interface EmergencyCTAProps { compact?: boolean; }

export const EmergencyCTARow: React.FC<EmergencyCTAProps> = ({ compact = false }) => {
  const contacts = compact ? EMERGENCY_CONTACTS.slice(0, 2) : EMERGENCY_CONTACTS;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
      <HStack space={8}>
        {contacts.map((c) => (
          <Button
            key={c.number}
            variant={c.number === '999' ? 'danger' : 'secondary'}
            size="md"
            label={`☎  ${c.number}`}
            onPress={() => openLink(`tel:${c.number}`)}
            accessibilityLabel={`Call ${c.label} at ${c.number}`}
          />
        ))}
        <Button
          variant="secondary"
          size="md"
          label="BMD"
          onPress={() => openLink('https://bmd.gov.bd')}
          accessibilityLabel="Open Bangladesh Meteorological Department website"
        />
        <Button
          variant="secondary"
          size="md"
          label="FFWC"
          onPress={() => openLink('https://ffwc.gov.bd')}
          accessibilityLabel="Open Flood Forecasting and Warning Centre website"
        />
      </HStack>
    </ScrollView>
  );
};

export const DisclaimerFooter: React.FC = () => (
  <Box px={16} py={12}>
    <Text role="caption" color="textMuted">{OFFICIAL_DISCLAIMER}</Text>
  </Box>
);
