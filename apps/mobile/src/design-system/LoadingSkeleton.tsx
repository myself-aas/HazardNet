/**
 * Skeleton loaders (animated with native driver where possible).
 *
 * Per plan §7: skeleton shell, not spinner; non-blocking when cached data exists.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';
import { Box } from './primitives';
import { useTheme } from '../theme/ThemeProvider';

export interface SkeletonProps {
  w?: number | string;
  h?: number | string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export const Skeleton: React.FC<SkeletonProps> = ({ w = '100%', h = 16, radius = 2, style }) => {
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: w as number,
          height: h as number,
          borderRadius: radius,
          backgroundColor: theme.colors.skeleton,
          opacity,
        } as unknown as Animated.AnimatedProps<ViewStyle>,
        style,
      ]}
    />
  );
};

/** Skeleton layout matching the Today severity card (160pt hero + list). */
export const TodaySkeleton: React.FC = () => (
  <Box px={16} py={16}>
    <Skeleton h={160} style={{ marginBottom: 16 }} />
    <Skeleton h={20} w="70%" style={{ marginBottom: 8 }} />
    <Skeleton h={14} w="90%" style={{ marginBottom: 6 }} />
    <Skeleton h={14} w="80%" style={{ marginBottom: 16 }} />
    <Skeleton h={40} style={{ marginBottom: 12 }} />
    <Skeleton h={64} style={{ marginBottom: 8 }} />
    <Skeleton h={64} />
  </Box>
);

/** N skeleton rows for list loading. */
export const SkeletonRows: React.FC<{ n?: number; rowHeight?: number }> = ({ n = 6, rowHeight = 72 }) => (
  <Box px={16} py={8}>
    {Array.from({ length: n }).map((_, i) => (
      <Box key={i} py={10} style={{ height: rowHeight, justifyContent: 'center' }}>
        <Skeleton h={14} w="40%" style={{ marginBottom: 6 }} />
        <Skeleton h={16} w="90%" style={{ marginBottom: 4 }} />
        <Skeleton h={12} w="30%" />
      </Box>
    ))}
  </Box>
);
