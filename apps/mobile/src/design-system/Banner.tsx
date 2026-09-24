/**
 * Status banner (offline/stale/delayed/partial/service-down).
 *
 * Rendered at the TOP of Today/Alerts/Map content when the DataState is
 * anything but loaded/loadedActive. Tap navigates to Data Status (More tab).
 */

import React from 'react';
import { Pressable } from 'react-native';
import { Box, HStack } from './primitives';
import { Text } from './Text';
import { useTheme } from '../theme/ThemeProvider';
import { BANNER_HEIGHT } from '../theme/nativeTokens';

export type BannerTone = 'info' | 'warning' | 'error' | 'success';

export interface BannerProps {
  tone: BannerTone;
  headline: string;
  body?: string;
  onPress?: () => void;
  icon?: string; // glyph
}

const TONE_TO_BG: Record<BannerTone, keyof ReturnType<typeof useTheme>['theme']['colors']> = {
  info: 'bannerInfo',
  warning: 'bannerWarning',
  error: 'bannerError',
  success: 'bannerSuccess',
};

const TONE_TO_TEXT: Record<BannerTone, keyof ReturnType<typeof useTheme>['theme']['colors']> = {
  info: 'textPrimary',
  warning: 'textPrimary',
  error: 'textPrimary',
  success: 'textPrimary',
};

export const Banner: React.FC<BannerProps> = ({ tone, headline, body, onPress, icon = '!' }) => {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${headline}${body ? '. ' + body : ''}`}
      onPress={onPress}
      disabled={!onPress}
      style={{
        minHeight: BANNER_HEIGHT,
        backgroundColor: theme.colors[TONE_TO_BG[tone]] as string,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.hairline,
      }}
    >
      <HStack space={10} align="flex-start" justify="flex-start">
        <Text role="title3" weight="700" color={TONE_TO_TEXT[tone] as string}>{icon}</Text>
        <Box flex={1}>
          <Text role="callout" weight="600" color={TONE_TO_TEXT[tone] as string}>{headline}</Text>
          {body ? <Text role="caption" color={TONE_TO_TEXT[tone] as string}>{body}</Text> : null}
        </Box>
      </HStack>
    </Pressable>
  );
};
