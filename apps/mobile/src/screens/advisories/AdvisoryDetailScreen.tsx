/**
 * One sector advisory: the phased protocol, in order, with what triggers each phase.
 *
 * The web page prints this as a multi-page document; on a phone the useful form is a single
 * scannable column ordered by phase, so each step carries its phase, its timeline, the threshold
 * that starts it, and the lead agency - the four things a field officer has to be able to answer
 * without opening a PDF.
 */

import React from 'react';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { SECTOR_ADVISORIES } from '@hazardnet/core';
import { Screen } from '../../components/Screen';
import { Box, VStack, HStack, Divider } from '../../design-system/primitives';
import { Title1, Title3, Body, Caption, Metadata } from '../../design-system/Text';
import { Card } from '../../design-system/Card';
import { Chip } from '../../design-system/Chip';
import { ListEmptyState } from '../../design-system/EmptyState';
import { Icon } from '../../components/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import { SCREEN_H_PADDING } from '../../theme/nativeTokens';
import { safeOpenUrl } from '../../lib/security/openUrl';

const PHASE_LABEL: Record<string, string> = {
  'pre-disaster': 'Before the event',
  'during-event': 'During the event',
  'post-disaster': 'After the event',
};

const PHASE_ORDER = ['pre-disaster', 'during-event', 'post-disaster'];

export function AdvisoryDetailScreen() {
  const route = useRoute<any>();
  const { theme } = useTheme();
  const advisory = SECTOR_ADVISORIES[route.params?.id as string];

  if (!advisory) {
    return (
      <Screen>
        <Box px={SCREEN_H_PADDING} pt={32}>
          <ListEmptyState
            icon="FileText"
            headline="That advisory is not on this device"
            body="The advisory set ships with the app, so this usually means an old link. Open Advisories from the More tab."
          />
        </Box>
      </Screen>
    );
  }

  const steps = [...advisory.phasedProtocols].sort(
    (a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase),
  );

  return (
    <Screen>
      <Box px={SCREEN_H_PADDING} pt={8}>
        <VStack space={8}>
          <HStack space={10} align="center">
            <Icon name="ShieldCheck" size={22} color={theme.colors.textSecondary} />
            <VStack space={2} style={styles.flexOne}>
              <Title1>{advisory.name}</Title1>
              <Caption color="textMuted">{advisory.code}</Caption>
            </VStack>
          </HStack>

          <HStack space={8} align="center" style={styles.wrapRow}>
            <Chip label={advisory.badge} severity="info" />
            <Metadata color="textMuted">{advisory.sodReference}</Metadata>
          </HStack>

          <Body color="textSecondary">{advisory.executiveSummary}</Body>

          <Card>
            <VStack space={6}>
              <Title3>Why this sector</Title3>
              <Body color="textSecondary">{advisory.hazardVulnerabilitySummary}</Body>
              <Metadata color="textMuted">{advisory.leadAuthorities.join(' \u00b7 ')}</Metadata>
            </VStack>
          </Card>

          <Title3>Protocol, in order</Title3>
          {steps.map((step) => (
            <Card key={step.stepNumber}>
              <VStack space={8}>
                <HStack space={10} align="center" justify="space-between">
                  <HStack space={8} align="center" style={styles.flexOne}>
                    <Metadata color="textMuted">{step.stepNumber}</Metadata>
                    <Title3 style={styles.flexOne}>{step.title}</Title3>
                  </HStack>
                  <Chip label={PHASE_LABEL[step.phase] ?? step.phase} severity="info" />
                </HStack>

                <Metadata color="textMuted">
                  {step.timeline} - {step.leadAgency}
                </Metadata>
                <Body color="textSecondary">{step.detailedProtocol}</Body>

                <VStack space={4}>
                  <Caption color="textMuted">Starts when</Caption>
                  <Body>{step.triggerThreshold}</Body>
                </VStack>

                {step.technicalSpecs.length > 0 && (
                  <VStack space={4}>
                    <Caption color="textMuted">Specification</Caption>
                    {step.technicalSpecs.map((spec) => (
                      <HStack key={spec} space={8} align="flex-start">
                        <Icon name="Check" size="meta" color={theme.colors.textMuted} />
                        <Body color="textSecondary" style={styles.flexOne}>
                          {spec}
                        </Body>
                      </HStack>
                    ))}
                  </VStack>
                )}

                {step.equipmentNeeded.length > 0 && (
                  <VStack space={4}>
                    <Caption color="textMuted">Machinery and inputs</Caption>
                    {step.equipmentNeeded.map((item) => (
                      <HStack key={item} space={8} align="flex-start">
                        <Icon name="Layers" size="meta" color={theme.colors.textMuted} />
                        <Body color="textSecondary" style={styles.flexOne}>
                          {item}
                        </Body>
                      </HStack>
                    ))}
                  </VStack>
                )}

                {step.criticalWarning ? (
                  <HStack space={8} align="flex-start">
                    <Icon name="AlertTriangle" size="meta" color={theme.colors.warning} />
                    <Body style={styles.flexOne}>{step.criticalWarning}</Body>
                  </HStack>
                ) : null}
              </VStack>
            </Card>
          ))}

          {advisory.technicalSpecs.length > 0 && (
            <>
              <Title3>Cultivars and inputs</Title3>
              {advisory.technicalSpecs.map((spec) => (
                <Card key={spec.name}>
                  <VStack space={6}>
                    <Title3>{spec.name}</Title3>
                    <Metadata color="textMuted">
                      {spec.category} - {spec.toleranceLevel}
                    </Metadata>
                    <Body color="textSecondary">{spec.notes}</Body>
                    <Caption color="textMuted">Dosage</Caption>
                    <Body>{spec.recommendedDosage}</Body>
                    <Caption color="textMuted">Use for</Caption>
                    <Body>{spec.targetCondition}</Body>
                  </VStack>
                </Card>
              ))}
            </>
          )}

          {advisory.officialDocumentation.length > 0 && (
            <>
              <Title3>Source documents</Title3>
              {advisory.officialDocumentation.map((doc) => (
                <Card key={doc.url}>
                  <Pressable
                    onPress={() => safeOpenUrl(doc.url, 'advisory-doc')}
                    accessibilityRole="link"
                    accessibilityLabel={`${doc.title}, ${doc.issuingBody}`}
                  >
                    <VStack space={4}>
                      <HStack space={8} align="center" justify="space-between">
                        <Title3 style={styles.flexOne}>{doc.title}</Title3>
                        <Icon name="ExternalLink" size="meta" color={theme.colors.textMuted} />
                      </HStack>
                      <Metadata color="textMuted">
                        {doc.docType} - {doc.issuingBody}
                      </Metadata>
                      <Body color="textSecondary">{doc.description}</Body>
                    </VStack>
                  </Pressable>
                </Card>
              ))}
            </>
          )}

          {advisory.emergencyContacts.length > 0 && (
            <>
              <Title3>Who to call</Title3>
              {advisory.emergencyContacts.map((contact) => (
                <Card key={`${contact.agencyName}-${contact.hotline}`}>
                  <VStack space={6}>
                    <Title3>{contact.agencyName}</Title3>
                    <Metadata color="textMuted">
                      {contact.departmentOrCell} - {contact.roleOrDesignation}
                    </Metadata>
                    <Pressable
                      onPress={() => Linking.openURL(`tel:${contact.hotline.replace(/[^\d+]/g, '')}`)}
                      accessibilityRole="link"
                      accessibilityLabel={`Call ${contact.agencyName} on ${contact.hotline}`}
                    >
                      <HStack space={8} align="center">
                        <Icon name="PhoneCall" size="meta" color={theme.colors.interactive} />
                        <Body>{contact.hotline}</Body>
                      </HStack>
                    </Pressable>
                    {contact.landline ? (
                      <Metadata color="textMuted">Landline {contact.landline}</Metadata>
                    ) : null}
                    <Metadata color="textMuted">{contact.officialEmail}</Metadata>
                    <Metadata color="textMuted">{contact.address}</Metadata>
                  </VStack>
                </Card>
              ))}
            </>
          )}

          <Divider my={8} />
          <Metadata color="textMuted" align="center">
            Published reference. In an emergency, follow the instructions of the authority above.
          </Metadata>
        </VStack>
      </Box>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  wrapRow: { flexWrap: 'wrap' },
});
