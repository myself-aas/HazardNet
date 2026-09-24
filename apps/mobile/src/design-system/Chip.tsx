/**
 * Chip — small interactive filter/hazard/CTA pill (NASA: 2dp radius, not rounded pill).
 */

import React from 'react';
import { Pressable, ViewStyle, StyleProp } from 'react-native';
import { Box, HStack } from './primitives';
import { Text } from './Text';
import { useTheme } from '../theme/ThemeProvider';
import { HIT_SLOP, TOUCH_MIN } from '../theme/nativeTokens';

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
  const severityColor = severity ? theme.colors[severity === 'info' ? 'primaryAction' : severity] : theme.colors.hairline;
  const bg = selected ? (severity ? theme.colors[`${severity}Bg` as keyof typeof theme.colors] as string : theme.colors.surfaceTint) : 'transparent';
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
        borderRadius: theme.radius.chip,
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

/** SeverityBadge — small colored block with word and icon, not interactive. */
export const SeverityBadge: React.FC<{
  level: 'SEVERE' | 'WARNING' | 'WATCH' | 'NO_ALERT';
  size?: 'sm' | 'md';
}> = ({ level, size = 'md' }) => {
  const { theme } = useTheme();
  const cfg = level === 'SEVERE' ? { bg: theme.colors.severe, fg: theme.colors.textOnColor, word: 'Severe', symbol: '!' }
    : level === 'WARNING' ? { bg: theme.colors.warning, fg: theme.colors.textOnColor, word: 'Warning', symbol: '!' }
    : level === 'WATCH' ? { bg: theme.colors.watch, fg: theme.colors.textPrimary, word: 'Watch', symbol: '◉' }
    : { bg: theme.colors.allClear, fg: theme.colors.textPrimary, word: 'All clear', symbol: '✓' };
  const padY = size === 'sm' ? 2 : 4;
  const padX = size === 'sm' ? 6 : 10;
  return (
    <Box px={padX} py={padY} bg={cfg.bg as string} radius={theme.radius.chip} accessibilityLabel={`Severity: ${cfg.word}`} accessibilityRole="text">
      {/* Color + symbol + word — three signals per the plan */}
      <Text
        role={size === 'sm' ? 'metadata' : 'caption'}
        weight="700"
        color={cfg.fg}
      >
        {cfg.symbol}  {cfg.word.toUpperCase()}
      </Text>
    </Box>
  );
};
