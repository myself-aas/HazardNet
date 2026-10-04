/**
 * SearchBar — minimal platform-adaptive search input.
 *
 * Uses RN TextInput directly (no heavy dependency). iOS style: rounded grey
 * field with magnifier icon; Android style: filled search with leading icon.
 * The outer hit region clears the native touch floor while preserving a compact field.
 */

import React from 'react';
import { TextInput, ViewStyle, StyleProp, Platform, ReturnKeyTypeOptions } from 'react-native';
import { Box, HStack } from './primitives';
import { Icon } from '../components/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useSettingsStore } from '../state/settingsStore';
import { HIT_SLOP, NATIVE_FONT_SCALE_MAX, TOUCH_MIN } from '../theme/nativeTokens';

export interface SearchBarProps {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const SearchBar: React.FC<SearchBarProps> = ({ value, onChangeText, placeholder = 'Search', onSubmit, autoFocus = false, style }) => {
  const { theme, bodyFont } = useTheme();
  const largeText = useSettingsStore((state) => state.largeText);
  return (
    <HStack
      space={8}
      align="center"
      px={12}
      bg="surfaceTint"
      radius={Platform.select({ ios: 10, android: 4 })}
      style={[{ minHeight: 36, paddingVertical: 6 }, style as ViewStyle]}
    >
      <Icon name="Search" size="nav" color={theme.colors.textMuted} />
      <Box flex={1}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          accessibilityLabel={placeholder}
          maxFontSizeMultiplier={NATIVE_FONT_SCALE_MAX}
          placeholderTextColor={theme.colors.textMuted}
          autoFocus={autoFocus}
          hitSlop={HIT_SLOP}
          returnKeyType={'search' as ReturnKeyTypeOptions}
          onSubmitEditing={onSubmit}
          autoCorrect={false}
          autoCapitalize="none"
          style={{
            padding: 0,
            margin: 0,
            fontSize: theme.type.body.size * (largeText ? 1.2 : 1),
            color: theme.colors.textPrimary,
            minHeight: TOUCH_MIN - 12,
            fontFamily: bodyFont,
          }}
        />
      </Box>
    </HStack>
  );
};
