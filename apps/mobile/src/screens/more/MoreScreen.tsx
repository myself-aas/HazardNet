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
import { ARTICLE_INDEX } from '../../components/articles/ArticleReader';
import { EMERGENCY_CONTACTS } from '@hazardnet/core';

interface RowProps { label: string; subtitle?: string; icon?: string; onPress?: () => void; }
const Row: React.FC<RowProps> = ({ label, subtitle, icon = '›', onPress }) => {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
      <HStack space={12} align="center" py={14}>
        <Body>{icon}</Body>
        <Box flex={1}>
          <Body>{label}</Body>
          {subtitle ? <Caption color="textMuted">{subtitle}</Caption> : null}
        </Box>
        <Metadata color="textMuted">›</Metadata>
      </HStack>
    </Pressable>
  );
};

export function MoreScreen() {
  const nav = useNavigation<any>();
  return (
    <Screen>
      <Box px={16} py={12}>
        <VStack space={16}>
          <HStack align="center" space={10}>
            <Title1>More</Title1>
            <Chip label="Phase 7" severity="info" />
          </HStack>

          <Card padded={false}>
            <Box px={16}>
              <Row label="Submit field report" subtitle="Photo + caption + location; queues offline" icon="📷" onPress={() => nav.navigate('SubmitReport')} />
              <Divider />
              <Row label="Data status" subtitle="Cache age, source availability" icon="◐" onPress={() => nav.navigate('DataStatus')} />
              <Divider />
              <Row label="Notification settings" subtitle="Critical alerts, quiet hours, channels" icon="🔔" onPress={() => nav.navigate('NotificationPreferences')} />
              <Divider />
              <Row label="Accessibility" subtitle="Theme, large text, reduced motion, haptics" icon="◉" onPress={() => nav.navigate('Accessibility')} />
            </Box>
          </Card>

          <Card padded={false}>
            <Box px={16}>
              {ARTICLE_INDEX.map((a, i) => (
                <React.Fragment key={a.id}>
                  {i > 0 ? <Divider /> : null}
                  <Row label={a.title} icon="ⓘ" onPress={() => nav.navigate('Article', { id: a.id })} />
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
                    label={`${c.label}: ${c.number}`}
                    icon="☎"
                    onPress={() => { safeOpenUrl('tel:' + c.number, 'emergency').catch(() => {}); }}
                  />
                </React.Fragment>
              ))}
              <Divider />
              <Row label="Open hazardnet.live in browser" icon="↗" onPress={() => { safeOpenUrl('https://hazardnet.live', 'web').catch(() => {}); }} />
            </Box>
          </Card>

          <Caption align="center" color="textMuted">
            HazardNet Mobile v2.2.0 · Offline-first · On-device privacy
          </Caption>
        </VStack>
      </Box>
    </Screen>
  );
}
