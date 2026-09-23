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
import { Box, VStack, HStack } from '../../design-system/primitives';
import { Title1, DisplayLarge, Body, Caption } from '../../design-system/Text';
import { Button } from '../../design-system/Button';
import { useTheme } from '../../theme/ThemeProvider';
import { track } from '../../lib/telemetry';

const KEY = 'hazardnet:onboarding:v1';
const { width: SCREEN_W } = Dimensions.get('window');

interface Slide {
  emoji: string;
  headline: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    emoji: '⚠️',
    headline: 'Multi-hazard alerts for Bangladesh',
    body: 'HazardNet delivers warnings for floods, cyclones, cold waves, heat waves, nor\'westers, drought, and fire — across all 64 districts. Data loads offline so you are never without alerts.',
  },
  {
    emoji: 'ℹ️',
    headline: 'Not an official warning service',
    body: 'HazardNet supplements — not replaces — official bulletins from BMD, FFWC, DAE and local authorities. During emergencies follow official instructions and call 999.',
  },
  {
    emoji: '🔔',
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
            <DisplayLarge style={{ fontSize: 80, lineHeight: 96 }}>{slide.emoji}</DisplayLarge>
            <Title1>{slide.headline}</Title1>
            <Body color="textSecondary" style={{ fontSize: 17, lineHeight: 26 }}>{slide.body}</Body>
          </VStack>
        </Box>

        <Box px={24}>
          <HStack space={8} justify="center" py={16}>
            {SLIDES.map((_, i) => (
              <Box
                key={i}
                style={{
                  width: 8, height: 8, borderRadius: 4,
                  backgroundColor: i === idx ? theme.colors.primaryAction as string : theme.colors.hairline as string,
                }}
              />
            ))}
          </HStack>

          <VStack space={10}>
            <Button variant="primary" size="lg" label={isLast ? 'Get started' : 'Continue'} onPress={next} />
            <Pressable onPress={skip} accessibilityRole="button" style={({ pressed }) => ({ paddingVertical: 10, opacity: pressed ? 0.5 : 1 })}>
              <Caption align="center" color="textMuted">{isLast ? '' : 'Skip'}</Caption>
            </Pressable>
          </VStack>
        </Box>
      </Box>
    </Screen>
  );
}
