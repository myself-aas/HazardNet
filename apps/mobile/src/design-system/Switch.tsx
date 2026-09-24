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
  accessibilityLabel?: string;
}

export const Switch: React.FC<SwitchProps> = ({ value, onValueChange, disabled, accessibilityLabel }) => {
  const { theme } = useTheme();
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ false: theme.colors.hairline as string, true: theme.colors.primaryAction as string }}
      thumbColor="#fff"
      ios_backgroundColor={theme.colors.hairline as string}
      style={styles.switch}
    />
  );
};

const styles = StyleSheet.create({
  switch: { transform: [{ scale: 1 }] },
});
