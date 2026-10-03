/**
 * ListEmptyState — used for empty lists, error states, zero-data states.
 *
 * Always has: icon glyph, bold headline, body copy, and 0–2 action buttons.
 */

import React from 'react';
import { HStack, VStack, Box } from './primitives';
import { Title2, Body } from './Text';
import { Button } from './Button';
import { Icon } from '../components/Icon';
import { useTheme } from '../theme/ThemeProvider';
import type { IconName } from '@hazardnet/design-system';

export interface EmptyStateProps {
  /** A name from the shared icon registry - never an emoji or a text character. */
  icon?: IconName;
  headline: string;
  body?: string;
  primaryAction?: { label: string; onPress: () => void };
  secondaryAction?: { label: string; onPress: () => void };
}

export const ListEmptyState: React.FC<EmptyStateProps> = ({ icon = 'Info', headline, body, primaryAction, secondaryAction }) => {
  const { theme } = useTheme();
  return (
  <Box px={24} py={48} align="center" justify="center" flex={1}>
    <VStack space={12} align="center">
      <Icon name={icon} size={48} color={theme.colors.textMuted} />
      <Title2 align="center">{headline}</Title2>
      {body ? <Body align="center" color="textSecondary">{body}</Body> : null}
      {(primaryAction || secondaryAction) ? (
        <VStack space={10} style={{ marginTop: 20, width: '100%' }}>
          {primaryAction ? <Button variant="primary" label={primaryAction.label} onPress={primaryAction.onPress} /> : null}
          {secondaryAction ? <Button variant="secondary" label={secondaryAction.label} onPress={secondaryAction.onPress} /> : null}
        </VStack>
      ) : null}
    </VStack>
  </Box>
  );
};
