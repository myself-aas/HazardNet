/**
 * Switch — thin wrapper around react-native Switch so we can apply theme
 * colors consistently. Platform-native switch look preserved.
 */

import React from 'react';
import { Switch as RNSwitch, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export interface SwitchProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
}

export const Switch: React.FC<SwitchProps> = ({ value, onValueChange, disabled, accessibilityLabel }) => {
  const { theme } = useTheme();
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      trackColor={{ false: theme.colors.hairline, true: theme.colors.interactive }}
      thumbColor={value ? theme.colors.interactiveText : theme.colors.surface}
      ios_backgroundColor={theme.colors.hairline as string}
      style={styles.switch}
    />
  );
};

const styles = StyleSheet.create({
  switch: { transform: [{ scale: 1 }] },
});
