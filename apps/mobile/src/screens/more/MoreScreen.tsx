/**
 * More tab — secondary destinations (Phase 7).
 *
 *   - Submit report (camera / library pick + offline queue)
 *   - Data status
 *   - Notification settings
 *   - Accessibility
 *   - About / Methodology / Privacy / Contact (in-app article reader)
 */

import React from 'react';
import { Pressable } from 'react-native';
import { safeOpenUrl } from '../../lib/security/openUrl';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../components/Screen';
import { Box, VStack, HStack, Divider } from '../../design-system/primitives';
import { Title1, Body, Caption, Metadata } from '../../design-system/Text';
import { Card } from '../../design-system/Card';
import { Chip } from '../../design-system/Chip';
import { useTheme } from '../../theme/ThemeProvider';
import { useLocale } from '../../hooks/useLocale';
import { ARTICLE_INDEX } from '../../components/articles/ArticleReader';
import { EMERGENCY_CONTACTS } from '@hazardnet/core';
import { Icon } from '../../components/Icon';
import type { IconName } from '@hazardnet/design-system';

// `icon` is an IconName, never an emoji: emoji cannot take the theme colour, differ per OEM, and
// are silent to screen readers (audit P1-8). The names come from the shared registry, so the same
// glyph is used on web.
interface RowProps { label: string; subtitle?: string; icon?: IconName; onPress?: () => void; }
const Row: React.FC<RowProps> = ({ label, subtitle, icon, onPress }) => {
  const { theme } = useTheme();
  const { t } = useLocale();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${label}. ${subtitle}` : label}
      accessibilityHint={t('more.openHint')}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
    >
      <HStack space={12} align="center" py={14}>
        {icon ? (
          <Icon name={icon} size="nav" color={theme.colors.textMuted} />
        ) : (
          <Body color="textMuted">›</Body>
        )}
        <Box flex={1}>
          <Body>{label}</Body>
          {subtitle ? <Caption color="textMuted">{subtitle}</Caption> : null}
        </Box>
        <Metadata color="textMuted">›</Metadata>
      </HStack>
    </Pressable>
  );
};

const ARTICLE_TITLE_KEYS: Record<string, 'article.about' | 'article.methodology' | 'article.privacy' | 'article.contact'> = {
  about: 'article.about',
  methodology: 'article.methodology',
  privacy: 'article.privacy',
  contact: 'article.contact',
};

export function MoreScreen() {
  const nav = useNavigation<any>();
  const { t } = useLocale();
  return (
    <Screen>
      <Box px={16} py={12}>
        <VStack space={16}>
          <HStack align="center" space={10}>
            <Title1>{t('more.more')}</Title1>
            <Chip label="Phase 7" severity="info" />
          </HStack>

          <Card padded={false}>
            <Box px={16}>
              <Row label={t('more.submit')} subtitle={t('more.submitSub')} icon="Camera" onPress={() => nav.navigate('SubmitReport')} />
              <Divider />
              <Row label={t('more.advisories')} subtitle={t('more.advisoriesSub')} icon="FileText" onPress={() => nav.navigate('Advisories')} />
              <Divider />
              <Row label={t('more.dataStatus')} subtitle={t('more.dataStatusSub')} icon="Database" onPress={() => nav.navigate('DataStatus')} />
              <Divider />
              <Row label={t('more.notifications')} subtitle={t('more.notificationsSub')} icon="Bell" onPress={() => nav.navigate('NotificationPreferences')} />
              <Divider />
              <Row label={t('more.accessibility')} subtitle={t('more.accessibilitySub')} icon="Contrast" onPress={() => nav.navigate('Accessibility')} />
            </Box>
          </Card>

          <Card padded={false}>
            <Box px={16}>
              {ARTICLE_INDEX.map((a, i) => (
                <React.Fragment key={a.id}>
                  {i > 0 ? <Divider /> : null}
                  <Row label={t(ARTICLE_TITLE_KEYS[a.id])} icon="Info" onPress={() => nav.navigate('Article', { id: a.id })} />
                </React.Fragment>
              ))}
            </Box>
          </Card>

          <Card padded={false}>
            <Box px={16}>
              {EMERGENCY_CONTACTS.slice(0, 3).map((c: any, i: number) => (
                <React.Fragment key={c.number}>
                  {i > 0 ? <Divider /> : null}
                  <Row
                    label={`${t('more.emergency')}: ${c.number}`}
                    icon="PhoneCall"
                    onPress={() => { safeOpenUrl('tel:' + c.number, 'emergency').catch(() => {}); }}
                  />
                </React.Fragment>
              ))}
              <Divider />
              <Row label={t('more.website')} icon="ExternalLink" onPress={() => { safeOpenUrl('https://hazardnet.live', 'web').catch(() => {}); }} />
            </Box>
          </Card>

          <Caption align="center" color="textMuted">
            {t('more.version')}
          </Caption>
        </VStack>
      </Box>
    </Screen>
  );
}
