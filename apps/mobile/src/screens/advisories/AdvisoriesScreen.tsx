/**
 * Advisories - the native face of the institutional protocols (audit backlog 11).
 *
 * This is the screen that makes the mobile client a real client: until now the protocols, the
 * phased response steps, the cultivar/input specs and the emergency contacts existed only on the
 * web surface, and the More tab's answer to that was a row that opened a browser. The data comes
 * from `@hazardnet/core`'s `SECTOR_ADVISORIES` - the same object the web page renders - so a
 * protocol edited once is edited on both platforms.
 *
 * Deliberately a *reader*, not a dashboard: the field use is "what do I do now", so the list is
 * ordered by sector, each row carries its lead authority and step count, and the detail screen
 * shows the phased protocol in order with the trigger thresholds that decide each phase.
 */

import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { SECTOR_ADVISORIES, type SectorAdvisoryData } from '@hazardnet/core';
import { Screen } from '../../components/Screen';
import { Box, VStack, HStack } from '../../design-system/primitives';
import { Title1, Title3, Body, Caption, Metadata } from '../../design-system/Text';
import { Card } from '../../design-system/Card';
import { Chip } from '../../design-system/Chip';
import { Icon } from '../../components/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { SCREEN_H_PADDING } from '../../theme/nativeTokens';

/** Stable order: the sectors as the dataset declares them, which is the order the SOD uses. */
const ADVISORIES: SectorAdvisoryData[] = Object.values(SECTOR_ADVISORIES);

function AdvisoryRow({ advisory }: { advisory: SectorAdvisoryData }) {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  return (
    <Card>
      <Pressable
        onPress={() => nav.navigate('AdvisoryDetail', { id: advisory.id })}
        accessibilityRole="button"
        accessibilityLabel={`${advisory.name}. ${advisory.badge}. ${advisory.leadAuthorities.join(', ')}. ${advisory.phasedProtocols.length} steps.`}
      >
        <VStack space={10}>
          <HStack space={12} align="center" justify="space-between">
            <HStack space={12} align="center" style={styles.flexOne}>
              <Icon name="FileText" size="nav" color={theme.colors.textSecondary} />
              <VStack space={2} style={styles.flexOne}>
                <Title3>{advisory.name}</Title3>
                <Caption color="textMuted">{advisory.code}</Caption>
              </VStack>
            </HStack>
            <Icon name="ChevronRight" size="control" color={theme.colors.textMuted} />
          </HStack>
          <Body color="textSecondary">{advisory.executiveSummary}</Body>
          <HStack space={8} align="center" style={styles.wrapRow}>
            <Chip label={advisory.badge} severity="info" />
            <Metadata color="textMuted">{advisory.phasedProtocols.length} steps</Metadata>
          </HStack>
          <Metadata color="textMuted">{advisory.leadAuthorities.join(' \u00b7 ')}</Metadata>
        </VStack>
      </Pressable>
    </Card>
  );
}

export function AdvisoriesScreen() {
  return (
    <Screen scroll={false} edges={['left', 'right', 'bottom']}>
      <FlashList
        data={ADVISORIES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Box px={SCREEN_H_PADDING} pb={12}>
            <AdvisoryRow advisory={item} />
          </Box>
        )}
        ListHeaderComponent={
          <Box px={SCREEN_H_PADDING} pt={12} pb={20}>
            <VStack space={6}>
              <Title1>Advisories</Title1>
              <Body color="textSecondary">
                Standing protocols by sector, with the trigger thresholds, machinery and inputs
                each phase calls for. Issued by the lead authorities named on each card.
              </Body>
            </VStack>
          </Box>
        }
        contentContainerStyle={styles.listContent}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  wrapRow: { flexWrap: 'wrap' },
  listContent: { paddingBottom: 24 },
});
