/**
 * Data Status (More → Data Status).
 *
 * Phase 4 screen: shows cached-data age, last online time, cache size info,
 * and a "Clear cache" destructive action.
 */

import React, { useCallback, useState } from 'react';
import { Alert as RNAlert } from 'react-native';
import { Screen } from '../../components/Screen';
import { Box, VStack, HStack } from '../../design-system/primitives';
import { Title1, Title3, Body, Caption, Metadata } from '../../design-system/Text';
import { Card } from '../../design-system/Card';
import { Button } from '../../design-system/Button';
import { useDataState } from '../../hooks/useDataState';
import { useConnectivity } from '../../hooks/useConnectivity';
import { useAlerts } from '../../hooks/useAlerts';
import { clearPersistedCache } from '../../lib/persister';
import { queryClient } from '../../lib/queryClient';
import { QUERY_KEYS } from '@hazardnet/core';
import { describeAge, ageMs } from '@hazardnet/core';
import { SCREEN_H_PADDING } from '../../theme/nativeTokens';

function toneToEdge(t: string): 'severe'|'warning'|'watch'|'allClear'|'info'|null {
  if (t === 'green') return 'allClear';
  if (t === 'red') return 'severe';
  if (t === 'blue' || t === 'neutral') return 'watch';
  if (t === 'amber') return 'warning';
  return null;
}

export function DataStatusScreen() {
  const ds = useDataState();
  const conn = useConnectivity();
  const { dataUpdatedAt, refetch, isRefetching } = useAlerts();
  const [clearing, setClearing] = useState(false);

  const handleClear = useCallback(() => {
    RNAlert.alert(
      'Clear cached data?',
      'This will remove all saved hazard data from this device. Emergency call buttons will still work.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            await clearPersistedCache();
            queryClient.removeQueries({ queryKey: QUERY_KEYS.alerts });
            setClearing(false);
            RNAlert.alert('Cache cleared', 'Next refresh will fetch fresh data from HazardNet.');
          },
        },
      ]
    );
  }, []);

  const handleRefresh = useCallback(() => { refetch().catch(() => {}); }, [refetch]);

  const cachedAge = ageMs(dataUpdatedAt);
  const lastOnlineAge = ageMs(conn.lastOnlineAt);

  return (
    <Screen scroll edges={['left', 'right', 'bottom']}>
      <Box px={SCREEN_H_PADDING} py={16}>
        <VStack space={16}>
          <Title1>Data status</Title1>

          <Card edge={toneToEdge(ds.tone)}>
            <VStack space={6}>
              <Metadata color="textMuted">CURRENT STATE</Metadata>
              <Title3>{ds.headline}</Title3>
              <Body>{ds.body}</Body>
              <Caption color="textMuted">Network: {conn.isOnline ? 'online' : 'offline'}</Caption>
            </VStack>
          </Card>

          <Card>
            <VStack space={8}>
              <Title3>Cache</Title3>
              <Row k="Cached alerts age" v={cachedAge !== null ? describeAge(cachedAge) : '—'} />
              <Row k="Last online" v={lastOnlineAge !== null ? describeAge(lastOnlineAge) + ' ago' : '—'} />
              <Row k="Persist adapter" v="AsyncStorage (7-day grace)" />
              <HStack space={8} pt={8}>
                <Button variant="primary" size="md" label={isRefetching ? 'Refreshing…' : 'Refresh now'} onPress={handleRefresh} disabled={isRefetching || !conn.isOnline} />
                <Button variant="danger" size="md" label="Clear cache" onPress={handleClear} disabled={clearing} />
              </HStack>
            </VStack>
          </Card>

          <Card>
            <VStack space={4}>
              <Metadata color="textMuted">PRIVACY</Metadata>
              <Body>Cached alerts stay on device only. No data is sent to HazardNet except requests to refresh the feed. Clearing cache removes all stored alerts from this device.</Body>
            </VStack>
          </Card>
        </VStack>
      </Box>
    </Screen>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <HStack space={12} justify="space-between">
      <Caption color="textMuted">{k}</Caption>
      <Body>{v}</Body>
    </HStack>
  );
}
