/**
 * ForegroundNotificationBanner — transient in-app toast shown at the top of
 * the screen when an alert arrives while the app is open. Accessibility:
 * announces via aria-live equivalent (accessibilityLiveRegion).
 */

import React from 'react';
import { Animated, Pressable } from 'react-native';
import { VStack, HStack, Box } from '../../design-system/primitives';
import { BodyBold, Caption, Metadata } from '../../design-system/Text';
import { useTheme } from '../../theme/ThemeProvider';
import type { ForegroundBanner } from '../../state/foregroundBannerStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef } from 'react';

interface Props {
  banner: ForegroundBanner | null;
  onDismiss: () => void;
}

export function ForegroundNotificationBanner({ banner, onDismiss }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-200)).current;

  useEffect(() => {
    if (banner) {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
    } else {
      Animated.spring(translateY, { toValue: -200, useNativeDriver: true, friction: 8 }).start();
    }
  }, [banner, translateY]);

  if (!banner) return null;

  const color = banner.channel === 'critical' ? theme.colors.severe
    : banner.channel === 'warning' ? theme.colors.warning
    : banner.channel === 'watch' ? theme.colors.watch
    : theme.colors.primaryAction;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 12,
        right: 12,
        zIndex: 999,
        transform: [{ translateY }],
      }}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <Pressable onPress={banner.onPress ?? onDismiss}>
        <Box
          px={14}
          py={12}
          style={{
            backgroundColor: theme.colors.surface as string,
            borderRadius: 12,
            borderLeftWidth: 4,
            borderLeftColor: color as string,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          }}
        >
          <HStack space={10} align="flex-start" justify="space-between">
            <VStack space={2} flex={1}>
              <HStack space={6} align="center">
                <Box w={8} h={8} bg={color as string} style={{ borderRadius: 4 }} />
                <Metadata color="textMuted" style={{ textTransform: 'uppercase' as const }}>{banner.channel}</Metadata>
              </HStack>
              <BodyBold>{banner.title}</BodyBold>
              <Caption color="textSecondary">{banner.body}</Caption>
            </VStack>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} hitSlop={12}>
              <Metadata color="textMuted">✕</Metadata>
            </Pressable>
          </HStack>
        </Box>
      </Pressable>
    </Animated.View>
  );
}
