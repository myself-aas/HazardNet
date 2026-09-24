/**
 * AlertRow — list item for Alerts FlashList.
 *
 * Fixed height ~88dp, severity-colored left edge, non-color icon signal,
 * metadata line with timestamp + source + distance placeholder.
 * NASA HDS: square corners, hairline dividers, no card elevation.
 */

import React from 'react';
import { Pressable, ViewStyle, StyleProp } from 'react-native';
import { Box, HStack, VStack } from '../../design-system/primitives';
import { Text, BodyBold, Caption, Metadata } from '../../design-system/Text';
import { useTheme } from '../../theme/ThemeProvider';
import type { AlertItemType } from '@hazardnet/core';
import { severityForAlert, formatAge, formatTargetDate } from '../../lib/severity';
import { SEVERITY_EDGE_WIDTH } from '../../theme/nativeTokens';
import { useHaptics } from '../../hooks/useHaptics';

export interface AlertRowProps {
  alert: AlertItemType;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  /** Optional saved/unread dot. */
  unread?: boolean;
}

const ROW_HEIGHT = 88;

export const ALERT_ROW_HEIGHT = ROW_HEIGHT;

export const AlertRow: React.FC<AlertRowProps> = ({ alert, onPress, style, unread = false }) => {
  const { theme } = useTheme();
  const edgeName = severityForAlert(alert);
  const edgeColor = edgeName === 'info'
    ? theme.colors.primaryAction
    : (theme.colors as Record<string, string>)[edgeName];
  const { trigger } = useHaptics();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${alert.level} for ${alert.district_name}: ${alert.hazard_type}. ${Math.round(alert.severity_score * 100)}% severity. Target ${formatTargetDate(alert.target_date)}.`}
      onPress={() => { trigger('selection'); onPress(); }}
      style={({ pressed }) => ({
        minHeight: ROW_HEIGHT,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: pressed ? theme.colors.surfaceTint : theme.colors.background,
        borderLeftWidth: SEVERITY_EDGE_WIDTH,
        borderLeftColor: edgeColor,
      })}
    >
      <HStack space={12} align="flex-start">
        <Box pt={2}>
          <Text role="title2" weight="700" color={edgeColor}>{alert.level === 'SEVERE' ? '!' : alert.level === 'WARNING' ? '!' : '◉'}</Text>
        </Box>
        <VStack space={2} flex={1}>
          <HStack space={8} align="center">
            <BodyBold>{alert.district_name}</BodyBold>
            <Caption color="textMuted">· {alert.hazard_type}</Caption>
            {unread ? <Box w={6} h={6} bg={theme.colors.primaryAction as string} radius={3} /> : null}
          </HStack>
          <Caption color="textSecondary">
            {alert.level === 'SEVERE'
              ? 'Take action immediately.'
              : alert.level === 'WARNING'
              ? 'Prepare; follow official guidance.'
              : 'Monitor conditions.'}
          </Caption>
          <HStack space={8}>
            <Metadata color="textMuted">{formatAge(alert.published_at ?? alert.prediction_date)}</Metadata>
            <Metadata color="textMuted">·</Metadata>
            <Metadata color="textMuted">{Math.round(alert.severity_score * 100)}%</Metadata>
            <Metadata color="textMuted">·</Metadata>
            <Metadata color="textMuted">{formatTargetDate(alert.target_date)}</Metadata>
          </HStack>
        </VStack>
        <Metadata color="textMuted" style={{ paddingTop: 4 }}>›</Metadata>
      </HStack>
    </Pressable>
  );
};
