/**
 * Apple chip and alert-severity badge primitives.
 *
 * Small chips use an 8-unit surrounding hit area in addition to their visual
 * bounds. Severity badges keep fill, foreground, shared icon and word separate
 * so status remains legible in dark mode, grayscale and high contrast.
 */

import React from 'react';
import { Pressable, ViewStyle, StyleProp } from 'react-native';
import { Box, HStack } from './primitives';
import { Text } from './Text';
import { useTheme } from '../theme/ThemeProvider';
import { HIT_SLOP, NATIVE_RADIUS } from '../theme/nativeTokens';
import { Icon } from '../components/Icon';
import type { IconName } from '@hazardnet/design-system';

export interface ChipProps {
  label: string;
  selected?: boolean;
  severity?: 'severe' | 'warning' | 'watch' | 'allClear' | 'info' | null;
  disabled?: boolean;
  leadingIcon?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export const Chip: React.FC<ChipProps> = ({ label, selected = false, severity = null, disabled = false, leadingIcon, onPress, style, accessibilityLabel }) => {
  const { theme } = useTheme();
  const severityColor = severity
    ? severity === 'info' ? theme.colors.interactive : theme.colors[severity]
    : theme.colors.hairline;
  const selectedSurface = severity
    ? severity === 'info' ? theme.colors.bannerInfo : theme.colors[`${severity}Bg` as keyof typeof theme.colors] as string
    : theme.colors.surfaceTint;
  const bg = selected ? selectedSurface : 'transparent';
  const borderColor = selected ? severityColor : theme.colors.hairline;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT_SLOP}
      disabled={disabled || !onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => ({
        minHeight: 32,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderWidth: theme.borderWidths.hairline,
        borderColor,
        backgroundColor: bg,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        borderRadius: NATIVE_RADIUS.pill,
      })}
    >
      <HStack space={leadingIcon ? 6 : 0} align="center">
        {leadingIcon ?? null}
        <Text role="caption" weight={selected ? '600' : '500'} color={selected ? 'textPrimary' : 'textSecondary'}>
          {label}
        </Text>
      </HStack>
    </Pressable>
  );
};

/** SeverityBadge — compact filled label with a registered icon and status word. */
export const SeverityBadge: React.FC<{
  level: 'SEVERE' | 'WARNING' | 'WATCH' | 'NO_ALERT';
  size?: 'sm' | 'md';
}> = ({ level, size = 'md' }) => {
  const { theme } = useTheme();
  const cfg: { bg: string; fg: string; word: string; icon: IconName } = level === 'SEVERE'
    ? { bg: theme.colors.severeSolid, fg: theme.colors.severeOnSolid, word: 'Severe', icon: 'AlertTriangle' }
    : level === 'WARNING'
      ? { bg: theme.colors.warningSolid, fg: theme.colors.warningOnSolid, word: 'Warning', icon: 'AlertTriangle' }
      : level === 'WATCH'
        ? { bg: theme.colors.watchSolid, fg: theme.colors.watchOnSolid, word: 'Watch', icon: 'Eye' }
        : { bg: theme.colors.allClearSolid, fg: theme.colors.allClearOnSolid, word: 'All clear', icon: 'CheckCircle2' };
  const padY = size === 'sm' ? 2 : 4;
  const padX = size === 'sm' ? 6 : 10;
  return (
    <Box px={padX} py={padY} bg={cfg.bg} radius={theme.radius.chip} accessibilityLabel={`Severity: ${cfg.word}`} accessibilityRole="text">
      <HStack space={6} align="center">
        <Icon name={cfg.icon} size="meta" color={cfg.fg} />
        <Text role={size === 'sm' ? 'metadata' : 'caption'} weight="700" color={cfg.fg}>
          {cfg.word.toUpperCase()}
        </Text>
      </HStack>
    </Box>
  );
};
