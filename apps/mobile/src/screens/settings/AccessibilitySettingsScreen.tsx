/**
 * Accessibility settings — theme, language, text, motion, contrast, haptics.
 * Phase 8: expanded with Bangla (বাংলা) language picker, Increase Contrast,
 * and Bold Text toggles. System Dynamic Type integration lands alongside
 * the full accessibility audit in the next polish pass.
 */

import React, { useEffect } from 'react';
import { ScrollView } from 'react-native';
import { Screen } from '../../components/Screen';
import { Box, VStack, HStack } from '../../design-system/primitives';
import { Title1, Title3, Body, BodyBold, Caption } from '../../design-system/Text';
import { Card } from '../../design-system/Card';
import { Chip } from '../../design-system/Chip';
import { Switch } from '../../design-system/Switch';
import { useSettingsStore } from '../../state/settingsStore';
import { useLocale } from '../../hooks/useLocale';
import { SCREEN_H_PADDING } from '../../theme/nativeTokens';
import { useNavigation } from '@react-navigation/native';

export function AccessibilitySettingsScreen() {
  const nav = useNavigation<any>();
  const {
    theme, setTheme,
    locale, setLocale,
    hapticsEnabled, setHapticsEnabled,
    reducedMotion, setReducedMotion,
    largeText, setLargeText,
    increaseContrast, setIncreaseContrast,
    boldText, setBoldText,
  } = useSettingsStore();
  const { t } = useLocale();

  useEffect(() => { try { nav.setOptions({ title: t('a11y.title') }); } catch {} }, [nav, t]);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Box px={SCREEN_H_PADDING} py={16} flex={1}>
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
          <VStack space={16}>
            <Title1>{t('a11y.title')}</Title1>

            <Card>
              <VStack space={10}>
                <Title3>ভাষা / Language</Title3>
                <HStack space={8} style={{ flexWrap: 'wrap' }}>
                  <Chip label="English" selected={locale !== 'bn'} severity={locale !== 'bn' ? 'info' : null} onPress={() => setLocale('en')} />
                  <Chip label="বাংলা" selected={locale === 'bn'} severity={locale === 'bn' ? 'info' : null} onPress={() => setLocale('bn')} />
                </HStack>
                <Caption color="textMuted">Choose the language for buttons, labels, and emergency text. Alerts from official sources are shown in their published language.</Caption>
              </VStack>
            </Card>

            <Card>
              <VStack space={10}>
                <Title3>{t('a11y.theme')}</Title3>
                <HStack space={8} style={{ flexWrap: 'wrap' }}>
                  {([
                    { id: 'system', label: t('a11y.system') },
                    { id: 'light', label: t('a11y.light') },
                    { id: 'dark', label: t('a11y.dark') },
                    { id: 'oled', label: t('a11y.oled') },
                  ] as const).map((opt) => (
                    <Chip key={opt.id} label={opt.label} selected={theme === opt.id}
                      severity={theme === opt.id ? 'info' : null}
                      onPress={() => setTheme(opt.id)} />
                  ))}
                </HStack>
                <Caption color="textMuted">{t('a11y.oledBody')}</Caption>
              </VStack>
            </Card>

            <Card>
              <VStack space={10}>
                <Title3>Display</Title3>
                <HStack justify="space-between" align="center">
                  <VStack space={2} flex={1}>
                    <BodyBold>Bold Text</BodyBold>
                    <Caption color="textMuted">Use heavier font weights across the app.</Caption>
                  </VStack>
                  <Switch value={boldText} onValueChange={setBoldText} />
                </HStack>
                <HStack justify="space-between" align="center">
                  <VStack space={2} flex={1}>
                    <BodyBold>Increase contrast</BodyBold>
                    <Caption color="textMuted">Higher-contrast borders and text for legibility.</Caption>
                  </VStack>
                  <Switch value={increaseContrast} onValueChange={setIncreaseContrast} />
                </HStack>
                <HStack justify="space-between" align="center">
                  <VStack space={2} flex={1}>
                    <BodyBold>{t('a11y.largeText')}</BodyBold>
                    <Caption color="textMuted">{t('a11y.largeTextBody')}</Caption>
                  </VStack>
                  <Switch value={largeText} onValueChange={setLargeText} />
                </HStack>
                <HStack justify="space-between" align="center">
                  <VStack space={2} flex={1}>
                    <BodyBold>{t('a11y.reducedMotion')}</BodyBold>
                    <Caption color="textMuted">{t('a11y.reducedMotionBody')}</Caption>
                  </VStack>
                  <Switch value={reducedMotion} onValueChange={setReducedMotion} />
                </HStack>
                <HStack justify="space-between" align="center">
                  <VStack space={2} flex={1}>
                    <BodyBold>{t('a11y.haptics')}</BodyBold>
                    <Caption color="textMuted">{t('a11y.hapticsBody')}</Caption>
                  </VStack>
                  <Switch value={hapticsEnabled} onValueChange={setHapticsEnabled} />
                </HStack>
              </VStack>
            </Card>

            <Card>
              <VStack space={4}>
                <Title3>Coming soon</Title3>
                <Body color="textSecondary">
                  {t('a11y.vo')}{`\n`}
                  {t('a11y.dt')}{`\n`}
                  {t('a11y.contrast')}{`\n`}
                  {t('a11y.mapA11y')}{`\n`}
                  {t('a11y.bn')}
                </Body>
              </VStack>
            </Card>
          </VStack>
        </ScrollView>
      </Box>
    </Screen>
  );
}
