/**
 * Alerts list — FlashList with search, filter chips, swipe actions,
 * and all zero/error/stale/offline states.
 *
 * Phase 3 uses mock data via useAlerts(); pulls to refresh; FlashList for
 * virtualization (no ScrollView+.map). Real pagination lands with Phase 4/5.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { RefreshControl, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../components/Screen';
import { Box, VStack, HStack } from '../../design-system/primitives';
import { Title1, Caption } from '../../design-system/Text';
import { SearchBar } from '../../design-system/SearchBar';
import { Chip } from '../../design-system/Chip';
import { AlertSwipeableRow } from '../../components/alerts/AlertSwipeableRow';
import { ALERT_ROW_HEIGHT } from '../../components/alerts/AlertRow';
import { SkeletonRows } from '../../design-system/LoadingSkeleton';
import { ListEmptyState } from '../../design-system/EmptyState';
import { useAlerts, useAlertCounts } from '../../hooks/useAlerts';
import type { AlertItemType } from '@hazardnet/core';
import { SCREEN_H_PADDING } from '../../theme/nativeTokens';
import { useHaptics } from '../../hooks/useHaptics';

type FilterKey = 'all' | 'severe' | 'warning' | 'watch';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'severe', label: 'Severe' },
  { key: 'warning', label: 'Warning' },
  { key: 'watch', label: 'Watch' },
];

export function AlertsScreen() {
  const nav = useNavigation<any>();
  const { data: alerts, isLoading, isError, refetch, isRefetching } = useAlerts();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const { triggerForAlert } = useHaptics();

  const toggleSaved = useCallback((id: string) => {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const filtered = useMemo<AlertItemType[]>(() => {
    if (!alerts) return [];
    const q = query.trim().toLowerCase();
    return alerts.filter((a) => {
      if (filter !== 'all' && a.level.toLowerCase() !== filter) return false;
      if (!q) return true;
      return (
        a.district_name.toLowerCase().includes(q) ||
        a.hazard_type.toLowerCase().includes(q)
      );
    });
  }, [alerts, query, filter]);

  const counts = useAlertCounts(alerts);

  const openAlert = useCallback((id: string) => {
    nav.navigate('AlertDetail', { id });
  }, [nav]);

  const onRefresh = useCallback(() => { refetch().catch(() => {}); }, [refetch]);

  const renderItem = useCallback(({ item }: { item: AlertItemType }) => (
    <AlertSwipeableRow
      alert={item}
      saved={saved.has(item.id)}
      onSave={toggleSaved}
      onPress={() => { triggerForAlert(item.level); openAlert(item.id); }}
    />
  ), [openAlert, saved, toggleSaved, triggerForAlert]);

  const keyExtractor = useCallback((item: AlertItemType) => item.id, []);

  // Header: search + filter chips
  const ListHeader = (
    <Box px={SCREEN_H_PADDING} pt={12} pb={8}>
      <VStack space={12}>
        <Title1>Alerts</Title1>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search district or hazard…" />
        <HStack space={8}>
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={`${f.label}${f.key !== 'all' ? ` (${countsFor(f.key, counts)})` : ''}`}
              selected={filter === f.key}
              severity={f.key === 'severe' ? 'severe' : f.key === 'warning' ? 'warning' : f.key === 'watch' ? 'watch' : null}
              onPress={() => setFilter(f.key)}
            />
          ))}
        </HStack>
      </VStack>
    </Box>
  );

  if (isLoading && !alerts) {
    return (
      <Screen scroll={false}>
        {ListHeader}
        <SkeletonRows n={8} />
      </Screen>
    );
  }

  if (isError && !alerts) {
    return (
      <Screen>
        <Box px={SCREEN_H_PADDING} pt={32}>
          <ListEmptyState
            icon="!"
            headline="Could not reach HazardNet"
            body="Check your connection and try again."
            primaryAction={{ label: 'Retry', onPress: onRefresh }}
          />
        </Box>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} edges={['left', 'right', 'bottom']}>
      <FlashList
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        estimatedItemSize={ALERT_ROW_HEIGHT}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <Box pt={24}>
            <ListEmptyState
              icon={query ? '○' : '✓'}
              headline={query ? 'No matching alerts' : 'No active alerts'}
              body={query ? `No alerts match "${query}". Try a different term.` : 'No alerts are published above the WATCH threshold right now.'}
              primaryAction={query ? { label: 'Clear search', onPress: () => setQuery('') } : { label: 'Refresh', onPress: onRefresh }}
            />
          </Box>
        }
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        // Divider between rows
        ItemSeparatorComponent={Divider}
      />
    </Screen>
  );
}

function Divider() {
  return <Box h={StyleSheetHairline()} bg="hairline" />;
}

function countsFor(key: FilterKey, c: { severe: number; warning: number; watch: number }): number {
  if (key === 'severe') return c.severe;
  if (key === 'warning') return c.warning;
  if (key === 'watch') return c.watch;
  return c.severe + c.warning + c.watch;
}

function StyleSheetHairline() {
  return StyleSheet.hairlineWidth;
}
