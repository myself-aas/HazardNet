/**
 * AlertSwipeableRow — wraps AlertRow with right-to-left "Save" and
 * left-to-right "Share" swipe actions per mobile-design-thinking §360.
 *
 * Swipe actions on alerts are NEVER destructive (alerts are not deletable).
 * A visible CTA alternative is provided on the detail screen for both save
 * and share (mobile-accessibility §1101 — no gesture-only critical action).
 */

import React, { useCallback, useRef } from 'react';
import { Share, Text, View, Pressable } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { AlertRow, AlertRowProps } from './AlertRow';
import { useHaptics } from '../../hooks/useHaptics';

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
      await Share.share({ message: `${alert.level}: ${alert.hazard_type} — ${alert.district_name}` });
    } catch {
      // share failed; ignore
    }
    swipeRef.current?.close();
  }, [alert, trigger]);

  const renderRightActions = useCallback(() => (
    <SwipeAction label={saved ? 'Saved' : 'Save'} icon="★" bg={saved ? '#2e7d32' : '#1565c0'} onPress={handleSave} width={SWIPE_WIDTH} />
  ), [handleSave, saved]);

  const renderLeftActions = useCallback(() => (
    <SwipeAction label="Share" icon="↗" bg="#546e7a" onPress={handleShare} width={SWIPE_WIDTH} />
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

function SwipeAction({ label, icon, bg, onPress, width }: { label: string; icon: string; bg: string; onPress: () => void; width: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width, backgroundColor: bg, justifyContent: 'center', alignItems: 'center' }}
    >
      <Text style={{ color: '#fff', fontSize: 20, marginBottom: 4 }}>{icon}</Text>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
