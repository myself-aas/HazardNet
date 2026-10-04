/**
 * Native Meridian button primitive.
 *
 * Primary navigation actions use Meridian ink; blue is reserved for on-page
 * interaction; crimson is reserved for danger. Compact labels can use a smaller
 * type role, but every visible button keeps a 48dp minimum target and is free
 * to grow for Dynamic Type.
 */

import React from 'react';
import { Pressable, PressableProps, StyleSheet, ViewStyle, View } from 'react-native';
import { Box } from './primitives';
import { Text } from './Text';
import { useTheme } from '../theme/ThemeProvider';
import { HIT_SLOP, NATIVE_RADIUS, TOUCH_MIN } from '../theme/nativeTokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'severity';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  style?: ViewStyle;
  /** For variant='severity', which alert status should supply the fill and ink? */
  severity?: 'severe' | 'warning' | 'watch' | 'allClear';
  /** Optional accessibility label override. */
  accessibilityLabel?: string;
}

export const BUTTON_HEIGHTS: Record<ButtonSize, number> = {
  sm: TOUCH_MIN,
  md: TOUCH_MIN,
  lg: 56,
};

const PADDING_X: Record<ButtonSize, number> = { sm: 12, md: 16, lg: 24 };
const PADDING_Y: Record<ButtonSize, number> = { sm: 8, md: 10, lg: 12 };

export const Button: React.FC<ButtonProps> = ({
  label,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  style,
  severity,
  accessibilityLabel,
  ...pressableProps
}) => {
  const { theme } = useTheme();
  const statusColors = theme.colors as Record<string, string>;
  const severityFill = severity ? statusColors[`${severity}Solid`] : undefined;
  const severityInk = severity ? statusColors[`${severity}OnSolid`] : undefined;

  const bg =
    variant === 'primary' ? theme.colors.primaryAction :
    variant === 'danger' ? theme.colors.dangerAction :
    variant === 'secondary' ? theme.colors.secondaryAction :
    variant === 'severity' && severity ? severityFill :
    'transparent';

  const fg =
    variant === 'ghost' ? theme.colors.interactive :
    variant === 'primary' ? theme.colors.primaryActionText :
    variant === 'danger' ? theme.colors.dangerActionText :
    variant === 'secondary' ? theme.colors.textPrimary :
    variant === 'severity' && severity ? severityInk :
    theme.colors.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, busy: loading }}
      hitSlop={HIT_SLOP}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: BUTTON_HEIGHTS[size],
          paddingHorizontal: PADDING_X[size],
          paddingVertical: PADDING_Y[size],
          backgroundColor: bg,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
          borderWidth: variant === 'ghost' ? 0 : StyleSheet.hairlineWidth,
          borderColor: variant === 'secondary' ? theme.colors.hairline : 'transparent',
        },
        style,
      ]}
      {...pressableProps}
    >
      <View style={styles.row}>
        {leadingIcon ? <Box pr={8}>{leadingIcon}</Box> : null}
        <Text
          role={size === 'lg' ? 'title3' : size === 'sm' ? 'subhead' : 'callout'}
          weight="600"
          color={fg}
          align="center"
          style={styles.label}
        >
          {loading ? '…' : label}
        </Text>
        {trailingIcon ? <Box pl={8}>{trailingIcon}</Box> : null}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    minWidth: TOUCH_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: NATIVE_RADIUS.pill,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  label: {
    flexShrink: 1,
  },
});
