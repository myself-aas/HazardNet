/**
 * SearchBar — minimal platform-adaptive search input.
 *
 * Uses RN TextInput directly (no heavy dependency). iOS style: rounded grey
 * field with magnifier icon; Android style: filled search with leading icon.
 * NASA HDS: 2dp radius on Android, square on iOS? We use 4dp on the inner
 * field (input-only, not cards/buttons) per standard search conventions.
 */

import React from 'react';
import { TextInput, ViewStyle, StyleProp, Platform, ReturnKeyTypeOptions } from 'react-native';
import { Box, HStack } from './primitives';
import { Text } from './Text';
import { useTheme } from '../theme/ThemeProvider';
import { HIT_SLOP, TOUCH_MIN } from '../theme/nativeTokens';

export interface SearchBarProps {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const SearchBar: React.FC<SearchBarProps> = ({ value, onChangeText, placeholder = 'Search', onSubmit, autoFocus = false, style }) => {
  const { theme } = useTheme();
  return (
    <HStack
      space={8}
      align="center"
      px={12}
      bg="surfaceTint"
      radius={Platform.select({ ios: 10, android: 4 })}
      style={[{ minHeight: 36, paddingVertical: 6 }, style as ViewStyle]}
    >
      <Text role="body" color="textMuted">⌕</Text>
      <Box flex={1}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
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
            fontSize: theme.type.body.size,
            color: theme.colors.textPrimary,
            minHeight: TOUCH_MIN - 12,
            fontFamily: Platform.select({ ios: 'SF Pro Text', android: 'Roboto' }),
          }}
        />
      </Box>
    </HStack>
  );
};
