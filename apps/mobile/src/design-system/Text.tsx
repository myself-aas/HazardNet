/**
 * Text primitive for HazardNet Mobile.
 *
 * - Uses the platform system font (San Francisco on iOS, the installed system sans on Android).
 * - Respects system Dynamic Type / font scaling without an app-imposed maximum.
 * - Applies the app's Large Text and Bold Text accessibility preferences to every role.
 * - Provides semantic role presets (display, title, body, caption, metadata, mono).
 * - Accessible: combines with `accessibilityRole="text"`.
 */

import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet, StyleProp, TextStyle, Platform, AccessibilityRole } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { NATIVE_FONT_SCALE_MAX, TYPE_ROLES } from '../theme/nativeTokens';
import { useSettingsStore } from '../state/settingsStore';

export type TextRole = keyof typeof TYPE_ROLES;

export interface TextProps extends Omit<RNTextProps, 'role'> {
  role?: TextRole;
  color?: string;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
  size?: number;
  mono?: boolean;
  numberOfLines?: number;
  selectable?: boolean;
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

export const Text: React.FC<TextProps> = ({
  role = 'body',
  color,
  align,
  weight,
  size,
  mono = false,
  numberOfLines,
  selectable = false,
  style,
  children,
  ...rest
}) => {
  const { theme, bodyFont, monoFont } = useTheme();
  const largeText = useSettingsStore((state) => state.largeText);
  const boldText = useSettingsStore((state) => state.boldText);
  const preset = theme.type[role];
  const scale = largeText ? 1.2 : 1;
  const selectedWeight = weight ?? preset.weight;
  const resolvedWeight = boldText && Number(selectedWeight) < 600 ? '600' : selectedWeight;
  const resolvedColor = color
    ? (theme.colors as Record<string, string>)[color] ?? color
    : theme.colors.textPrimary;

  const base: TextStyle = {
    fontFamily: mono ? monoFont : bodyFont,
    fontSize: (size ?? preset.size) * scale,
    fontWeight: resolvedWeight,
    lineHeight: preset.lineHeight * scale,
    letterSpacing: preset.letterSpacing,
    color: resolvedColor,
    textAlign: align,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  };

  return (
    <RNText
      maxFontSizeMultiplier={NATIVE_FONT_SCALE_MAX}
      selectable={selectable}
      numberOfLines={numberOfLines}
      style={[base, style]}
      {...rest}
    >
      {children}
    </RNText>
  );
};

/** Shorthand exports for common roles. */
export const DisplayLarge: React.FC<Omit<TextProps, 'role'>> = (p) => <Text role="displayLarge" {...p} />;
export const DisplaySmall: React.FC<Omit<TextProps, 'role'>> = (p) => <Text role="displaySmall" {...p} />;
export const Title1: React.FC<Omit<TextProps, 'role'>> = (p) => <Text role="title1" {...p} />;
export const Title2: React.FC<Omit<TextProps, 'role'>> = (p) => <Text role="title2" {...p} />;
export const Title3: React.FC<Omit<TextProps, 'role'>> = (p) => <Text role="title3" {...p} />;
export const Body: React.FC<Omit<TextProps, 'role'>> = (p) => <Text role="body" {...p} />;
export const BodyBold: React.FC<Omit<TextProps, 'role'>> = (p) => <Text role="bodyBold" {...p} />;
export const Caption: React.FC<Omit<TextProps, 'role'>> = (p) => <Text role="caption" {...p} />;
export const Metadata: React.FC<Omit<TextProps, 'role'>> = (p) => <Text role="metadata" {...p} />;

export const styles = StyleSheet.create({});
