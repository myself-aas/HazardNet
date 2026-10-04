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
import { useReducedMotionPreference } from '../../hooks/useReducedMotionPreference';
import { NATIVE_RADIUS } from '../../theme/nativeTokens';
import { Icon } from '../Icon';
import type { ForegroundBanner } from '../../state/foregroundBannerStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef } from 'react';

interface Props {
  banner: ForegroundBanner | null;
  onDismiss: () => void;
}

export function ForegroundNotificationBanner({ banner, onDismiss }: Props) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotionPreference();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-200)).current;

  useEffect(() => {
    if (reduceMotion) {
      translateY.stopAnimation();
      translateY.setValue(banner ? 0 : -200);
      return;
    }

    const animation = Animated.spring(translateY, {
      toValue: banner ? 0 : -200,
      useNativeDriver: true,
      friction: 8,
    });
    animation.start();
    return () => animation.stop();
  }, [banner, reduceMotion, translateY]);

  if (!banner) return null;

  const color = banner.channel === 'critical' ? theme.colors.severeSolid
    : banner.channel === 'warning' ? theme.colors.warningSolid
    : banner.channel === 'watch' ? theme.colors.watchSolid
    : theme.colors.interactive;

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
      <Box
        px={14}
        py={12}
        style={{
          backgroundColor: theme.colors.surface as string,
          borderRadius: NATIVE_RADIUS.media,
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
          <Pressable
            onPress={banner.onPress ?? onDismiss}
            accessibilityRole="button"
            accessibilityLabel={`${banner.title}. ${banner.body}`}
            style={{ flex: 1 }}
          >
            <VStack space={2}>
              <HStack space={6} align="center">
                <Box w={8} h={8} bg={color as string} style={{ borderRadius: NATIVE_RADIUS.chip }} />
                <Metadata color="textMuted" style={{ textTransform: 'uppercase' as const }}>{banner.channel}</Metadata>
              </HStack>
              <BodyBold>{banner.title}</BodyBold>
              <Caption color="textSecondary">{banner.body}</Caption>
            </VStack>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={onDismiss} hitSlop={12}>
            <Icon name="X" size="meta" color={theme.colors.textMuted} />
          </Pressable>
        </HStack>
      </Box>
    </Animated.View>
  );
}
