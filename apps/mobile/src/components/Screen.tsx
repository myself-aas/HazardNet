/**
 * Screen shell — safe-area aware, handles banners, scroll vs non-scroll,
 * background color. All tab screens compose through this so the Chrome is
 * consistent.
 *
 * Phase 4: auto-renders the data-state-derived banner at the top of every
 * Screen when the app is offline/stale/delayed/partial/service-down. Callers
 * can pass an explicit `banner` prop to override (e.g., for success toasts).
 */

import React from 'react';
import { ScrollView, View, ViewStyle, StyleProp, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Box } from '../design-system/primitives';
import { Banner, type BannerTone } from '../design-system/Banner';
import { useTheme } from '../theme/ThemeProvider';
import { useAppStateStore } from '../state/appStateStore';
import { useDataState } from '../hooks/useDataState';
import { type DataState } from '@hazardnet/core';

/** Map core DataState → Banner tone. */
function stateToTone(s: DataState): BannerTone | null {
  switch (s) {
    case 'loaded':
    case 'loadedActive':
      return null; // no banner for healthy states
    case 'loading': return null;
    case 'partial':
    case 'stale': return 'warning';
    case 'delayed':
    case 'serviceUnavailable':
    case 'sourceFailure':
    case 'appError': return 'error';
    case 'offlineCached': return 'info';
    case 'offlineNoCache': return 'error';
    case 'permissionDenied': return 'info';
    default: return null;
  }
}

const ICON_FOR_STATE: Partial<Record<DataState, string>> = {
  offlineCached: '◐',
  offlineNoCache: '!',
  stale: '◔',
  delayed: '!',
  serviceUnavailable: '!',
  partial: '◐',
  sourceFailure: '!',
  permissionDenied: '◉',
  appError: '!',
};

export interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  banner?: { tone: BannerTone; headline: string; body?: string } | null;
  onBannerPress?: () => void;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  bg?: string;
  /** Set true to suppress the auto data-state banner (used on DataStatus itself). */
  hideStateBanner?: boolean;
}

export const Screen: React.FC<ScreenProps> = ({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  banner,
  onBannerPress,
  style,
  edges = ['top', 'left', 'right'],
  bg,
  hideStateBanner = false,
}) => {
  const { theme } = useTheme();
  const globalBanner = useAppStateStore((s) => s.activeBanner);
  const nav = useNavigation<any>();
  const ds = useDataState();

  // Build automatic banner from data state, unless caller passed an explicit one
  // (which takes priority) or hideStateBanner is true.
  let resolvedBanner = banner ?? globalBanner;
  if (!resolvedBanner && !hideStateBanner) {
    const tone = stateToTone(ds.state);
    if (tone) {
      resolvedBanner = {
        tone,
        headline: ds.headline,
        body: ds.body,
      };
    }
  }

  const handleBannerPress = onBannerPress ?? (() => {
    try { nav.navigate('More', { screen: 'DataStatus' }); } catch { /* tab may not be ready */ }
  });

  const content = scroll ? (
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.colors.textSecondary as string} /> : undefined}
      contentContainerStyle={[{ flexGrow: 1 }, style as ViewStyle]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, style as ViewStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: bg ?? (theme.colors.background as string) }}>
      {resolvedBanner ? (
        <Banner
          tone={resolvedBanner.tone}
          headline={resolvedBanner.headline}
          body={resolvedBanner.body}
          onPress={handleBannerPress}
          icon={ICON_FOR_STATE[ds.state] ?? '!'}
        />
      ) : null}
      <Box flex={1} bg={bg ?? 'background'}>
        {content}
      </Box>
    </SafeAreaView>
  );
};
