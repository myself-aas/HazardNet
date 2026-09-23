/**
 * Button primitive.
 *
 * Variants:
 *   - primary: filled NASA blue (main CTAs).
 *   - secondary: filled surface (less prominent).
 *   - ghost: text only, used for destructive or tertiary actions.
 *   - danger: red (for emergency Call 999 / destructive).
 *   - severity: filled severity color (SEVERE/WARNING/WATCH/CLEAR).
 *
 * All buttons enforce 48dp minimum height (NASA HDS square corners,
 * 2dp accent edges, ripple/press-feedback handled by Pressable on Android).
 */

import React from 'react';
import { Pressable, PressableProps, StyleSheet, ViewStyle, View } from 'react-native';
import { Box } from './primitives';
import { Text } from './Text';
import { useTheme } from '../theme/ThemeProvider';
import { HIT_SLOP, TOUCH_MIN } from '../theme/nativeTokens';

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
  /** For variant='severity', which severity color? */
  severity?: 'severe' | 'warning' | 'watch' | 'allClear';
  /** Optional accessibility label override. */
  accessibilityLabel?: string;
}

const HEIGHTS: Record<ButtonSize, number> = { sm: 36, md: TOUCH_MIN, lg: 56 };
const PADDING_X: Record<ButtonSize, number> = { sm: 12, md: 16, lg: 24 };

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
  const isSeverity = variant === 'severity';

  const bg =
    variant === 'primary' ? theme.colors.primaryAction :
    variant === 'danger' ? theme.colors.severe :
    variant === 'secondary' ? theme.colors.secondaryAction :
    isSeverity && severity ? theme.colors[severity] :
    'transparent';

  const fg =
    variant === 'ghost' ? theme.colors.primaryAction :
    isSeverity && severity && severity !== 'watch' ? theme.colors.textOnColor :
    isSeverity && severity === 'watch' ? theme.colors.textPrimary :
    variant === 'secondary' ? theme.colors.textPrimary :
    variant === 'primary' || variant === 'danger' ? theme.colors.textOnColor :
    theme.colors.textPrimary;

  const height = HEIGHTS[size];
  const px = PADDING_X[size];

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
          height,
          paddingHorizontal: px,
          backgroundColor: bg,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
          borderWidth: variant === 'ghost' ? 0 : StyleSheet.hairlineWidth,
          borderColor: variant === 'ghost' ? 'transparent' : theme.colors.hairline,
        },
        style,
      ]}
      {...pressableProps}
    >
      <View style={styles.row}>
        {leadingIcon ? <Box pr={8}>{leadingIcon}</Box> : null}
        <Text
          role={size === 'lg' ? 'title3' : 'callout'}
          weight="600"
          color={fg}
          align="center"
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
    borderRadius: 0, // NASA HDS — square
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
