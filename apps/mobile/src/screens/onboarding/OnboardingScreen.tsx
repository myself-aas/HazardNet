/**
 * Onboarding carousel (Phase 9) — 3 skimmable slides, shown once on first
 * launch, dismissible. Persisted in AsyncStorage so it does not reappear.
 *
 * Screens (per the plan):
 *   1. What HazardNet does (multi-hazard early warnings for Bangladesh)
 *   2. It is NOT an official warning service — follow BMD/DAE and local authorities
 *   3. Save a place + enable notifications to get started
 */

import React, { useCallback, useState } from 'react';
import { Dimensions, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen } from '../../components/Screen';
import { NATIVE_RADIUS, TOUCH_MIN } from '../../theme/nativeTokens';
import { Box, VStack, HStack } from '../../design-system/primitives';
import { Title1, Body, Caption } from '../../design-system/Text';
import { Button } from '../../design-system/Button';
import { useTheme } from '../../theme/ThemeProvider';
import { track } from '../../lib/telemetry';
import { Icon } from '../../components/Icon';
import type { IconName } from '@hazardnet/design-system';

const KEY = 'hazardnet:onboarding:v1';
const { width: SCREEN_W } = Dimensions.get('window');

interface Slide {
  icon: IconName;
  iconTone: 'interactive' | 'severe';
  headline: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'CloudRain',
    iconTone: 'interactive',
    headline: 'Multi-hazard alerts for Bangladesh',
    body: 'HazardNet delivers warnings for floods, cyclones, cold waves, heat waves, nor\'westers, drought, and fire. Across all 64 districts. Data loads offline so you are never without alerts.',
  },
  {
    icon: 'ShieldAlert',
    iconTone: 'severe',
    headline: 'Not an official warning service',
    body: 'HazardNet supplements (never replaces) official bulletins from BMD, FFWC, DAE and local authorities. During emergencies follow official instructions and call 999.',
  },
  {
    icon: 'Bell',
    iconTone: 'interactive',
    headline: 'Save places, get alerts',
    body: 'Save home, work, and the places you care about to get alerts specific to them. Notifications appear on your lock screen. Your location stays on this device.',
  },
];

export async function hasSeenOnboarding(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(KEY)) === '1'; } catch { return false; }
}

async function markSeen() { try { await AsyncStorage.setItem(KEY, '1'); } catch {} }

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { theme } = useTheme();
  const [idx, setIdx] = useState(0);
  const isLast = idx === SLIDES.length - 1;
  const slide = SLIDES[Math.min(idx, SLIDES.length - 1)];

  const next = useCallback(() => {
    if (idx < SLIDES.length - 1) {
      setIdx(idx + 1);
      track({ name: 'screen.view', props: { screen: `onboarding.${idx + 1}` } });
    } else {
      track({ name: 'screen.view', props: { screen: 'onboarding.done' } });
      markSeen().finally(onDone);
    }
  }, [idx, onDone]);

  const skip = useCallback(() => {
    markSeen().finally(onDone);
  }, [onDone]);

  return (
    <Screen edges={['left', 'right', 'bottom']} bg="background">
      <Box flex={1} py={24}>
        <Box w={SCREEN_W} px={24} justify="center" flex={1}>
          <VStack space={24}>
            <Icon
              name={slide.icon}
              size={80}
              color={slide.iconTone === 'severe' ? theme.colors.severe : theme.colors.interactive}
            />
            <Title1>{slide.headline}</Title1>
            <Body color="textSecondary">{slide.body}</Body>
          </VStack>
        </Box>

        <Box px={24}>
          <HStack space={8} justify="center" py={16}>
            {SLIDES.map((_, i) => (
              <Box
                key={i}
                style={{
                  width: 8, height: 8, borderRadius: NATIVE_RADIUS.chip,
                  backgroundColor: i === idx ? theme.colors.interactive : theme.colors.hairline,
                }}
              />
            ))}
          </HStack>

          <VStack space={10}>
            <Button variant="primary" size="lg" label={isLast ? 'Get started' : 'Continue'} onPress={next} />
            {!isLast ? (
              <Pressable
                onPress={skip}
                accessibilityRole="button"
                accessibilityLabel="Skip onboarding"
                style={({ pressed }) => ({ minHeight: TOUCH_MIN, justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
              >
                <Caption align="center" color="textMuted">Skip</Caption>
              </Pressable>
            ) : null}
          </VStack>
        </Box>
      </Box>
    </Screen>
  );
}
