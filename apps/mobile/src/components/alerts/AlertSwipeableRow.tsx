/**
 * AlertSwipeableRow — wraps AlertRow with Save and Share swipe actions.
 *
 * Swipe actions are never destructive. Visible detail-screen controls remain
 * available, so saving or sharing is not gesture-only.
 */

import React, { useCallback, useRef } from 'react';
import { Share, Pressable } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { AlertRow, AlertRowProps } from './AlertRow';
import { useHaptics } from '../../hooks/useHaptics';
import { Icon } from '../Icon';
import { Text } from '../../design-system/Text';
import { useTheme } from '../../theme/ThemeProvider';
import type { IconName } from '@hazardnet/design-system';
import { TOUCH_MIN } from '../../theme/nativeTokens';

export interface AlertSwipeableRowProps extends AlertRowProps {
  onSave?: (id: string) => void;
  saved?: boolean;
}

const SWIPE_WIDTH = 88;

export const AlertSwipeableRow: React.FC<AlertSwipeableRowProps> = ({
  alert,
  onPress,
  onSave,
  saved = false,
  unread,
}) => {
  const swipeRef = useRef<Swipeable>(null);
  const { trigger } = useHaptics();

  const handleSave = useCallback(() => {
    trigger('confirmation');
    onSave?.(alert.id);
    swipeRef.current?.close();
  }, [alert.id, onSave, trigger]);

  const handleShare = useCallback(async () => {
    trigger('selection');
    try {
      await Share.share({ message: `${alert.level}: ${alert.hazard_type}, ${alert.district_name}` });
    } catch {
      // share failed; ignore
    }
    swipeRef.current?.close();
  }, [alert, trigger]);

  const renderRightActions = useCallback(() => (
    <SwipeAction
      label={saved ? 'Unsave' : 'Save'}
      accessibilityLabel={saved ? 'Remove alert from saved' : 'Save alert'}
      icon={saved ? 'BookmarkCheck' : 'Bookmark'}
      onPress={handleSave}
      width={SWIPE_WIDTH}
    />
  ), [handleSave, saved]);

  const renderLeftActions = useCallback(() => (
    <SwipeAction label="Share" accessibilityLabel="Share alert" icon="Share2" onPress={handleShare} width={SWIPE_WIDTH} />
  ), [handleShare]);

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      overshootRight={false}
      overshootLeft={false}
      rightThreshold={SWIPE_WIDTH * 0.6}
      leftThreshold={SWIPE_WIDTH * 0.6}
      onSwipeableOpen={() => trigger('selection')}
    >
      <AlertRow alert={alert} onPress={onPress} unread={unread} />
    </Swipeable>
  );
};

function SwipeAction({
  label,
  accessibilityLabel,
  icon,
  onPress,
  width,
}: {
  label: string;
  accessibilityLabel: string;
  icon: IconName;
  onPress: () => void;
  width: number;
}) {
  const { theme } = useTheme();
  const bg = theme.colors.interactive;
  const fg = theme.colors.interactiveOnColor;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ width, minHeight: TOUCH_MIN, paddingVertical: 8, backgroundColor: bg, justifyContent: 'center', alignItems: 'center' }}
    >
      <Icon name={icon} size={24} color={fg} />
      <Text role="caption" weight="600" color={fg}>{label}</Text>
    </Pressable>
  );
}
