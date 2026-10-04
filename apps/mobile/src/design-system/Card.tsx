/**
 * Card primitive — shared Meridian card radius, hairline border, optional severity edge.
 *
 * Severity is paired with icon + text and never relies on color alone.
 */

import React from 'react';
import { View, ViewStyle, StyleProp, StyleSheet } from 'react-native';
import { Box, VStack } from './primitives';
import { Text } from './Text';
import { useTheme } from '../theme/ThemeProvider';
import { CARD_PADDING, NATIVE_RADIUS, SEVERITY_EDGE_WIDTH } from '../theme/nativeTokens';

export type CardSeverityEdge = null | 'severe' | 'warning' | 'watch' | 'allClear' | 'info';

export interface CardProps {
  children: React.ReactNode;
  edge?: CardSeverityEdge;
  dashed?: boolean;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  raised?: boolean;
  accessibleLabel?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  edge = null,
  dashed = false,
  style,
  padded = true,
  raised = false,
  accessibleLabel,
}) => {
  const { theme } = useTheme();
  const edgeColor = edge === 'severe' ? theme.colors.severeSolid
    : edge === 'warning' ? theme.colors.warningSolid
    : edge === 'watch' ? theme.colors.watchSolid
    : edge === 'allClear' ? theme.colors.allClearSolid
    : edge === 'info' ? theme.colors.interactive
    : 'transparent';
  const hairline = StyleSheet.hairlineWidth;
  return (
    <View
      accessibilityLabel={accessibleLabel}
      accessibilityRole="none"
      style={[
        {
          backgroundColor: raised ? theme.colors.surfaceRaised : theme.colors.surface,
          borderRadius: NATIVE_RADIUS.card,
          borderWidth: dashed ? 1 : hairline,
          borderColor: dashed ? edgeColor ?? theme.colors.hairline : theme.colors.hairline,
          borderStyle: dashed ? 'dashed' : 'solid',
          borderLeftWidth: edge ? SEVERITY_EDGE_WIDTH : (dashed ? 1 : hairline),
          borderLeftColor: edgeColor,
        },
        style,
      ]}
    >
      {padded ? <Box p={CARD_PADDING}>{children}</Box> : children}
    </View>
  );
};

/** Section — label above a card, used for grouped settings/info blocks. */
export const Section: React.FC<{ label?: string; children: React.ReactNode; edge?: CardSeverityEdge }> = ({ label, children, edge }) => (
  <VStack space={8}>
    {label ? <Text role="caption" color="textMuted" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Text> : null}
    <Card edge={edge} raised>{children}</Card>
  </VStack>
);
